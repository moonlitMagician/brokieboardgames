import React, { useState, useEffect } from 'react';

function ObjectionGame({ socket, player, players }) {
  const [gameState, setGameState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [objectionText, setObjectionText] = useState('');
  const [showObjectionInput, setShowObjectionInput] = useState(false);
  const [selectedVote, setSelectedVote] = useState('');
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [voteCount, setVoteCount] = useState({ sustain: 0, overrule: 0, total: 0, totalPlayers: 0 });
  const [gameResult, setGameResult] = useState(null);
  const [rerollVoteCount, setRerollVoteCount] = useState({ voters: [], total: 0 });
  const [hasVotedReroll, setHasVotedReroll] = useState(false);
  const [buzzSound] = useState(new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+H1xW8gBSuAzvLZiTYIF2m98OScTgwOUarm7K9oGwY7k9n1unEiBC59yO/eizEJGHq+8OGNOR8GXrHk7aBnIgU5ltf1w3ksBSyH0/PdrEEKGXm+8N2QMgcUZLHl9KBABRZQp+PwtmMcBjiR1/LNdSgFGXq+8N2QMgcTY7Jm9KFBBhJBnuDzv3EhBz2E0/LZiTcIGWq+8N+TOAoG'));

  useEffect(() => {
    // Early return if socket or player is not available
    if (!socket || !player) return;

    // Request initial game state
    socket.emit('requestObjectionState');

    // Game event listeners
    socket.on('objectionGameState', (state) => {
      console.log('Objection game state received:', state);
      setGameState(state);
      setTimeLeft(state.timeRemaining);
      
      // Reset UI state when game state changes
      if (state.phase !== 'arguing') {
        setShowObjectionInput(false);
      }
      if (state.phase !== 'voting') {
        setVoteSubmitted(false);
        setSelectedVote('');
      }
      
      setHasVotedReroll(state.rerollVotes?.some(v => v.id === player?.id) || false);
      setRerollVoteCount({
        voters: state.rerollVotes || [],
        total: state.playerLives?.length || 0
      });
    });

    socket.on('objectionTimerUpdate', (data) => {
      setTimeLeft(data.timeRemaining);
    });

    socket.on('objectionVoteUpdate', (data) => {
      setVoteCount(data);
    });

    socket.on('rerollVoteUpdate', (data) => {
      setRerollVoteCount(data);
    });

    socket.on('playerEliminated', (data) => {
      console.log(`${data.eliminated.name} was eliminated!`);
    });

    socket.on('objectionGameEnded', (result) => {
      setGameResult(result);
      // Ensure UI knows the game is finished
      setShowObjectionInput(false);
      setVoteSubmitted(false);
    });

    return () => {
      socket?.off('objectionGameState');
      socket?.off('objectionTimerUpdate');
      socket?.off('objectionVoteUpdate');
      socket?.off('rerollVoteUpdate');
      socket?.off('playerEliminated');
      socket?.off('objectionGameEnded');
    };
  }, [socket, player?.id]);

  const handleObjection = () => {
    // Don't allow objections if game is finished or timer is at 0
    if (!gameState || gameState.phase !== 'arguing' || timeLeft <= 0 || !player) {
      return;
    }
    
    if (!objectionText.trim()) {
      alert('Please enter your objection argument');
      return;
    }
    
    buzzSound.play().catch(e => console.log('Audio play failed:', e));
    socket.emit('makeObjection', { objectionText });
    setObjectionText('');
    setShowObjectionInput(false);
  };

  const handleFinishObjection = () => {
    if (!gameState || gameState.phase !== 'objection' || !socket) {
      return;
    }
    socket.emit('finishObjectionArgument');
  };

  const handleVote = (vote) => {
    if (!gameState || gameState.phase !== 'voting' || !socket) {
      return;
    }
    socket.emit('objectionVote', { vote });
    setSelectedVote(vote);
    setVoteSubmitted(true);
  };

  const handleRerollVote = () => {
    if (!hasVotedReroll && gameState?.phase === 'arguing' && socket) {
      socket.emit('rerollVote');
      setHasVotedReroll(true);
    }
  };

  const handleTopicToggle = (useRisque) => {
    if (socket) {
      socket.emit('toggleRisqueTopics', { useRisque });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlayerLives = (playerId) => {
    return gameState?.playerLives?.find(pl => pl.player?.id === playerId)?.lives || 0;
  };

  const canObject = () => {
    return gameState?.phase === 'arguing' && 
           gameState?.currentSpeaker?.id !== player?.id &&
           timeLeft > 0; // Can't object if time is up
  };

  const canVote = () => {
    return gameState?.phase === 'voting' && 
           gameState?.currentObjector?.id !== player?.id &&
           timeLeft > 0; // Can't vote if time is up
  };

  const renderTopicControls = () => {
    if (gameState?.phase !== 'arguing' || timeLeft <= 0) return null;

    return (
      <div className="topic-controls">
        <div className="reroll-section">
          <div className="reroll-info">
            <p>Don't like this topic? Vote to reroll!</p>
            <p>Reroll votes: {rerollVoteCount.voters.length}/{rerollVoteCount.total}</p>
            {rerollVoteCount.voters.length > 0 && (
              <div className="reroll-voters">
                Players who voted: {rerollVoteCount.voters.map(v => v.name).join(', ')}
              </div>
            )}
          </div>
          {!hasVotedReroll ? (
            <button onClick={handleRerollVote} className="reroll-button">
              🎲 Vote to Reroll Topic
            </button>
          ) : (
            <div className="voted-reroll">
              ✓ You voted to reroll the topic
            </div>
          )}
        </div>

        {player?.isHost && (
          <div className="risque-toggle">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={gameState?.useRisqueTopics || false}
                onChange={(e) => handleTopicToggle(e.target.checked)}
                className="toggle-checkbox"
              />
              <span className="toggle-text">
                Enable controversial/NSFW Topics (CHECK WITH WHOLE LOBBY BEFORE ENABLING)
              </span>
            </label>
          </div>
        )}
      </div>
    );
  };

  const renderPhaseContent = () => {
    if (!gameState) return <div>Loading game...</div>;

    switch (gameState.phase) {
      case 'arguing':
        // If time is up, show the winner message instead of normal arguing interface
        if (timeLeft <= 0) {
          return (
            <div className="arguing-phase time-up">
              <div className="winner-announcement">
                🏆 <strong>{gameState.currentSpeaker?.name}</strong> wins by successfully arguing without objection!
              </div>
              <div className="topic-display">
                <h3>Winning Topic:</h3>
                <div className="topic-text">"{gameState.currentTopic}"</div>
              </div>
              <div className="time-up-message">
                Time ran out! The game will end shortly...
              </div>
            </div>
          );
        }

        return (
          <div className="arguing-phase">
            <div className="current-argument">
              <div className="topic-display">
                <h3>Current Topic:</h3>
                <div className="topic-text">"{gameState.currentTopic}"</div>
              </div>
              
              <div className="speaker-info">
                <div className="speaker-highlight">
                  🎤 <strong>{gameState.currentSpeaker?.name}</strong> is arguing
                </div>
                <div className="phase-instruction">
                  {gameState.currentSpeaker?.id === player?.id ? 
                    "Make your argument! You have 2 minutes. If nobody objects, you win!" :
                    "Listen to the argument. Click 'Objection!' if you disagree."
                  }
                </div>
                <div className="time-warning">
                  {timeLeft <= 30 && timeLeft > 0 && (
                    <div className="urgent-timer">
                      ⚠️ {timeLeft} seconds remaining! Speaker wins if time runs out!
                    </div>
                  )}
                </div>
              </div>

              {canObject() && !showObjectionInput && (
                <button 
                  className="objection-button"
                  onClick={() => setShowObjectionInput(true)}
                >
                  🚨 OBJECTION!
                </button>
              )}

              {showObjectionInput && canObject() && (
                <div className="objection-input">
                  <h4>State your objection:</h4>
                  <textarea
                    value={objectionText}
                    onChange={(e) => setObjectionText(e.target.value)}
                    placeholder="Explain why you object and what your alternative argument is..."
                    rows={4}
                    className="objection-textarea"
                  />
                  <div className="objection-buttons">
                    <button onClick={handleObjection} className="submit-objection">
                      Submit Objection
                    </button>
                    <button onClick={() => setShowObjectionInput(false)} className="cancel-objection">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {renderTopicControls()}
          </div>
        );

      case 'objection':
        return (
          <div className="objection-phase">
            <div className="objection-header">
              <h3>🚨 OBJECTION!</h3>
              <div className="objector-highlight">
                <strong>{gameState.currentObjector?.name}</strong> has objected!
              </div>
            </div>
            
            <div className="objection-details">
              <div className="original-topic">
                <strong>Original topic:</strong> "{gameState.currentTopic}"
              </div>
              <div className="objection-argument">
                <strong>Objection:</strong> "{gameState.objectionArgument}"
              </div>
            </div>

            <div className="objection-status">
              {gameState.currentObjector?.id === player?.id ? (
                <div className="objector-controls">
                  <p>Make your case! Explain your objection and alternative argument.</p>
                  {timeLeft > 0 && (
                    <button onClick={handleFinishObjection} className="finish-objection">
                      Finish Argument & Start Vote
                    </button>
                  )}
                  {timeLeft <= 0 && (
                    <div className="time-up-message">
                      Time's up! Your objection was automatically overruled.
                    </div>
                  )}
                </div>
              ) : (
                <p>Listen to {gameState.currentObjector?.name}'s objection argument...</p>
              )}
            </div>
          </div>
        );

      case 'voting':
        return (
          <div className="voting-phase">
            <div className="voting-header">
              <h3>⚖️ Vote on the Objection</h3>
              <div className="vote-question">
                Should <strong>{gameState.currentObjector?.name}</strong>'s objection be sustained?
              </div>
              {gameState.currentObjector?.id === player?.id && (
                <div className="objector-cannot-vote">
                  You cannot vote on your own objection
                </div>
              )}
            </div>

            <div className="voting-context">
              <div><strong>Original:</strong> "{gameState.currentTopic}"</div>
              <div><strong>Objection:</strong> "{gameState.objectionArgument}"</div>
            </div>

            {canVote() && !voteSubmitted ? (
              <div className="voting-buttons">
                <button 
                  onClick={() => handleVote('sustain')}
                  className="vote-button sustain"
                >
                  ✅ SUSTAIN
                  <div className="vote-explanation">Objection is valid</div>
                </button>
                <button 
                  onClick={() => handleVote('overrule')}
                  className="vote-button overrule"
                >
                  ❌ OVERRULE
                  <div className="vote-explanation">Objection is invalid</div>
                </button>
              </div>
            ) : (
              <div className="vote-status">
                {voteSubmitted ? (
                  <p>✓ Vote submitted! Waiting for others...</p>
                ) : timeLeft <= 0 ? (
                  <p>⏰ Voting time ended! Counting votes...</p>
                ) : (
                  <p>You cannot vote on this objection</p>
                )}
              </div>
            )}

            <div className="vote-count">
              Sustain: {voteCount.sustain} | Overrule: {voteCount.overrule} | 
              Votes: {voteCount.total}/{voteCount.totalPlayers}
            </div>
          </div>
        );

      case 'finished':
        return (
          <div className="game-results">
            <div className="results-header">
              <h3>Game Over!</h3>
              {gameResult?.winner ? (
                <div className="winner-announcement">
                  🏆 <strong>{gameResult.winner.name}</strong> wins!
                </div>
              ) : (
                <div className="winner-announcement">Game ended with no clear winner</div>
              )}
            </div>

            <div className="final-stats">
              <h4>Final Lives:</h4>
              <div className="final-lives">
                {gameResult?.finalLives?.map(({ player: p, lives }) => (
                  <div key={p?.id} className={`final-life-count ${lives > 0 ? 'survivor' : 'eliminated'}`}>
                    {p?.name}: {lives} ❤️
                  </div>
                ))}
              </div>
            </div>

            {gameResult?.history && gameResult.history.length > 0 && (
              <div className="game-history">
                <h4>Game Highlights:</h4>
                <div className="history-list">
                  {gameResult.history.slice(-10).map((event, index) => (
                    <div key={index} className="history-item">
                      {event.event}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return <div>Unknown game phase</div>;
    }
  };

  // Early return if required props are missing
  if (!socket || !player) {
    return (
      <div className="loading-game">
        <h3>Loading Objection!</h3>
        <p>Connecting to game...</p>
        <div className="loading-spinner">⚖️</div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="loading-game">
        <h3>Loading Objection!</h3>
        <p>Preparing arguments...</p>
        <div className="loading-spinner">⚖️</div>
      </div>
    );
  }

  return (
    <div className="objection-game">
      <div className="game-header">
        <h2>Objection!</h2>
        <div className="game-status">
          <span className="phase-indicator">
            {gameState.phase === 'arguing' && (timeLeft > 0 ? '🎤 ARGUING' : '🏆 WINNER!')}
            {gameState.phase === 'objection' && '🚨 OBJECTION'}
            {gameState.phase === 'voting' && '⚖️ VOTING'}
            {gameState.phase === 'finished' && '🏁 FINISHED'}
          </span>
          <span className={`timer ${timeLeft <= 10 && timeLeft > 0 ? 'urgent' : ''} ${timeLeft <= 0 ? 'finished' : ''}`}>
            ⏰ {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      <div className="players-lives">
        <h4>Player Lives</h4>
        <div className="lives-grid">
          {gameState.playerLives?.map(({ player: p, lives }) => (
            <div key={p?.id} className={`player-life ${lives <= 0 ? 'eliminated' : ''} ${p?.id === player?.id ? 'you' : ''}`}>
              <span className="player-name">{p?.name}</span>
              <span className="lives-count">
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className={`life ${i < lives ? 'alive' : 'lost'}`}>
                    ❤️
                  </span>
                ))}
              </span>
              {p?.id === gameState.currentSpeaker?.id && <span className="speaking-indicator">🎤</span>}
              {p?.id === gameState.currentObjector?.id && <span className="objecting-indicator">🚨</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="game-content">
        {renderPhaseContent()}
      </div>

      {gameState.history && gameState.history.length > 0 && (
        <div className="recent-history">
          <h4>Recent Events</h4>
          <div className="history-list">
            {gameState.history.slice(-3).map((event, index) => (
              <div key={index} className="history-item">
                📝 {event.event}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ObjectionGame;