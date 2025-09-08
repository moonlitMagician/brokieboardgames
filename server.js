const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// Import game modules
const SpyfallGame = require('./games/spyfall');
const MafiaGame = require('./games/mafia');
const ObjectionGame = require('./games/objection');
const CodenamesGame = require('./games/codenames');

const app = express();
const server = http.createServer(app);

// Environment-aware CORS configuration
const corsOrigin = process.env.NODE_ENV === 'production' 
  ? false  // In production, same origin only
  : ["http://localhost:3000", "http://localhost:3001"]; // In development, allow local origins

const io = socketIo(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors({
  origin: corsOrigin,
  credentials: false
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    activeLobbies: lobbies.size,
    connectedPlayers: players.size
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// In-memory storage
const lobbies = new Map();
const players = new Map(); // socketId -> player info
const activeGames = new Map(); // lobbyCode -> game instance

// Generate random lobby code
function generateLobbyCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Enhanced disconnect handling functions
function handleLobbyDisconnect(socketId, player, lobby) {
  console.log(`Handling lobby disconnect for ${player.name} (${socketId})`);
  
  // Remove player from lobby immediately
  lobby.players = lobby.players.filter(p => p.id !== socketId);
  
  // If host disconnects, make someone else host
  if (player.isHost && lobby.players.length > 0) {
    lobby.players[0].isHost = true;
    lobby.host = lobby.players[0].id;
    
    // Notify about new host
    io.to(player.lobbyCode).emit('hostChanged', {
      newHost: lobby.players[0],
      message: `${player.name} disconnected. ${lobby.players[0].name} is now the host.`
    });
  }
  
  // Delete empty lobbies
  if (lobby.players.length === 0) {
    console.log(`Deleting empty lobby: ${player.lobbyCode}`);
    lobbies.delete(player.lobbyCode);
  } else {
    // Notify remaining players
    io.to(player.lobbyCode).emit('playerDisconnected', {
      player: player,
      remainingPlayers: lobby.players.length
    });
    io.to(player.lobbyCode).emit('playersUpdate', lobby.players);
  }
  
  players.delete(socketId);
}

function handleGameDisconnect(socketId, player, lobby, activeGame, reason) {
  console.log(`Handling game disconnect for ${player.name} (${socketId}), reason: ${reason}`);
  
  // Different strategies based on disconnect reason
  const isTemporaryDisconnect = reason === 'transport close' || 
                               reason === 'transport error' || 
                               reason === 'ping timeout';
  
  if (isTemporaryDisconnect) {
    // Mark as temporarily away, don't remove immediately
    markPlayerAsAway(socketId, player, lobby, activeGame);
  } else {
    // Permanent disconnect - remove with game-specific handling
    handlePermanentDisconnect(socketId, player, lobby, activeGame);
  }
}

function markPlayerAsAway(socketId, player, lobby, activeGame) {
  console.log(`Marking ${player.name} as temporarily away`);
  
  // Mark player as away but keep in game
  const playerIndex = lobby.players.findIndex(p => p.id === socketId);
  if (playerIndex !== -1) {
    lobby.players[playerIndex].isAway = true;
    lobby.players[playerIndex].awayTime = Date.now();
  }
  
  // Notify other players
  io.to(player.lobbyCode).emit('playerAway', {
    player: player,
    message: `${player.name} is temporarily disconnected...`
  });
  
  // Set timeout to remove if they don't return
  setTimeout(() => {
    const currentPlayer = lobby.players.find(p => p.id === socketId);
    if (currentPlayer && currentPlayer.isAway) {
      console.log(`${player.name} didn't return, removing permanently`);
      handlePermanentDisconnect(socketId, player, lobby, activeGame);
    }
  }, 60000); // 1 minute timeout
}

function handlePermanentDisconnect(socketId, player, lobby, activeGame) {
  console.log(`Permanently removing ${player.name} from game`);
  
  // If voting, remove their vote
  if (lobby.votingActive) {
    lobby.gameVotes.delete(socketId);
  }
  
  // Use game-specific disconnect handling with error protection
  if (activeGame && typeof activeGame.handlePlayerDisconnect === 'function') {
    try {
      activeGame.handlePlayerDisconnect(socketId);
    } catch (error) {
      console.error('Error in game disconnect handler:', error);
      // Fallback: just remove player from lobby
      lobby.players = lobby.players.filter(p => p.id !== socketId);
    }
  } else {
    // No game-specific handler, just remove from lobby
    lobby.players = lobby.players.filter(p => p.id !== socketId);
  }
  
  // Handle host change
  if (player.isHost && lobby.players.length > 0) {
    lobby.players[0].isHost = true;
    lobby.host = lobby.players[0].id;
    
    io.to(player.lobbyCode).emit('hostChanged', {
      newHost: lobby.players[0],
      message: `${player.name} left the game. ${lobby.players[0].name} is now the host.`
    });
  }
  
  // Cleanup if empty
  if (lobby.players.length === 0) {
    console.log(`Cleaning up empty lobby: ${player.lobbyCode}`);
    lobbies.delete(player.lobbyCode);
    if (activeGame && typeof activeGame.cleanup === 'function') {
      try {
        activeGame.cleanup();
      } catch (error) {
        console.error('Error cleaning up game:', error);
      }
    }
    activeGames.delete(player.lobbyCode);
  } else {
    // Notify remaining players and update vote counts if voting
    io.to(player.lobbyCode).emit('playerDisconnected', {
      player: player,
      remainingPlayers: lobby.players.length
    });
    io.to(player.lobbyCode).emit('playersUpdate', lobby.players);
    
    // Update voting if active
    if (lobby.votingActive) {
      updateVoteCounts(player.lobbyCode);
    }
  }
  
  players.delete(socketId);
}

// Process game votes and determine winner
function processGameVotes(lobbyCode) {
  try {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || !lobby.votingActive) return;
    
    lobby.votingActive = false;
    lobby.gameState = 'waiting';
    
    // Count votes
    const voteCounts = {};
    lobby.availableGames.forEach(game => voteCounts[game] = 0);
    
    for (const vote of lobby.gameVotes.values()) {
      voteCounts[vote]++;
    }
    
    // Find winner (highest votes)
    let winningGame = null;
    let maxVotes = 0;
    let tiedGames = [];
    
    for (const [game, votes] of Object.entries(voteCounts)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        winningGame = game;
        tiedGames = [game];
      } else if (votes === maxVotes && votes > 0) {
        tiedGames.push(game);
      }
    }
    
    // Handle ties
    if (tiedGames.length > 1) {
      // Random selection from tied games
      winningGame = tiedGames[Math.floor(Math.random() * tiedGames.length)];
    }
    
    // If no votes, pick random available game
    if (!winningGame || maxVotes === 0) {
      winningGame = lobby.availableGames[Math.floor(Math.random() * lobby.availableGames.length)];
    }
    
    // Broadcast results
    io.to(lobbyCode).emit('gameVotingEnded', {
      winningGame: winningGame,
      votes: voteCounts,
      totalVotes: lobby.gameVotes.size,
      wasTie: tiedGames.length > 1
    });
    
    // Auto-start the winning game after 3 seconds
    setTimeout(() => {
      const currentLobby = lobbies.get(lobbyCode);
      if (currentLobby && currentLobby.gameState === 'waiting') {
        startSelectedGame(lobbyCode, winningGame);
      }
    }, 3000);
    
    console.log(`Voting ended in lobby ${lobbyCode}. Winner: ${winningGame} with ${maxVotes} votes`);
  } catch (error) {
    console.error('Error processing game votes:', error);
  }
}

// FIXED: Update vote counts and broadcast with individual player votes
function updateVoteCounts(lobbyCode) {
  try {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || !lobby.votingActive) return;
    
    // Calculate current vote counts
    const voteCounts = {};
    lobby.availableGames.forEach(game => voteCounts[game] = 0);
    
    for (const vote of lobby.gameVotes.values()) {
      voteCounts[vote]++;
    }
    
    // Send personalized updates to each player
    lobby.players.forEach(player => {
      const socket = io.sockets.sockets.get(player.id);
      if (socket) {
        socket.emit('gameVoteUpdate', {
          votes: voteCounts,
          totalVotes: lobby.gameVotes.size,
          totalPlayers: lobby.players.length,
          yourVote: lobby.gameVotes.get(player.id) || null // Individual vote tracking
        });
      }
    });
    
    // Check if everyone has voted
    if (lobby.gameVotes.size === lobby.players.length) {
      processGameVotes(lobbyCode);
    }
  } catch (error) {
    console.error('Error updating vote counts:', error);
  }
}

// Start the selected game
function startSelectedGame(lobbyCode, gameType) {
  try {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) return;
    
    lobby.gameState = 'playing';
    lobby.currentGame = gameType;
    
    // Initialize game based on type
    if (gameType === 'spyfall') {
      const game = new SpyfallGame(lobby, io);
      activeGames.set(lobbyCode, game);
      game.startGame();
    } else if (gameType === 'mafia') {
      const game = new MafiaGame(lobby, io);
      activeGames.set(lobbyCode, game);
      game.startGame();
    } else if (gameType === 'objection') {
      const game = new ObjectionGame(lobby, io);
      activeGames.set(lobbyCode, game);
      game.startGame();
    } else if (gameType === 'codenames') {
      const game = new CodenamesGame(lobby, io);
      activeGames.set(lobbyCode, game);
      game.startGame();
    }
    
    io.to(lobbyCode).emit('gameStarted', { 
      gameType
    });
    
    console.log(`Game ${gameType} auto-started in lobby ${lobbyCode}`);
  } catch (error) {
    console.error('Error starting selected game:', error);
    const lobby = lobbies.get(lobbyCode);
    if (lobby) {
      lobby.gameState = 'waiting';
      lobby.currentGame = null;
      io.to(lobbyCode).emit('error', 'Failed to start game');
    }
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Heartbeat handling
  socket.on('heartbeat', () => {
    // Client is alive, update last seen time if needed
    const player = players.get(socket.id);
    if (player) {
      player.lastSeen = Date.now();
    }
  });

  // Handle player minimized/returned events
  socket.on('playerMinimized', () => {
    const player = players.get(socket.id);
    if (player) {
      player.isMinimized = true;
    }
  });

  socket.on('playerReturned', () => {
    const player = players.get(socket.id);
    if (player) {
      player.isMinimized = false;
      // If they were marked as away, bring them back
      if (player.isAway) {
        player.isAway = false;
        const lobby = lobbies.get(player.lobbyCode);
        if (lobby) {
          io.to(player.lobbyCode).emit('playerReturned', {
            player: player,
            message: `${player.name} has returned!`
          });
        }
      }
    }
  });

  // Create lobby
  socket.on('createLobby', (playerName) => {
    try {
      const lobbyCode = generateLobbyCode();
      const lobby = {
        code: lobbyCode,
        host: socket.id,
        players: [],
        gameState: 'waiting', // waiting, voting, playing, finished
        currentGame: null,
        createdAt: Date.now(),
        // Voting system
        votingActive: false,
        gameVotes: new Map(), // playerId -> gameType
        availableGames: ['spyfall', 'mafia', 'objection', 'codenames']
      };
      
      const player = {
        id: socket.id,
        name: playerName,
        lobbyCode: lobbyCode,
        isHost: true,
        lastSeen: Date.now(),
        isAway: false,
        isMinimized: false
      };
      
      lobby.players.push(player);
      lobbies.set(lobbyCode, lobby);
      players.set(socket.id, player);
      
      socket.join(lobbyCode);
      socket.emit('lobbyCreated', { lobbyCode, player });
      io.to(lobbyCode).emit('playersUpdate', lobby.players);
      
      console.log(`Lobby ${lobbyCode} created by ${playerName}`);
    } catch (error) {
      console.error('Error creating lobby:', error);
      socket.emit('error', 'Failed to create lobby');
    }
  });

  // Join lobby
  socket.on('joinLobby', ({ lobbyCode, playerName }) => {
    try {
      const lobby = lobbies.get(lobbyCode);
      
      if (!lobby) {
        socket.emit('error', 'Lobby not found');
        return;
      }
      
      if (lobby.gameState === 'playing') {
        socket.emit('error', 'Game already in progress');
        return;
      }
      
      // Check if name is already taken
      if (lobby.players.some(p => p.name === playerName)) {
        socket.emit('error', 'Name already taken');
        return;
      }
      
      const player = {
        id: socket.id,
        name: playerName,
        lobbyCode: lobbyCode,
        isHost: false,
        lastSeen: Date.now(),
        isAway: false,
        isMinimized: false
      };
      
      lobby.players.push(player);
      players.set(socket.id, player);
      
      socket.join(lobbyCode);
      socket.emit('lobbyJoined', { lobbyCode, player });
      io.to(lobbyCode).emit('playersUpdate', lobby.players);
      
      console.log(`${playerName} joined lobby ${lobbyCode}`);
    } catch (error) {
      console.error('Error joining lobby:', error);
      socket.emit('error', 'Failed to join lobby');
    }
  });

  // Start game voting (host only)
  socket.on('startGameVoting', () => {
    try {
      const player = players.get(socket.id);
      if (!player || !player.isHost) {
        socket.emit('error', 'Only host can start voting');
        return;
      }
      
      const lobby = lobbies.get(player.lobbyCode);
      if (!lobby || lobby.gameState !== 'waiting') {
        socket.emit('error', 'Cannot start voting right now');
        return;
      }
      
      // Filter available games based on player count
      const playerCount = lobby.players.length;
      const availableGames = [];
      
      if (playerCount >= 3) {
        availableGames.push('spyfall', 'objection');
      }
      if (playerCount >= 4) {
        availableGames.push('mafia', 'codenames');
      }
      
      if (availableGames.length === 0) {
        socket.emit('error', 'Need at least 3 players to vote on games');
        return;
      }
      
      lobby.gameState = 'voting';
      lobby.votingActive = true;
      lobby.availableGames = availableGames;
      lobby.gameVotes.clear();
      lobby.votingStartTime = Date.now();
      
      io.to(player.lobbyCode).emit('gameVotingStarted', {
        availableGames: availableGames,
        playerCount: playerCount
      });
      
      // Auto-end voting after 60 seconds
      setTimeout(() => {
        const currentLobby = lobbies.get(player.lobbyCode);
        if (currentLobby && currentLobby.votingActive) {
          processGameVotes(player.lobbyCode);
        }
      }, 60000);
      
      console.log(`Game voting started in lobby ${player.lobbyCode}`);
    } catch (error) {
      console.error('Error starting game voting:', error);
      socket.emit('error', 'Failed to start voting');
    }
  });

  // FIXED: Cast vote for game with proper individual tracking
  socket.on('voteForGame', ({ gameType }) => {
    try {
      const player = players.get(socket.id);
      if (!player) return;
      
      const lobby = lobbies.get(player.lobbyCode);
      if (!lobby || !lobby.votingActive) {
        socket.emit('error', 'No active voting');
        return;
      }
      
      if (!lobby.availableGames.includes(gameType)) {
        socket.emit('error', 'Invalid game selection');
        return;
      }
      
      // Record the vote
      lobby.gameVotes.set(socket.id, gameType);
      
      // Update and broadcast vote counts to everyone (including individual votes)
      updateVoteCounts(player.lobbyCode);
      
      console.log(`${player.name} voted for ${gameType} in lobby ${player.lobbyCode}`);
    } catch (error) {
      console.error('Error processing vote:', error);
      socket.emit('error', 'Failed to process vote');
    }
  });

  // End voting early (host only)
  socket.on('endGameVoting', () => {
    try {
      const player = players.get(socket.id);
      if (!player || !player.isHost) {
        socket.emit('error', 'Only host can end voting');
        return;
      }
      
      processGameVotes(player.lobbyCode);
    } catch (error) {
      console.error('Error ending voting:', error);
      socket.emit('error', 'Failed to end voting');
    }
  });

  // Start game directly (original method)
  socket.on('startGame', ({ gameType }) => {
    try {
      const player = players.get(socket.id);
      if (!player || !player.isHost) {
        socket.emit('error', 'Only host can start games');
        return;
      }
      
      const lobby = lobbies.get(player.lobbyCode);
      if (!lobby) {
        socket.emit('error', 'Lobby not found');
        return;
      }
      
      // Check minimum players for each game
      if (gameType === 'spyfall' && lobby.players.length < 3) {
        socket.emit('error', 'Need at least 3 players for Spyfall');
        return;
      }
      
      if (gameType === 'mafia' && lobby.players.length < 4) {
        socket.emit('error', 'Need at least 4 players for Mafia');
        return;
      }
      
      if (gameType === 'objection' && lobby.players.length < 3) {
        socket.emit('error', 'Need at least 3 players for Objection!');
        return;
      }
      
      if (gameType === 'codenames' && lobby.players.length < 4) {
        socket.emit('error', 'Need at least 4 players for Codenames');
        return;
      }
      
      startSelectedGame(player.lobbyCode, gameType);
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', 'Failed to start game');
    }
  });

  // Enhanced disconnect handling
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);
    
    const player = players.get(socket.id);
    if (player) {
      const lobby = lobbies.get(player.lobbyCode);
      if (lobby) {
        // Handle different disconnect scenarios
        const activeGame = activeGames.get(player.lobbyCode);
        
        // If in lobby or voting (not playing), remove immediately
        if (lobby.gameState === 'waiting' || lobby.gameState === 'voting') {
          handleLobbyDisconnect(socket.id, player, lobby);
          return;
        }
        
        // If game is active, use graceful degradation
        if (lobby.gameState === 'playing' && activeGame) {
          handleGameDisconnect(socket.id, player, lobby, activeGame, reason);
          return;
        }
      }
      
      // Fallback cleanup if lobby not found
      players.delete(socket.id);
    }
  });

  // Generic game event relay (for future games)
  socket.on('gameEvent', (data) => {
    try {
      const player = players.get(socket.id);
      if (!player) return;
      
      const activeGame = activeGames.get(player.lobbyCode);
      if (activeGame && typeof activeGame.handleGameEvent === 'function') {
        activeGame.handleGameEvent(socket, player, data);
      }
    } catch (error) {
      console.error('Error handling game event:', error);
    }
  });
});

// Periodic cleanup of inactive lobbies and connections
const CLEANUP_INTERVAL = 300000; // 5 minutes
const INACTIVE_TIMEOUT = 900000; // 15 minutes

setInterval(() => {
  const now = Date.now();
  console.log('Running periodic cleanup...');
  
  for (const [code, lobby] of lobbies.entries()) {
    // Remove very old lobbies
    if (now - lobby.createdAt > INACTIVE_TIMEOUT) {
      console.log(`Removing inactive lobby: ${code}`);
      const activeGame = activeGames.get(code);
      if (activeGame && typeof activeGame.cleanup === 'function') {
        try {
          activeGame.cleanup();
        } catch (error) {
          console.error('Error cleaning up old game:', error);
        }
      }
      lobbies.delete(code);
      activeGames.delete(code);
      continue;
    }
    
    // Clean up disconnected players in waiting lobbies
    if (lobby.gameState === 'waiting' || lobby.gameState === 'voting') {
      const connectedPlayers = lobby.players.filter(player => {
        const socket = io.sockets.sockets.get(player.id);
        return socket && socket.connected;
      });
      
      if (connectedPlayers.length !== lobby.players.length) {
        console.log(`Cleaning up disconnected players in lobby ${code}`);
        lobby.players = connectedPlayers;
        
        if (lobby.players.length === 0) {
          lobbies.delete(code);
        } else {
          // Ensure someone is host
          if (!lobby.players.some(p => p.isHost)) {
            lobby.players[0].isHost = true;
            lobby.host = lobby.players[0].id;
          }
          
          // Update voting if active
          if (lobby.votingActive) {
            // Remove votes from disconnected players
            const connectedIds = new Set(lobby.players.map(p => p.id));
            for (const [playerId] of lobby.gameVotes) {
              if (!connectedIds.has(playerId)) {
                lobby.gameVotes.delete(playerId);
              }
            }
            updateVoteCounts(code);
          }
          
          io.to(code).emit('playersUpdate', lobby.players);
        }
      }
    }
  }
  
  // Clean up orphaned players
  for (const [socketId, player] of players.entries()) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket || !socket.connected) {
      console.log(`Cleaning up orphaned player: ${player.name} (${socketId})`);
      players.delete(socketId);
    }
  }
  
  console.log(`Cleanup complete. Active lobbies: ${lobbies.size}, Connected players: ${players.size}`);
}, CLEANUP_INTERVAL);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Notify all players of shutdown
  io.emit('serverShutdown', { message: 'Server is restarting. Please refresh your browser in a moment.' });
  
  // Clean up active games
  for (const [code, game] of activeGames.entries()) {
    if (typeof game.cleanup === 'function') {
      try {
        game.cleanup();
      } catch (error) {
        console.error('Error cleaning up game during shutdown:', error);
      }
    }
  }
  
  server.close(() => {
    console.log('Process terminated');
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit in production, just log
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, just log
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎮 Active lobbies: ${lobbies.size}`);
  console.log(`👥 Connected players: ${players.size}`);
});