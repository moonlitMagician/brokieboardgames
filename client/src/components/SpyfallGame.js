import React, { useState, useEffect } from 'react';

function SpyfallGame({ socket, player, players }) {
  const [role, setRole] = useState(null);
  const [gamePhase, setGamePhase] = useState('discussion');
  const [timeLeft, setTimeLeft] = useState(480);
  const [questions, setQuestions] = useState([]);
  const [selectedVote, setSelectedVote] = useState('');
  const [locationGuess, setLocationGuess] = useState('');
  const [gameResult, setGameResult] = useState(null);
  const [voteCount, setVoteCount] = useState({ received: 0, total: 0 });
  
  // New state for location checklist and early voting
  const [checkedLocations, setCheckedLocations] = useState(new Set());
  const [earlyVoteCount, setEarlyVoteCount] = useState({ voters: [], total: 0 });
  const [hasVotedEarly, setHasVotedEarly] = useState(false);

  // Location list for checklist
  const locations = [
    'Beach', 'Hospital', 'School', 'Restaurant', 'Bank', 'Airport',
    'Casino', 'Circus', 'Embassy', 'Hotel', 'Military Base', 'Movie Studio',
    'Spa', 'Theater', 'University', 'Amusement Park', 'Art Museum', 'Barbershop',
    'Cathedral', 'Christmas Market', 'Corporate Party', 'Crusader Army',
    'Day Spa', 'Forest', 'Gas Station', 'Harbor Docks', 'Ice Hockey Stadium',
    'Jazz Club', 'Library', 'Night Club', 'Ocean Liner', 'Passenger Train',
    'Polar Station', 'Police Station', 'Racing Circuit', 'Retirement Home',
    'Rock Concert', 'Service Station', 'Space Station', 'Submarine', 'Supermarket',
    'Temple', 'Wedding', 'Zoo'
  ].sort();

  useEffect(() => {
    // Request role when component mounts (handles reconnection/late loading)
    socket.emit('requestSpyfallRole');

    // Game event listeners
    socket.on('roleAssigned', (roleData) => {
      console.log('Role received:', roleData);
      setRole(roleData);
      setGamePhase(roleData.gamePhase);
      setTimeLeft(roleData.timeRemaining);
    });

    socket.on('spyfallGameStarted', (data) => {
      setGamePhase(data.phase);
      setTimeLeft(data.timeRemaining);
    });

    socket.on('timerUpdate', (data) => {
      setTimeLeft(data.timeRemaining);
    });

    socket.on('spyfallQuestionAsked', (question) => {
      setQuestions(prev => [...prev, question]);
    });

    socket.on('spyfallVotingStarted', (data) => {
      setGamePhase(data.phase);
      setTimeLeft(data.timeRemaining);
      setVoteCount({ received: 0, total: data.players.length });
    });

    socket.on('voteUpdate', (data) => {
      setVoteCount({ received: data.votesReceived, total: data.totalPlayers });
    });

    socket.on('spyGuessPhase', (data) => {
      setGamePhase(data.phase);
      setTimeLeft(data.timeRemaining);
    });

    socket.on('spyfallGameEnded', (result) => {
      setGamePhase('finished');
      setGameResult(result);
    });

    // Early voting events
    socket.on('earlyVoteUpdate', (data) => {
      setEarlyVoteCount(data);
    });

    return () => {
      socket.off('roleAssigned');
      socket.off('spyfallGameStarted');
      socket.off('timerUpdate');
      socket.off('spyfallQuestionAsked');
      socket.off('spyfallVotingStarted');
      socket.off('voteUpdate');
      socket.off('spyGuessPhase');
      socket.off('spyfallGameEnded');
      socket.off('earlyVoteUpdate');
    };
  }, [socket]);

  const handleVote = () => {
    if (selectedVote && gamePhase === 'voting') {
      socket.emit('spyfallVote', { votedPlayerId: selectedVote });
      setSelectedVote(''); // Disable further voting
    }
  };

  const handleSpyGuess = () => {
    if (locationGuess && role?.isSpy && gamePhase === 'spy_guess') {
      socket.emit('spyGuess', { locationGuess });
      setLocationGuess('');
    }
  };

  const handleEarlyVote = () => {
    if (!hasVotedEarly && gamePhase === 'discussion') {
      socket.emit('voteEarlyEnd');
      setHasVotedEarly(true);
    }
  };

  const handleLocationCheck = (location) => {
    const newChecked = new Set(checkedLocations);
    if (newChecked.has(location)) {
      newChecked.delete(location);
    } else {
      newChecked.add(location);
    }
    setCheckedLocations(newChecked);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderLocationChecklist = () => {
    if (role?.isSpy) return null; // Don't show to spy

    return (
      <div className="location-checklist">
        <h4>Location Checklist</h4>
        <div className="locations-grid">
          {locations.map((location) => (
            <label key={location} className="location-item">
              <input
                type="checkbox"
                checked={checkedLocations.has(location)}
                onChange={() => handleLocationCheck(location)}
              />
              <span className={checkedLocations.has(location) ? 'checked' : ''}>
                {location}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderEarlyVoting = () => {
    if (gamePhase !== 'discussion') return null;

    return (
      <div className="early-voting">
        <div className="early-vote-info">
          <p>Think you've found the spy? Vote to end discussion early!</p>
          <p>Votes for early voting: {earlyVoteCount.voters.length}/{earlyVoteCount.total}</p>
          {earlyVoteCount.voters.length > 0 && (
            <div className="early-voters">
              Players who voted: {earlyVoteCount.voters.map(v => v.name).join(', ')}
            </div>
          )}
        </div>
        {!hasVotedEarly ? (
          <button onClick={handleEarlyVote} className="early-vote-button">
            Vote to End Discussion
          </button>
        ) : (
          <div className="voted-early">
            ✓ You voted to end discussion early
          </div>
        )}
      </div>
    );
  };

  const renderGamePhase = () => {
    switch (gamePhase) {
      case 'discussion':
        return (
          <div className="discussion-phase">
            <div className="phase-header">
              <h3>Discussion Phase</h3>
              <p>Ask questions to find the spy, but don't reveal the location!</p>
              {firstQuestioner && (
                <div className="first-questioner">
                  <strong>{firstQuestioner.name}</strong> will ask the first question
                  {firstQuestioner.id === player.id && <span className="you-indicator"> (That's you!)</span>}
                </div>
              )}
            </div>
            
            {renderEarlyVoting()}
            
            {questions.length > 0 && (
              <div className="questions-log">
                <h4>Questions Asked:</h4>
                <div className="questions-list">
                  {questions.slice(-5).map((q, index) => (
                    <div key={index} className="question-item">
                      <strong>{q.from}</strong> → <strong>{q.to}</strong>: {q.question}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'voting':
        return (
          <div className="voting-phase">
            <div className="phase-header">
              <h3>Voting Phase</h3>
              <p>Vote for who you think is the spy!</p>
              <p>Votes received: {voteCount.received}/{voteCount.total}</p>
            </div>
            
            {!selectedVote ? (
              <div className="voting-interface">
                <select 
                  value={selectedVote} 
                  onChange={(e) => setSelectedVote(e.target.value)}
                  className="vote-select"
                >
                  <option value="">Select a player to vote for...</option>
                  {players
                    .filter(p => p.id !== player.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))
                  }
                </select>
                <button 
                  onClick={handleVote} 
                  disabled={!selectedVote}
                  className="vote-button"
                >
                  Submit Vote
                </button>
              </div>
            ) : (
              <div className="vote-submitted">
                <p>✓ Vote submitted! Waiting for other players...</p>
              </div>
            )}
          </div>
        );

      case 'spy_guess':
        return (
          <div className="spy-guess-phase">
            <div className="phase-header">
              <h3>Spy's Last Chance</h3>
              {role?.isSpy ? (
                <div>
                  <p>You're the spy! Guess the location to win!</p>
                  <div className="guess-interface">
                    <input
                      type="text"
                      value={locationGuess}
                      onChange={(e) => setLocationGuess(e.target.value)}
                      placeholder="Enter your location guess..."
                      className="location-input"
                    />
                    <button 
                      onClick={handleSpyGuess}
                      disabled={!locationGuess}
                      className="guess-button"
                    >
                      Submit Guess
                    </button>
                  </div>
                </div>
              ) : (
                <p>The spy is making their final guess...</p>
              )}
            </div>
          </div>
        );

      case 'finished':
        return (
          <div className="game-results">
            <div className="results-header">
              <h3>Game Over!</h3>
              <div className={`winner-announcement ${gameResult?.winner}`}>
                <h2>
                  {gameResult?.winner === 'spy' ? '🕵️ Spy Wins!' : '👥 Citizens Win!'}
                </h2>
              </div>
            </div>
            
            <div className="game-details">
              <p><strong>The spy was:</strong> {gameResult?.spy?.name}</p>
              <p><strong>Location was:</strong> {gameResult?.location}</p>
              <p><strong>Game duration:</strong> {Math.floor(gameResult?.duration / 60)}m {gameResult?.duration % 60}s</p>
              
              {gameResult?.reason && (
                <p><strong>How they won:</strong> 
                  {gameResult.reason === 'spy_guessed_location' && ' Spy correctly guessed the location!'}
                  {gameResult.reason === 'spy_caught' && ' Citizens successfully identified the spy!'}
                  {gameResult.reason === 'spy_wrong_guess' && ' Spy guessed the wrong location!'}
                  {gameResult.reason === 'spy_timeout' && ' Spy ran out of time to guess!'}
                  {gameResult.reason === 'spy_disconnected' && ' Spy disconnected from the game!'}
                </p>
              )}
              
              {gameResult?.spyGuess && (
                <p><strong>Spy's guess:</strong> "{gameResult.spyGuess}"</p>
              )}
            </div>
          </div>
        );

      default:
        return <div>Loading game...</div>;
    }
  };

  if (!role) return <div>Loading role...</div>;

  return (
    <div className="spyfall-game">
      <div className="game-header">
        <h2>Spyfall</h2>
        <div className="timer">Time: {formatTime(timeLeft)}</div>
      </div>

      <div className="game-content-wrapper">
        <div className="main-game-content">
          <div className="role-info">
            {role.isSpy ? (
              <div className="spy-role">
                <h3>You are the SPY! 🕵️</h3>
                <p>Try to figure out the location without revealing that you don't know it!</p>
              </div>
            ) : (
              <div className="normal-role">
                <h3>Location: {role.location}</h3>
                <p>Ask questions to find the spy, but don't be too obvious about the location!</p>
              </div>
            )}
          </div>

          <div className="players-grid">
            <h3>Players</h3>
            <div className="players">
              {players.map((p) => (
                <div key={p.id} className={`player ${p.id === player.id ? 'you' : ''}`}>
                  {p.name} {p.id === player.id && '(You)'}
                </div>
              ))}
            </div>
          </div>

          <div className="game-phase-content">
            {renderGamePhase()}
          </div>

          {gamePhase === 'discussion' && (
            <div className="game-instructions">
              <h4>How to Play:</h4>
              <ul>
                <li>Take turns asking each other questions about the location</li>
                <li>Everyone except the spy knows the location</li>
                <li>The spy must figure out the location</li>
                <li>Other players must identify the spy</li>
                <li>When time runs out, there will be a vote!</li>
              </ul>
            </div>
          )}
        </div>

        {gamePhase === 'discussion' && renderLocationChecklist()}
      </div>
    </div>
  );
}

export default SpyfallGame;