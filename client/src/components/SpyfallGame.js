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

    return () => {
      socket.off('roleAssigned');
      socket.off('spyfallGameStarted');
      socket.off('timerUpdate');
      socket.off('spyfallQuestionAsked');
      socket.off('spyfallVotingStarted');
      socket.off('voteUpdate');
      socket.off('spyGuessPhase');
      socket.off('spyfallGameEnded');
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderGamePhase = () => {
    switch (gamePhase) {
      case 'discussion':
        return (
          <div className="discussion-phase">
            <div className="phase-header">
              <h3>Discussion Phase</h3>
              <p>Ask questions to find the spy, but don't reveal the location!</p>
            </div>
            
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
  );
}

export default SpyfallGame;