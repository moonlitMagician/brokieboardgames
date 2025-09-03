import React, { useState } from 'react';

function JoinLobby({ onCreateLobby, onJoinLobby }) {
  const [playerName, setPlayerName] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [mode, setMode] = useState('join'); // 'join' or 'create'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }

    if (mode === 'create') {
      onCreateLobby(playerName);
    } else {
      if (!lobbyCode.trim()) {
        alert('Please enter lobby code');
        return;
      }
      onJoinLobby(lobbyCode.toUpperCase(), playerName);
    }
  };

  return (
    <div className="join-lobby">
      <div className="mode-selector">
        <button 
          className={mode === 'join' ? 'active' : ''}
          onClick={() => setMode('join')}
        >
          Join Game
        </button>
        <button 
          className={mode === 'create' ? 'active' : ''}
          onClick={() => setMode('create')}
        >
          Create Game
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          maxLength={20}
        />
        
        {mode === 'join' && (
          <input
            type="text"
            placeholder="Enter lobby code"
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value)}
            maxLength={6}
          />
        )}
        
        <button type="submit">
          {mode === 'create' ? 'Create Lobby' : 'Join Lobby'}
        </button>
      </form>
    </div>
  );
}

export default JoinLobby;