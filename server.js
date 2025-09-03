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
  allowEIO3: true
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
    environment: process.env.NODE_ENV || 'development'
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
const playerSessions = new Map(); // persistentId -> player session data
const disconnectedPlayers = new Map(); // persistentId -> disconnect timestamp

// Generate random codes
function generateLobbyCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generatePersistentId() {
  return Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
}

// Cleanup disconnected players after 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  for (const [persistentId, disconnectTime] of disconnectedPlayers.entries()) {
    if (disconnectTime < fiveMinutesAgo) {
      console.log(`Cleaning up expired session: ${persistentId}`);
      playerSessions.delete(persistentId);
      disconnectedPlayers.delete(persistentId);
    }
  }
}, 60000); // Check every minute

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle reconnection attempts
  socket.on('attemptReconnection', ({ persistentId, playerName }) => {
    console.log(`Reconnection attempt: ${persistentId} (${playerName})`);
    
    const session = playerSessions.get(persistentId);
    if (!session) {
      socket.emit('reconnectionFailed', 'Session not found or expired');
      return;
    }

    const lobby = lobbies.get(session.lobbyCode);
    if (!lobby) {
      socket.emit('reconnectionFailed', 'Lobby no longer exists');
      playerSessions.delete(persistentId);
      disconnectedPlayers.delete(persistentId);
      return;
    }

    // Update player with new socket ID
    const playerIndex = lobby.players.findIndex(p => p.persistentId === persistentId);
    if (playerIndex === -1) {
      socket.emit('reconnectionFailed', 'Player not found in lobby');
      return;
    }

    // Restore player connection
    const player = lobby.players[playerIndex];
    const oldSocketId = player.id;
    player.id = socket.id;
    player.connected = true;
    
    // Update mappings
    players.delete(oldSocketId);
    players.set(socket.id, player);
    
    // Join socket to lobby room
    socket.join(session.lobbyCode);
    
    // Remove from disconnected list
    disconnectedPlayers.delete(persistentId);
    
    // Handle game-specific reconnection
    const activeGame = activeGames.get(session.lobbyCode);
    if (activeGame && typeof activeGame.handlePlayerReconnection === 'function') {
      try {
        activeGame.handlePlayerReconnection(oldSocketId, socket.id, player);
      } catch (error) {
        console.error('Error handling game reconnection:', error);
      }
    }

    console.log(`Player ${playerName} reconnected to lobby ${session.lobbyCode}`);
    
    // Send successful reconnection
    socket.emit('reconnectionSuccessful', {
      lobbyCode: session.lobbyCode,
      player: player,
      gameState: lobby.gameState,
      currentGame: lobby.currentGame
    });
    
    // Notify other players
    io.to(session.lobbyCode).emit('playersUpdate', lobby.players);
    io.to(session.lobbyCode).emit('playerReconnected', { 
      playerName: player.name,
      message: `${player.name} reconnected` 
    });
  });

  // Create lobby
  socket.on('createLobby', ({ playerName, persistentId }) => {
    const lobbyCode = generateLobbyCode();
    const newPersistentId = persistentId || generatePersistentId();
    
    const lobby = {
      code: lobbyCode,
      host: socket.id,
      players: [],
      gameState: 'waiting',
      currentGame: null
    };
    
    const player = {
      id: socket.id,
      persistentId: newPersistentId,
      name: playerName,
      lobbyCode: lobbyCode,
      isHost: true,
      connected: true
    };
    
    lobby.players.push(player);
    lobbies.set(lobbyCode, lobby);
    players.set(socket.id, player);
    
    // Store session
    playerSessions.set(newPersistentId, {
      lobbyCode: lobbyCode,
      playerName: playerName,
      isHost: true
    });
    
    socket.join(lobbyCode);
    socket.emit('lobbyCreated', { lobbyCode, player });
    io.to(lobbyCode).emit('playersUpdate', lobby.players);
  });

  // Join lobby
  socket.on('joinLobby', ({ lobbyCode, playerName, persistentId }) => {
    const lobby = lobbies.get(lobbyCode);
    
    if (!lobby) {
      socket.emit('error', 'Lobby not found');
      return;
    }
    
    if (lobby.gameState === 'playing') {
      socket.emit('error', 'Game already in progress');
      return;
    }
    
    // Check if name is already taken by a connected player
    if (lobby.players.some(p => p.name === playerName && p.connected)) {
      socket.emit('error', 'Name already taken');
      return;
    }
    
    const newPersistentId = persistentId || generatePersistentId();
    
    const player = {
      id: socket.id,
      persistentId: newPersistentId,
      name: playerName,
      lobbyCode: lobbyCode,
      isHost: false,
      connected: true
    };
    
    lobby.players.push(player);
    players.set(socket.id, player);
    
    // Store session
    playerSessions.set(newPersistentId, {
      lobbyCode: lobbyCode,
      playerName: playerName,
      isHost: false
    });
    
    socket.join(lobbyCode);
    socket.emit('lobbyJoined', { lobbyCode, player });
    io.to(lobbyCode).emit('playersUpdate', lobby.players);
  });

  // Start game
  socket.on('startGame', ({ gameType }) => {
    const player = players.get(socket.id);
    if (!player || !player.isHost) return;
    
    const lobby = lobbies.get(player.lobbyCode);
    if (!lobby) return;
    
    // Check minimum players for each game (only count connected players)
    const connectedPlayers = lobby.players.filter(p => p.connected);
    
    if (gameType === 'spyfall' && connectedPlayers.length < 3) {
      socket.emit('error', 'Need at least 3 players for Spyfall');
      return;
    }
    
    if (gameType === 'mafia' && connectedPlayers.length < 4) {
      socket.emit('error', 'Need at least 4 players for Mafia');
      return;
    }
    
    if (gameType === 'objection' && connectedPlayers.length < 3) {
      socket.emit('error', 'Need at least 3 players for Objection!');
      return;
    }
    
    if (gameType === 'codenames' && connectedPlayers.length < 4) {
      socket.emit('error', 'Need at least 4 players for Codenames');
      return;
    }
    
    lobby.gameState = 'playing';
    lobby.currentGame = gameType;
    
    // Initialize game based on type
    try {
      if (gameType === 'spyfall') {
        const game = new SpyfallGame(lobby, io);
        activeGames.set(player.lobbyCode, game);
        game.startGame();
      } else if (gameType === 'mafia') {
        const game = new MafiaGame(lobby, io);
        activeGames.set(player.lobbyCode, game);
        game.startGame();
      } else if (gameType === 'objection') {
        const game = new ObjectionGame(lobby, io);
        activeGames.set(player.lobbyCode, game);
        game.startGame();
      } else if (gameType === 'codenames') {
        const game = new CodenamesGame(lobby, io);
        activeGames.set(player.lobbyCode, game);
        game.startGame();
      }
      
      io.to(player.lobbyCode).emit('gameStarted', { 
        gameType
      });
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', 'Failed to start game');
      lobby.gameState = 'waiting';
      lobby.currentGame = null;
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      const lobby = lobbies.get(player.lobbyCode);
      if (lobby) {
        // Mark player as disconnected but don't remove immediately
        player.connected = false;
        disconnectedPlayers.set(player.persistentId, Date.now());
        
        console.log(`Player ${player.name} disconnected, session preserved for 5 minutes`);
        
        // Notify other players of disconnection
        io.to(player.lobbyCode).emit('playerDisconnected', { 
          playerName: player.name,
          message: `${player.name} disconnected` 
        });
        io.to(player.lobbyCode).emit('playersUpdate', lobby.players);
        
        // Handle game-specific disconnection
        const activeGame = activeGames.get(player.lobbyCode);
        if (activeGame && typeof activeGame.handlePlayerDisconnect === 'function') {
          try {
            activeGame.handlePlayerDisconnect(socket.id);
          } catch (error) {
            console.error('Error handling player disconnect:', error);
          }
        }
        
        // If host disconnects, transfer host to next connected player
        if (player.isHost) {
          const nextHost = lobby.players.find(p => p.connected && p.id !== socket.id);
          if (nextHost) {
            nextHost.isHost = true;
            lobby.host = nextHost.id;
            // Update session
            const session = playerSessions.get(nextHost.persistentId);
            if (session) {
              session.isHost = true;
            }
            io.to(player.lobbyCode).emit('newHost', { 
              newHost: nextHost.name,
              message: `${nextHost.name} is now the host` 
            });
          }
        }
        
        // If no connected players left, clean up lobby after delay
        const connectedPlayers = lobby.players.filter(p => p.connected);
        if (connectedPlayers.length === 0) {
          console.log(`No connected players in lobby ${player.lobbyCode}, will cleanup if no reconnections`);
          setTimeout(() => {
            const currentLobby = lobbies.get(player.lobbyCode);
            if (currentLobby && currentLobby.players.filter(p => p.connected).length === 0) {
              console.log(`Cleaning up empty lobby: ${player.lobbyCode}`);
              lobbies.delete(player.lobbyCode);
              const activeGame = activeGames.get(player.lobbyCode);
              if (activeGame && typeof activeGame.cleanup === 'function') {
                try {
                  activeGame.cleanup();
                } catch (error) {
                  console.error('Error cleaning up game:', error);
                }
              }
              activeGames.delete(player.lobbyCode);
              
              // Clean up sessions for this lobby
              for (const [persistentId, session] of playerSessions.entries()) {
                if (session.lobbyCode === player.lobbyCode) {
                  playerSessions.delete(persistentId);
                  disconnectedPlayers.delete(persistentId);
                }
              }
            }
          }, 2 * 60 * 1000); // 2 minutes delay
        }
      }
      players.delete(socket.id);
    }
  });

  // Generic game event relay
  socket.on('gameEvent', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const activeGame = activeGames.get(player.lobbyCode);
    if (activeGame && typeof activeGame.handleGameEvent === 'function') {
      try {
        activeGame.handleGameEvent(socket, player, data);
      } catch (error) {
        console.error('Error handling game event:', error);
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎮 Active lobbies: ${lobbies.size}`);
  console.log(`👥 Connected players: ${players.size}`);
  console.log(`💾 Stored sessions: ${playerSessions.size}`);
});