import React, { useState, useEffect } from 'react';
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
  ? window.location.origin  // Use same origin in production
  : 'http://localhost:3001'; // Use localhost in development

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'], // Ensure compatibility
  upgrade: true,
  rememberUpgrade: true
});

function App() {
  const [gameState, setGameState] = useState('menu'); // menu, lobby, playing
  const [player, setPlayer] = useState(null);
  const [lobbyCode, setLobbyCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    // Connection status listeners
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
      setConnectionStatus('connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionStatus('error');
    });

    // Game event listeners
    socket.on('lobbyCreated', ({ lobbyCode, player }) => {
      console.log('Lobby created - lobbyCode:', lobbyCode, 'player:', player);
      setLobbyCode(lobbyCode);
      setPlayer(player);
      setGameState('lobby');
    });

    socket.on('lobbyJoined', ({ lobbyCode, player }) => {
      console.log('Lobby joined - lobbyCode:', lobbyCode, 'player:', player);
      setLobbyCode(lobbyCode);
      setPlayer(player);
      setGameState('lobby');
    });

    socket.on('playersUpdate', (updatedPlayers) => {
      console.log('Players updated:', updatedPlayers);
      setPlayers(updatedPlayers);
    });

    socket.on('gameStarted', ({ gameType, gameData }) => {
      console.log('Game started:', gameType, gameData);
      setCurrentGame(gameType);
      setGameData(gameData);
      setGameState('playing');
    });

    socket.on('error', (message) => {
      console.error('Socket error:', message);
      alert(message);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('lobbyCreated');
      socket.off('lobbyJoined');
      socket.off('playersUpdate');
      socket.off('gameStarted');
      socket.off('error');
    };
  }, []);

  const createLobby = (playerName) => {
    console.log('Creating lobby with player name:', playerName);
    socket.emit('createLobby', playerName);
  };

  const joinLobby = (lobbyCode, playerName) => {
    console.log('Joining lobby:', lobbyCode, 'with player name:', playerName);
    socket.emit('joinLobby', { lobbyCode, playerName });
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
  };

  // Show connection status
  const renderConnectionStatus = () => {
    if (connectionStatus === 'connected') return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: connectionStatus === 'connecting' ? '#f39c12' : '#e74c3c',
        color: 'white',
        padding: '10px',
        textAlign: 'center',
        zIndex: 9999
      }}>
        {connectionStatus === 'connecting' && 'Connecting to server...'}
        {connectionStatus === 'disconnected' && 'Disconnected from server. Trying to reconnect...'}
        {connectionStatus === 'error' && 'Connection error. Please refresh the page.'}
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
            Socket URL: {SOCKET_URL}<br/>
            State: {gameState}<br/>
            Player: {player?.name}<br/>
            Is Host: {player?.isHost ? 'YES' : 'NO'}<br/>
            Lobby: {lobbyCode}<br/>
            Players: {players.length}<br/>
            Game: {currentGame || 'None'}
          </div>
        )}
        
        {renderCurrentScreen()}
      </header>
    </div>
  );
}

export default App;