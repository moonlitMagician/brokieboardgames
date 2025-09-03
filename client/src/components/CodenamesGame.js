import React, { useState, useEffect } from 'react';

function CodenamesGame({ socket, player, players }) {
  const [gameState, setGameState] = useState(null);
  const [clueWord, setClueWord] = useState('');
  const [clueNumber, setClueNumber] = useState(1);
  const [gameResult, setGameResult] = useState(null);

  useEffect(() => {
    // Request initial game state
    socket.emit('requestCodenamesState');

    // Game event listeners
    socket.on('codenamesGameState', (state) => {
      console.log('Codenames game state received:', state);
      setGameState(state);
    });

    socket.on('codenamesGameEnded', (result) => {
      setGameResult(result);
    });

    socket.on('error', (message) => {
      alert(message);
    });

    return () => {
      socket.off('codenamesGameState');
      socket.off('codenamesGameEnded');
      socket.off('error');
    };
  }, [socket]);

  const handleGiveClue = () => {
    if (!clueWord.trim() || clueNumber < 1 || clueNumber > 9) {
      alert('Please enter a valid clue word and number (1-9)');
      return;
    }
    
    socket.emit('codenamesClue', {
      word: clueWord.trim(),
      number: clueNumber
    });
    
    setClueWord('');
    setClueNumber(1);
  };

  const handleWordGuess = (wordIndex) => {
    socket.emit('codenamesGuess', { wordIndex });
  };

  const handleEndTurn = () => {
    socket.emit('codenamesEndTurn');
  };

  const renderTeamSection = (teamColor) => {
    const team = gameState?.teams[teamColor];
    if (!team) return null;

    const isCurrentTeam = gameState?.currentTeam === teamColor;
    const isPlayerTeam = gameState?.playerTeam === teamColor;

    return (
      <div className={`team-section ${teamColor} ${isCurrentTeam ? 'active-team' : ''}`}>
        <div className="team-header">
          <h3>{teamColor.toUpperCase()} TEAM</h3>
          <div className="team-score">
            {team.wordsFound} / {team.wordsTotal}
          </div>
          {isCurrentTeam && <div className="turn-indicator">← ACTIVE</div>}
        </div>
        
        <div className="spymaster">
          <strong>🕵️ Spymaster:</strong> {team.spymaster.name}
          {team.spymaster.id === player.id && <span className="you-indicator">(You)</span>}
        </div>
        
        <div className="operatives">
          <strong>🔍 Operatives:</strong>
          <div className="operative-list">
            {team.players
              .filter(p => p.id !== team.spymaster.id)
              .map(p => (
                <span key={p.id} className={`operative ${p.id === player.id ? 'you' : ''}`}>
                  {p.name}{p.id === player.id && ' (You)'}
                </span>
              ))
            }
          </div>
        </div>
      </div>
    );
  };

  const renderSpymasterView = () => {
    if (!gameState?.isSpymaster) return null;

    const isMyTurn = gameState.playerTeam === gameState.currentTeam;
    const hasGivenClue = gameState.currentClue !== null;

    return (
      <div className="spymaster-panel">
        <h4>🕵️ Spymaster Controls</h4>
        
        {isMyTurn && !hasGivenClue ? (
          <div className="clue-interface">
            <h5>Give your team a clue:</h5>
            <div className="clue-inputs">
              <input
                type="text"
                value={clueWord}
                onChange={(e) => setClueWord(e.target.value)}
                placeholder="One word clue..."
                maxLength={20}
                className="clue-word-input"
              />
              <select
                value={clueNumber}
                onChange={(e) => setClueNumber(parseInt(e.target.value))}
                className="clue-number-input"
              >
                {[1,2,3,4,5,6,7,8,9].map(num => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
              <button onClick={handleGiveClue} className="give-clue-btn">
                Give Clue
              </button>
            </div>
            <div className="clue-hint">
              Give a one-word clue and number indicating how many words relate to it.
            </div>
          </div>
        ) : (
          <div className="waiting-state">
            {hasGivenClue ? 
              "Wait for your operatives to guess..." : 
              `Wait for ${gameState.currentTeam.toUpperCase()} team's turn...`
            }
          </div>
        )}
      </div>
    );
  };

  const renderOperativeView = () => {
    if (gameState?.isSpymaster) return null;

    const isMyTurn = gameState.playerTeam === gameState.currentTeam;
    const hasClue = gameState.currentClue !== null;
    const canGuess = isMyTurn && hasClue && gameState.guessesRemaining > 0;

    return (
      <div className="operative-panel">
        <h4>🔍 Operative Controls</h4>
        
        {gameState.currentClue && (
          <div className="current-clue">
            <h5>Current Clue:</h5>
            <div className="clue-display">
              "{gameState.currentClue.word}" for {gameState.currentClue.number} words
            </div>
            <div className="guesses-remaining">
              Guesses remaining: {gameState.guessesRemaining}
            </div>
          </div>
        )}
        
        {canGuess ? (
          <div className="operative-actions">
            <p>Click a word on the grid to guess, or end your turn.</p>
            <button onClick={handleEndTurn} className="end-turn-btn">
              End Turn
            </button>
          </div>
        ) : (
          <div className="waiting-state">
            {!isMyTurn ? 
              `Wait for ${gameState.currentTeam.toUpperCase()} team's turn...` :
              !hasClue ? "Wait for your spymaster to give a clue..." :
              "No guesses remaining this turn."
            }
          </div>
        )}
      </div>
    );
  };

  const renderGrid = () => {
    if (!gameState?.grid) return null;

    const canGuess = !gameState.isSpymaster && 
                    gameState.playerTeam === gameState.currentTeam && 
                    gameState.currentClue && 
                    gameState.guessesRemaining > 0;

    return (
      <div className="codenames-grid">
        {gameState.grid.map((cell, index) => {
          const spymasterColor = gameState.keyCard ? gameState.keyCard[index].color : null;
          
          return (
            <div
              key={index}
              className={`word-card ${cell.revealed ? `revealed ${cell.color}` : ''} 
                         ${gameState.isSpymaster ? `spymaster-view ${spymasterColor}` : ''} 
                         ${canGuess && !cell.revealed ? 'clickable' : ''}`}
              onClick={() => canGuess && !cell.revealed && handleWordGuess(index)}
            >
              <div className="word-text">{cell.word}</div>
              {cell.revealed && (
                <div className="color-indicator">
                  {cell.color === 'red' && '🔴'}
                  {cell.color === 'blue' && '🔵'}
                  {cell.color === 'neutral' && '⚪'}
                  {cell.color === 'assassin' && '💀'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderGameHistory = () => {
    if (!gameState?.history || gameState.history.length === 0) return null;

    return (
      <div className="game-history">
        <h4>Game History</h4>
        <div className="history-list">
          {gameState.history.slice(-5).map((event, index) => (
            <div key={index} className="history-item">
              📝 {event.event}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGameResults = () => {
    if (!gameResult) return null;

    return (
      <div className="game-results">
        <div className="results-header">
          <h3>Game Over!</h3>
          <div className={`winner-announcement ${gameResult.winner}`}>
            <h2>
              {gameResult.winner === 'red' ? '🔴 RED TEAM WINS!' : 
               gameResult.winner === 'blue' ? '🔵 BLUE TEAM WINS!' : 
               '🤝 Game Ended'}
            </h2>
          </div>
        </div>

        <div className="final-details">
          <p><strong>Reason:</strong> {
            gameResult.reason === 'all_words_found' ? 'Found all their words!' :
            gameResult.reason === 'assassin' ? 'Other team hit the assassin!' :
            'Game ended due to disconnections'
          }</p>
          
          <div className="final-scores">
            <div className="team-final-score red">
              🔴 Red Team: {gameResult.finalScore.red} words
            </div>
            <div className="team-final-score blue">
              🔵 Blue Team: {gameResult.finalScore.blue} words
            </div>
          </div>

          <p><strong>Game Duration:</strong> {Math.floor(gameResult.duration / 60)}m {gameResult.duration % 60}s</p>
        </div>

        {gameResult.history && (
          <div className="final-history">
            <h4>Game Summary:</h4>
            <div className="history-list">
              {gameResult.history.map((event, index) => (
                <div key={index} className="history-item">
                  {event.event}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (gameResult) {
    return (
      <div className="codenames-game">
        <div className="game-header">
          <h2>Codenames</h2>
        </div>
        {renderGameResults()}
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="loading-game">
        <h3>Loading Codenames...</h3>
        <p>Setting up teams and generating grid...</p>
        <div className="loading-spinner">🔤</div>
      </div>
    );
  }

  return (
    <div className="codenames-game">
      <div className="game-header">
        <h2>Codenames</h2>
        <div className="game-status">
          <span className="current-turn">
            {gameState.currentTeam === 'red' ? '🔴' : '🔵'} {gameState.currentTeam.toUpperCase()} TEAM'S TURN
          </span>
        </div>
      </div>

      <div className="teams-container">
        {renderTeamSection('red')}
        {renderTeamSection('blue')}
      </div>

      <div className="game-board">
        {renderGrid()}
      </div>

      <div className="controls-container">
        {renderSpymasterView()}
        {renderOperativeView()}
      </div>

      {renderGameHistory()}

      <div className="game-instructions">
        <h4>How to Play:</h4>
        <ul>
          <li><strong>Spymasters:</strong> Give one-word clues to help your team find words</li>
          <li><strong>Operatives:</strong> Guess words based on your spymaster's clues</li>
          <li><strong>Goal:</strong> Find all your team's words before the other team</li>
          <li><strong>Avoid:</strong> The assassin word (💀) - it's an instant loss!</li>
        </ul>
      </div>
    </div>
  );
}

export default CodenamesGame;