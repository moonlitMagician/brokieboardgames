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
  transports: ['websocket', 'polling'], // Ensure compatibility
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
  // Serve the built React app
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  // Handle React routing, return all requests to React app
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create lobby
  socket.on('createLobby', (playerName) => {
    const lobbyCode = generateLobbyCode();
    const lobby = {
      code: lobbyCode,
      host: socket.id,
      players: [],
      gameState: 'waiting', // waiting, playing, finished
      currentGame: null
    };
    
    const player = {
      id: socket.id,
      name: playerName,
      lobbyCode: lobbyCode,
      isHost: true
    };
    
    lobby.players.push(player);
    lobbies.set(lobbyCode, lobby);
    players.set(socket.id, player);
    
    socket.join(lobbyCode);
    socket.emit('lobbyCreated', { lobbyCode, player });
    io.to(lobbyCode).emit('playersUpdate', lobby.players);
  });

  // Join lobby
  socket.on('joinLobby', ({ lobbyCode, playerName }) => {
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
      isHost: false
    };
    
    lobby.players.push(player);
    players.set(socket.id, player);
    
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
        // Handle game-specific disconnection
        const activeGame = activeGames.get(player.lobbyCode);
        if (activeGame && typeof activeGame.handlePlayerDisconnect === 'function') {
          try {
            activeGame.handlePlayerDisconnect(socket.id);
          } catch (error) {
            console.error('Error handling player disconnect:', error);
          }
        }
        
        // Remove player from lobby
        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        
        // If host disconnects, make someone else host
        if (player.isHost && lobby.players.length > 0) {
          lobby.players[0].isHost = true;
          lobby.host = lobby.players[0].id;
        }
        
        // Delete empty lobbies
        if (lobby.players.length === 0) {
          lobbies.delete(player.lobbyCode);
          // Cleanup active game
          if (activeGame && typeof activeGame.cleanup === 'function') {
            try {
              activeGame.cleanup();
            } catch (error) {
              console.error('Error cleaning up game:', error);
            }
          }
          activeGames.delete(player.lobbyCode);
        } else {
          io.to(player.lobbyCode).emit('playersUpdate', lobby.players);
        }
      }
      players.delete(socket.id);
    }
  });

  // Generic game event relay (for future games)
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
});