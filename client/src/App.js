import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import './App.css';

// Components
import JoinLobby from './components/JoinLobby';
import Lobby from './components/Lobby';
import SpyfallGame from './components/SpyfallGame';
import MafiaGame from './components/MafiaGame';
import ObjectionGame from './components/ObjectionGame';
import CodenamesGame from './components/CodenamesGame';

// Environment-aware socket connection
const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin
  : 'http://localhost:3001';

// Generate persistent ID for player
function generatePersistentId() {
  return Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
}

// Storage helpers
const STORAGE_KEYS = {
  PERSISTENT_ID: 'party_games_persistent_id',
  PLAYER_DATA: 'party_games_player_data',
  LOBBY_DATA: 'party_games_lobby_data'
};

function App() {
  const [gameState, setGameState] = useState('menu');
  const [player, setPlayer] = useState(null);
  const [lobbyCode, setLobbyCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [reconnectionStatus, setReconnectionStatus] = useState(null);
  const [socket, setSocket] = useState(null);

  // Initialize socket and handle reconnection
  const initializeSocket = useCallback(() => {
    if (socket) {
      socket.disconnect();
    }

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: true
    });

    setSocket(newSocket);
    return newSocket;
  }, [socket]);

  // Attempt reconnection
  const attemptReconnection = useCallback((currentSocket) => {
    const persistentId = localStorage.getItem(STORAGE_KEYS.PERSISTENT_ID);
    const playerData = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYER_DATA) || '{}');
    const lobbyData = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOBBY_DATA) || '{}');

    if (persistentId && playerData.name && lobbyData.code) {
      console.log('Attempting reconnection...', { persistentId, playerName: playerData.name, lobbyCode: lobbyData.code });
      setReconnectionStatus('attempting');
      
      currentSocket.emit('attemptReconnection', {
        persistentId,
        playerName: playerData.name
      });
    }
  }, []);

  // Clear stored data
  const clearStoredData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.PLAYER_DATA);
    localStorage.removeItem(STORAGE_KEYS.LOBBY_DATA);
    setReconnectionStatus(null);
  }, []);

  // Save player data to localStorage
  const savePlayerData = useCallback((playerData, lobbyCode) => {
    if (playerData) {
      localStorage.setItem(STORAGE_KEYS.PLAYER_DATA, JSON.stringify({
        name: playerData.name,
        isHost: playerData.isHost
      }));
    }
    if (lobbyCode) {
      localStorage.setItem(STORAGE_KEYS.LOBBY_DATA, JSON.stringify({
        code: lobbyCode
      }));
    }
  }, []);

  useEffect(() => {
    // Get or create persistent ID
    let persistentId = localStorage.getItem(STORAGE_KEYS.PERSISTENT_ID);
    if (!persistentId) {
      persistentId = generatePersistentId();
      localStorage.setItem(STORAGE_KEYS.PERSISTENT_ID, persistentId);
    }

    const currentSocket = initializeSocket();

    // Connection status listeners
    currentSocket.on('connect', () => {
      console.log('Connected to server:', currentSocket.id);
      setConnectionStatus('connected');
      
      // Try to reconnect if we have stored data
      attemptReconnection(currentSocket);
    });

    currentSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setConnectionStatus('disconnected');
      setReconnectionStatus(null);
    });

    currentSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionStatus('error');
    });

    // Reconnection listeners
    currentSocket.on('reconnectionSuccessful', ({ lobbyCode, player, gameState: lobbyGameState, currentGame }) => {
      console.log('Reconnection successful!', { lobbyCode, player });
      setReconnectionStatus('successful');
      setLobbyCode(lobbyCode);
      setPlayer(player);
      setGameState(lobbyGameState === 'playing' ? 'playing' : 'lobby');
      setCurrentGame(currentGame);
      
      setTimeout(() => setReconnectionStatus(null), 3000);
    });

    currentSocket.on('reconnectionFailed', (reason) => {
      console.log('Reconnection failed:', reason);
      setReconnectionStatus('failed');
      clearStoredData();
      
      setTimeout(() => setReconnectionStatus(null), 5000);
    });

    // Game event listeners
    currentSocket.on('lobbyCreated', ({ lobbyCode, player }) => {
      console.log('Lobby created - lobbyCode:', lobbyCode, 'player:', player);
      setLobbyCode(lobbyCode);
      setPlayer(player);
      setGameState('lobby');
      savePlayerData(player, lobbyCode);
    });

    currentSocket.on('lobbyJoined', ({ lobbyCode, player }) => {
      console.log('Lobby joined - lobbyCode:', lobbyCode, 'player:', player);
      setLobbyCode(lobbyCode);
      setPlayer(player);
      setGameState('lobby');
      savePlayerData(player, lobbyCode);
    });

    currentSocket.on('playersUpdate', (updatedPlayers) => {
      console.log('Players updated:', updatedPlayers);
      setPlayers(updatedPlayers);
    });

    currentSocket.on('gameStarted', ({ gameType, gameData }) => {
      console.log('Game started:', gameType, gameData);
      setCurrentGame(gameType);
      setGameData(gameData);
      setGameState('playing');
    });

    currentSocket.on('playerDisconnected', ({ playerName, message }) => {
      console.log('Player disconnected:', message);
      // Could show a toast notification here
    });

    currentSocket.on('playerReconnected', ({ playerName, message }) => {
      console.log('Player reconnected:', message);
      // Could show a toast notification here
    });

    currentSocket.on('newHost', ({ newHost, message }) => {
      console.log('New host:', message);
      // Could show a toast notification here
    });

    currentSocket.on('error', (message) => {
      console.error('Socket error:', message);
      alert(message);
    });

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, [initializeSocket, attemptReconnection, clearStoredData, savePlayerData]);

  const createLobby = (playerName) => {
    console.log('Creating lobby with player name:', playerName);
    const persistentId = localStorage.getItem(STORAGE_KEYS.PERSISTENT_ID);
    socket.emit('createLobby', { playerName, persistentId });
  };

  const joinLobby = (lobbyCode, playerName) => {
    console.log('Joining lobby:', lobbyCode, 'with player name:', playerName);
    const persistentId = localStorage.getItem(STORAGE_KEYS.PERSISTENT_ID);
    socket.emit('joinLobby', { lobbyCode, playerName, persistentId });
  };

  const startGame = (gameType) => {
    console.log('Starting game:', gameType);
    console.log('Current player:', player);
    console.log('Is host:', player?.isHost);
    
    if (!player?.isHost) {
      console.error('Only host can start games');
      alert('Only the host can start games');
      return;
    }
    
    socket.emit('startGame', { gameType });
  };

  const goBackToMenu = () => {
    setGameState('menu');
    setPlayer(null);
    setLobbyCode('');
    setPlayers([]);
    setCurrentGame(null);
    setGameData(null);
    clearStoredData();
  };

  const forceReconnect = () => {
    setReconnectionStatus('attempting');
    attemptReconnection(socket);
  };

  // Show connection status
  const renderConnectionStatus = () => {
    if (connectionStatus === 'connected' && !reconnectionStatus) return null;
    
    let statusColor = '#f39c12'; // yellow for connecting
    let statusText = 'Connecting to server...';
    
    if (connectionStatus === 'disconnected') {
      statusColor = '#e74c3c'; // red for disconnected
      statusText = 'Disconnected from server. Attempting to reconnect...';
    } else if (connectionStatus === 'error') {
      statusColor = '#e74c3c';
      statusText = 'Connection error. Please refresh the page.';
    }
    
    if (reconnectionStatus === 'attempting') {
      statusColor = '#3498db'; // blue for reconnecting
      statusText = 'Reconnecting to your game...';
    } else if (reconnectionStatus === 'successful') {
      statusColor = '#27ae60'; // green for success
      statusText = 'Successfully reconnected!';
    } else if (reconnectionStatus === 'failed') {
      statusColor = '#e74c3c';
      statusText = 'Reconnection failed. Session may have expired.';
    }

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: statusColor,
        color: 'white',
        padding: '10px',
        textAlign: 'center',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{statusText}</span>
        {(connectionStatus === 'disconnected' || reconnectionStatus === 'failed') && (
          <button 
            onClick={forceReconnect}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.5)',
              color: 'white',
              padding: '5px 10px',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  };

  const renderCurrentScreen = () => {
    switch (gameState) {
      case 'menu':
        return (
          <JoinLobby 
            onCreateLobby={createLobby}
            onJoinLobby={joinLobby}
          />
        );
      case 'lobby':
        return (
          <div>
            <button 
              onClick={goBackToMenu}
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                padding: '10px 15px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              ← Back to Menu
            </button>
            <Lobby
              lobbyCode={lobbyCode}
              players={players}
              player={player}
              onStartGame={startGame}
            />
          </div>
        );
      case 'playing':
        return (
          <div>
            <button 
              onClick={goBackToMenu}
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                padding: '10px 15px',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              ← Leave Game
            </button>
            {currentGame === 'spyfall' && (
              <SpyfallGame
                socket={socket}
                player={player}
                players={players}
                gameData={gameData}
              />
            )}
            {currentGame === 'mafia' && (
              <MafiaGame
                socket={socket}
                player={player}
                players={players}
                gameData={gameData}
              />
            )}
            {currentGame === 'objection' && (
              <ObjectionGame
                socket={socket}
                player={player}
                players={players}
                gameData={gameData}
              />
            )}
            {currentGame === 'codenames' && (
              <CodenamesGame
                socket={socket}
                player={player}
                players={players}
                gameData={gameData}
              />
            )}
            {!['spyfall', 'mafia', 'objection', 'codenames'].includes(currentGame) && (
              <div>Game "{currentGame}" not implemented yet</div>
            )}
          </div>
        );
      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <div className="App">
      {renderConnectionStatus()}
      
      <header className="App-header">
        <h1>Party Games</h1>
        
        {/* Debug info - only show in development */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            fontSize: '12px',
            maxWidth: '200px',
            zIndex: 1000
          }}>
            <strong>Debug Info:</strong><br/>
            Connection: {connectionStatus}<br/>
            Reconnection: {reconnectionStatus || 'none'}<br/>
            Socket URL: {SOCKET_URL}<br/>
            State: {gameState}<br/>
            Player: {player?.name}<br/>
            Is Host: {player?.isHost ? 'YES' : 'NO'}<br/>
            Lobby: {lobbyCode}<br/>
            Players: {players.length}<br/>
            Game: {currentGame || 'None'}<br/>
            Persistent ID: {localStorage.getItem(STORAGE_KEYS.PERSISTENT_ID)?.substr(-4)}
          </div>
        )}
        
        {renderCurrentScreen()}
      </header>
    </div>
  );
}

export default App;