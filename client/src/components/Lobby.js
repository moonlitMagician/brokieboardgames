import React from 'react';

function Lobby({ lobbyCode, players, player, onStartGame }) {
  const handleGameStart = (gameType) => {
    console.log('Attempting to start game:', gameType);
    if (onStartGame) {
      onStartGame(gameType);
    } else {
      console.error('onStartGame function not available');
    }
  };

  return (
    <div className="lobby">
      <h2>Lobby: {lobbyCode}</h2>
      
      <div className="players-list">
        <h3>Players ({players.length})</h3>
        {players.map((p) => (
          <div key={p.id} className="player">
            {p.name} {p.isHost && '(Host)'} {p.id === player?.id && '(You)'}
          </div>
        ))}
      </div>

      <div className="game-selection">
        <h3>Select Game</h3>
        {player?.isHost && (
          <div className="games">
            <button 
              onClick={() => handleGameStart('spyfall')}
              disabled={players.length < 3}
              className="game-button spyfall"
            >
              <div className="game-title">Spyfall 🕵️</div>
              <div className="game-description">Find the spy among you!</div>
              <div className="game-players">3-8 players</div>
            </button>
            
            <button 
              onClick={() => handleGameStart('mafia')}
              disabled={players.length < 4}
              className="game-button mafia"
            >
              <div className="game-title">Mafia 🔫</div>
              <div className="game-description">Town vs Mafia - Who will survive?</div>
              <div className="game-players">4-12 players</div>
            </button>
            
            <button 
              onClick={() => handleGameStart('objection')}
              disabled={players.length < 3}
              className="game-button objection"
            >
              <div className="game-title">Objection! ⚖️</div>
              <div className="game-description">Debate wild topics and object to arguments!</div>
              <div className="game-players">3-10 players</div>
            </button>
            
            <button 
              onClick={() => handleGameStart('codenames')}
              disabled={players.length < 4}
              className="game-button codenames"
            >
              <div className="game-title">Codenames 🔤</div>
              <div className="game-description">Team word association game with spies!</div>
              <div className="game-players">4-10 players</div>
            </button>
          </div>
        )}
        
        <div className="player-requirements">
          {players.length < 3 && <p>Need at least 3 players for Spyfall and Objection!</p>}
          {players.length === 3 && <p>Ready for Spyfall and Objection! Need 4+ for Mafia and Codenames.</p>}
          {players.length >= 4 && <p>Ready to play all games!</p>}
        </div>
        
        {!player?.isHost && (
          <div className="waiting-message">
            <p>Waiting for <strong>{players.find(p => p.isHost)?.name}</strong> (host) to start the game...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Lobby;