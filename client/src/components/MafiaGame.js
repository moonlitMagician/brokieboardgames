import React, { useState, useEffect } from 'react';

function MafiaGame({ socket, player, players }) {
  const [role, setRole] = useState(null);
  const [gamePhase, setGamePhase] = useState('night');
  const [dayNumber, setDayNumber] = useState(1);
  const [timeLeft, setTimeLeft] = useState(120);
  const [alivePlayers, setAlivePlayers] = useState([]);
  const [deadPlayers, setDeadPlayers] = useState([]);
  const [mafiaMembers, setMafiaMembers] = useState([]);
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedVote, setSelectedVote] = useState('');
  const [actionConfirmed, setActionConfirmed] = useState(false);
  const [voteConfirmed, setVoteConfirmed] = useState(false);
  const [phaseMessage, setPhaseMessage] = useState('');
  const [nightResults, setNightResults] = useState(null);
  const [investigationResult, setInvestigationResult] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [voteCount, setVoteCount] = useState({ received: 0, total: 0 });

  useEffect(() => {
    // Request role when component mounts
    socket.emit('requestMafiaRole');

    // Game event listeners
    socket.on('mafiaRoleAssigned', (roleData) => {
      console.log('Mafia role received:', roleData);
      setRole(roleData.role);
      setGamePhase(roleData.phase);
      setDayNumber(roleData.dayNumber);
      setTimeLeft(roleData.timeRemaining);
      setAlivePlayers(roleData.alivePlayers || []);
      setDeadPlayers(roleData.deadPlayers || []);
      setMafiaMembers(roleData.mafiaMembers || []);
    });

    socket.on('mafiaPhaseChange', (data) => {
      setGamePhase(data.phase);
      setTimeLeft(data.timeRemaining);
      setPhaseMessage(data.message);
      setActionConfirmed(false);
      setVoteConfirmed(false);
      setSelectedAction('');
      setSelectedVote('');
      
      if (data.nightResults) {
        setNightResults(data.nightResults);
      }
      if (data.alivePlayers) {
        setAlivePlayers(data.alivePlayers);
      }
      if (data.deadPlayers) {
        setDeadPlayers(data.deadPlayers);
      }
      if (data.dayNumber) {
        setDayNumber(data.dayNumber);
      }
    });

    socket.on('mafiaTimerUpdate', (data) => {
      setTimeLeft(data.timeRemaining);
    });

    socket.on('actionConfirmed', (data) => {
      setActionConfirmed(true);
    });

    socket.on('investigationResult', (data) => {
      setInvestigationResult(data);
    });

    socket.on('mafiaVoteUpdate', (data) => {
      setVoteCount({ received: data.votesReceived, total: data.totalPlayers });
    });

    socket.on('playerEliminated', (data) => {
      setPhaseMessage(`${data.eliminated.name} was eliminated! They were a ${data.role}.`);
    });

    socket.on('noElimination', (data) => {
      setPhaseMessage('No one was eliminated this round.');
    });

    socket.on('mafiaGameEnded', (result) => {
      setGamePhase('finished');
      setGameResult(result);
    });

    return () => {
      socket.off('mafiaRoleAssigned');
      socket.off('mafiaPhaseChange');
      socket.off('mafiaTimerUpdate');
      socket.off('actionConfirmed');
      socket.off('investigationResult');
      socket.off('mafiaVoteUpdate');
      socket.off('playerEliminated');
      socket.off('noElimination');
      socket.off('mafiaGameEnded');
    };
  }, [socket]);

  const handleNightAction = () => {
    if (selectedAction && !actionConfirmed) {
      const actionType = role === 'mafia' ? 'kill' : role === 'detective' ? 'investigate' : 'save';
      socket.emit('mafiaAction', {
        type: actionType,
        targetId: selectedAction
      });
    }
  };

  const handleVote = () => {
    if (selectedVote && !voteConfirmed) {
      socket.emit('mafiaVote', { votedPlayerId: selectedVote });
      setVoteConfirmed(true);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isPlayerAlive = (playerId) => {
    return alivePlayers.some(p => p.id === playerId);
  };

  const canPerformNightAction = () => {
    return gamePhase === 'night' && 
           isPlayerAlive(player.id) && 
           ['mafia', 'detective', 'doctor'].includes(role) &&
           !actionConfirmed;
  };

  const getActionTargets = () => {
    if (role === 'mafia') {
      return alivePlayers.filter(p => p.id !== player.id && !mafiaMembers.find(m => m.id === p.id));
    } else if (role === 'detective') {
      return alivePlayers.filter(p => p.id !== player.id);
    } else if (role === 'doctor') {
      return alivePlayers;
    }
    return [];
  };

  const renderRoleInfo = () => {
    const roleDescriptions = {
      mafia: "You are MAFIA! 🔫 Eliminate all town members. During night, choose someone to eliminate.",
      detective: "You are the DETECTIVE! 🔍 Find the mafia. During night, investigate someone to learn if they're mafia.",
      doctor: "You are the DOCTOR! 👨‍⚕️ Save the town. During night, choose someone to protect from elimination.",
      villager: "You are a VILLAGER! 👥 Find and eliminate the mafia through discussion and voting."
    };

    return (
      <div className={`role-info ${role}`}>
        <h3>{roleDescriptions[role]}</h3>
        {role === 'mafia' && mafiaMembers.length > 1 && (
          <div className="mafia-team">
            <strong>Your mafia team:</strong>
            <ul>
              {mafiaMembers.map(member => (
                <li key={member.id}>{member.name}</li>
              ))}
            </ul>
          </div>
        )}
        {investigationResult && (
          <div className="investigation-result">
            <strong>Investigation Result:</strong> {investigationResult.target} is {investigationResult.isMafia ? 'MAFIA' : 'NOT MAFIA'}
          </div>
        )}
      </div>
    );
  };

  const renderNightPhase = () => {
    if (!isPlayerAlive(player.id)) {
      return <div className="dead-player">You are dead. Watch the game unfold...</div>;
    }

    if (!canPerformNightAction()) {
      return (
        <div className="night-waiting">
          <p>Night time... Wait for others to make their moves.</p>
          {role === 'villager' && <p>Villagers sleep peacefully during the night.</p>}
        </div>
      );
    }

    const actionText = {
      mafia: 'Choose someone to eliminate:',
      detective: 'Choose someone to investigate:',
      doctor: 'Choose someone to protect:'
    };

    return (
      <div className="night-action">
        <h4>{actionText[role]}</h4>
        {!actionConfirmed ? (
          <div className="action-interface">
            <select 
              value={selectedAction} 
              onChange={(e) => setSelectedAction(e.target.value)}
              className="action-select"
            >
              <option value="">Select a target...</option>
              {getActionTargets().map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button 
              onClick={handleNightAction} 
              disabled={!selectedAction}
              className="action-button"
            >
              Confirm Action
            </button>
          </div>
        ) : (
          <div className="action-confirmed">
            <p>✓ Action submitted! Wait for the night to end...</p>
          </div>
        )}
      </div>
    );
  };

  const renderDayPhase = () => {
    return (
      <div className="day-phase">
        <div className="phase-header">
          <h3>Day {dayNumber} - Discussion</h3>
          <p>Discuss and figure out who the mafia are!</p>
        </div>
        
        {nightResults && (
          <div className="night-results">
            <h4>What happened last night:</h4>
            {nightResults.killed && (
              <p className="death-announcement">💀 {nightResults.killed.name} was eliminated!</p>
            )}
            {nightResults.saved && (
              <p className="save-announcement">🛡️ Someone was saved by the doctor!</p>
            )}
            {!nightResults.killed && !nightResults.saved && (
              <p>🌅 It was a peaceful night.</p>
            )}
          </div>
        )}
        
        <div className="discussion-info">
          <p>Use this time to discuss who you think the mafia are. When time runs out, there will be a vote!</p>
        </div>
      </div>
    );
  };

  const renderVotingPhase = () => {
    if (!isPlayerAlive(player.id)) {
      return <div className="dead-player">You are dead and cannot vote.</div>;
    }

    return (
      <div className="voting-phase">
        <div className="phase-header">
          <h3>Voting Time</h3>
          <p>Vote to eliminate someone you suspect is mafia!</p>
          <p>Votes received: {voteCount.received}/{voteCount.total}</p>
        </div>
        
        {!voteConfirmed ? (
          <div className="voting-interface">
            <select 
              value={selectedVote} 
              onChange={(e) => setSelectedVote(e.target.value)}
              className="vote-select"
            >
              <option value="">Select someone to eliminate...</option>
              {alivePlayers
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
  };

  const renderGameResults = () => {
    return (
      <div className="game-results">
        <div className="results-header">
          <h3>Game Over!</h3>
          <div className={`winner-announcement ${gameResult?.winner}`}>
            <h2>
              {gameResult?.winner === 'mafia' ? '🔫 Mafia Wins!' : 
               gameResult?.winner === 'town' ? '👥 Town Wins!' : '🤝 Draw!'}
            </h2>
          </div>
        </div>
        
        <div className="game-details">
          <p><strong>Reason:</strong> {gameResult?.reason}</p>
          <p><strong>Game duration:</strong> {Math.floor(gameResult?.duration / 60)}m {gameResult?.duration % 60}s</p>
          
          <div className="final-roles">
            <h4>Player Roles:</h4>
            {gameResult?.finalRoles?.map(({ player: p, role }) => (
              <div key={p.id} className={`role-reveal ${role}`}>
                {p.name} - {role.toUpperCase()}
              </div>
            ))}
          </div>
          
          {gameResult?.survivors?.length > 0 && (
            <div className="survivors">
              <h4>Survivors:</h4>
              {gameResult.survivors.map(p => (
                <span key={p.id} className="survivor">{p.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGamePhase = () => {
    switch (gamePhase) {
      case 'night':
        return renderNightPhase();
      case 'day':
        return renderDayPhase();
      case 'voting':
        return renderVotingPhase();
      case 'finished':
        return renderGameResults();
      default:
        return <div>Loading game phase...</div>;
    }
  };

  if (!role) {
    return (
      <div className="loading-role">
        <h3>Loading your role...</h3>
        <p>Preparing the game...</p>
        <div className="loading-spinner">🌙</div>
      </div>
    );
  }

  return (
    <div className="mafia-game">
      <div className="game-header">
        <h2>Mafia</h2>
        <div className="game-status">
          <span className="phase-indicator">{gamePhase === 'night' ? '🌙' : gamePhase === 'day' ? '☀️' : '🗳️'} {gamePhase.toUpperCase()}</span>
          <span className="day-counter">Day {dayNumber}</span>
          <span className="timer">Time: {formatTime(timeLeft)}</span>
        </div>
      </div>

      {phaseMessage && (
        <div className="phase-message">
          {phaseMessage}
        </div>
      )}

      {renderRoleInfo()}

      <div className="players-status">
        <div className="alive-players">
          <h4>Alive ({alivePlayers.length})</h4>
          <div className="players-grid">
            {alivePlayers.map((p) => (
              <div key={p.id} className={`player alive ${p.id === player.id ? 'you' : ''}`}>
                {p.name} {p.id === player.id && '(You)'}
              </div>
            ))}
          </div>
        </div>

        {deadPlayers.length > 0 && (
          <div className="dead-players">
            <h4>Eliminated ({deadPlayers.length})</h4>
            <div className="players-grid">
              {deadPlayers.map((p) => (
                <div key={p.id} className="player dead">
                  {p.name} ({p.role})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="game-phase-content">
        {renderGamePhase()}
      </div>
    </div>
  );
}

export default MafiaGame;