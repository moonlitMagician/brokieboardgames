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
  ? window.location.origin
  : 'http://localhost:3001';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
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
  const [showChangelog, setShowChangelog] = useState(false);

  // Changelog data
  const changelog = [
    {
      version: "v1.2.0",
      date: "2025-09-06",
      changes: [
        "Eliminated players can no longer object",
        "Fixed issue where objection win state wasn’t triggering",
        "Refinements to objection logic"
      ]
    },
    {
      version: "v1.1.0",
      date: "2025-09-05",
      changes: [
        "Added more NSFW topics",
        "Major fixes and improvements to objection system",
        "Optimized CSS for faster performance",
        "Refined CSS styling"
      ]
    },
    {
      version: "v1.0.2",
      date: "2025-09-04",
      changes: [
        "Fixed Spyfall role logic (spy role mix-up)",
        "Added new CSS elements for Spyfall",
        "Fixed extra CSS issues and Spyfall voting bug",
        "Fixed undefined 'first questioner' bug",
        "Several general fixes and changes",
        "Updated App.js and objection.js with improvements"
      ]
    },
    {
      version: "v1.0.1",
      date: "2025-09-03",
      changes: [
        "Initial updates and groundwork for objection system"
      ]
    }
  ];

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

  const renderChangelog = () => {
    if (!showChangelog) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000
      }}>
        <div style={{
          background: 'white',
          padding: '30px',
          borderRadius: '10px',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          color: '#333'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid #eee',
            paddingBottom: '10px'
          }}>
            <h2 style={{ margin: 0, color: '#2c3e50' }}>Changelog</h2>
            <button
              onClick={() => setShowChangelog(false)}
              style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ×
            </button>
          </div>

          {changelog.map((release, index) => (
            <div key={index} style={{
              marginBottom: '25px',
              padding: '15px',
              background: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px'
              }}>
                <h3 style={{
                  margin: 0,
                  color: '#2c3e50',
                  fontSize: '18px'
                }}>
                  {release.version}
                </h3>
                <span style={{
                  color: '#6c757d',
                  fontSize: '14px',
                  fontStyle: 'italic'
                }}>
                  {release.date}
                </span>
              </div>

              <ul style={{
                margin: 0,
                paddingLeft: '20px'
              }}>
                {release.changes.map((change, changeIndex) => (
                  <li key={changeIndex} style={{
                    marginBottom: '5px',
                    color: '#495057',
                    lineHeight: '1.4'
                  }}>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div style={{
            textAlign: 'center',
            marginTop: '20px',
            paddingTop: '15px',
            borderTop: '1px solid #dee2e6',
            color: '#6c757d',
            fontSize: '14px'
          }}>
            Visit the GitHub repository for complete development history
          </div>
        </div>
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
      // In App.js, update the lobby case in renderCurrentScreen():
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
              socket={socket}  // Add this line
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
      {renderChangelog()}

      <header className="App-header">
        <h1>Brokie Board Games</h1>
        <h3>Created by Daniel Da Silva</h3>
        <h5>Full Code Available At - "https://github.com/moonlitMagician/brokieboardgames"</h5>

        {/* Changelog Button */}
        <button
          onClick={() => setShowChangelog(true)}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px 20px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.3s ease',
            zIndex: 1000
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#2980b9';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#3498db';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          📋 Changelog
        </button>

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
            <strong>Debug Info:</strong><br />
            Connection: {connectionStatus}<br />
            State: {gameState}<br />
            Player: {player?.name}<br />
            Is Host: {player?.isHost ? 'YES' : 'NO'}<br />
            Lobby: {lobbyCode}<br />
            Players: {players.length}<br />
            Game: {currentGame || 'None'}
          </div>
        )}

        {renderCurrentScreen()}
      </header>
    </div>
  );
}

export default App;