import React, { useState, useEffect } from 'react';

function Lobby({ lobbyCode, players, player, onStartGame, socket }) {
  const [votingState, setVotingState] = useState({
    isVoting: false,
    availableGames: [],
    votes: {},
    totalVotes: 0,
    totalPlayers: 0,
    yourVote: null,
    timeRemaining: 0
  });
  
  const [gameResult, setGameResult] = useState(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Listen for voting events
    socket.on('gameVotingStarted', (data) => {
      setVotingState({
        isVoting: true,
        availableGames: data.availableGames,
        votes: {},
        totalVotes: 0,
        totalPlayers: data.playerCount,
        yourVote: null,
        timeRemaining: 60
      });
      setShowResults(false);
      
      // Start countdown timer
      startVotingTimer();
    });

    socket.on('gameVoteUpdate', (data) => {
      setVotingState(prev => ({
        ...prev,
        votes: data.votes,
        totalVotes: data.totalVotes,
        totalPlayers: data.totalPlayers,
        yourVote: data.yourVote
      }));
    });

    socket.on('gameVotingEnded', (data) => {
      setVotingState(prev => ({ ...prev, isVoting: false }));
      setGameResult(data);
      setShowResults(true);
      
      // Hide results after game starts
      setTimeout(() => {
        setShowResults(false);
        setGameResult(null);
      }, 3000);
    });

    return () => {
      socket.off('gameVotingStarted');
      socket.off('gameVoteUpdate');
      socket.off('gameVotingEnded');
    };
  }, [socket]);

  const startVotingTimer = () => {
    const interval = setInterval(() => {
      setVotingState(prev => {
        const newTime = prev.timeRemaining - 1;
        if (newTime <= 0) {
          clearInterval(interval);
          return { ...prev, timeRemaining: 0 };
        }
        return { ...prev, timeRemaining: newTime };
      });
    }, 1000);
  };

  const handleStartVoting = () => {
    if (socket) {
      socket.emit('startGameVoting');
    }
  };

  const handleVoteForGame = (gameType) => {
    if (socket && votingState.isVoting) {
      socket.emit('voteForGame', { gameType });
    }
  };

  const handleEndVoting = () => {
    if (socket) {
      socket.emit('endGameVoting');
    }
  };

  const handleDirectGameStart = (gameType) => {
    if (onStartGame) {
      onStartGame(gameType);
    }
  };

  const getGameInfo = (gameType) => {
    const gameData = {
      spyfall: { 
        title: 'Spyfall', 
        emoji: '🕵️', 
        description: 'Find the spy among you!',
        players: '3-8 players'
      },
      mafia: { 
        title: 'Mafia', 
        emoji: '🔫', 
        description: 'Town vs Mafia - Who will survive?',
        players: '4-12 players'
      },
      objection: { 
        title: 'Objection!', 
        emoji: '⚖️', 
        description: 'Debate wild topics and object to arguments!',
        players: '3-10 players'
      },
      codenames: { 
        title: 'Codenames', 
        emoji: '🔤', 
        description: 'Team word association game with spies!',
        players: '4-10 players'
      }
    };
    return gameData[gameType] || { title: gameType, emoji: '🎮', description: 'Unknown game', players: '? players' };
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderVotingResults = () => {
    if (!showResults || !gameResult) return null;

    const winnerInfo = getGameInfo(gameResult.winningGame);

    return (
      <div className="voting-results-overlay">
        <div className="voting-results">
          <h3>Voting Results</h3>
          
          <div className="winner-announcement">
            <div className="winner-game">
              {winnerInfo.emoji} <strong>{winnerInfo.title}</strong> wins!
            </div>
            {gameResult.wasTie && (
              <div className="tie-message">Decided by random selection from tied games</div>
            )}
          </div>

          <div className="vote-breakdown">
            <h4>Final Votes:</h4>
            {Object.entries(gameResult.votes).map(([game, votes]) => {
              const info = getGameInfo(game);
              return (
                <div key={game} className={`vote-result ${game === gameResult.winningGame ? 'winner' : ''}`}>
                  <span className="game-name">{info.emoji} {info.title}</span>
                  <span className="vote-count">{votes} vote{votes !== 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>

          <div className="auto-start-message">
            Game starting automatically in 3 seconds...
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="lobby">
      {renderVotingResults()}
      
      <h2>Lobby: {lobbyCode}</h2>
      
      <div className="players-list">
        <h3>Players ({players.length})</h3>
        {players.map((p) => (
          <div key={p.id} className="player">
            {p.name} {p.isHost && '(Host)'} {p.id === player?.id && '(You)'}
            {votingState.isVoting && votingState.yourVote && p.id === player?.id && (
              <span className="voted-indicator">✓ Voted</span>
            )}
          </div>
        ))}
      </div>

      {/* Voting Interface */}
      {votingState.isVoting && (
        <div className="game-voting">
          <div className="voting-header">
            <h3>Vote for a Game!</h3>
            <div className="voting-timer">
              Time remaining: <strong>{formatTime(votingState.timeRemaining)}</strong>
            </div>
            <div className="voting-progress">
              {votingState.totalVotes}/{votingState.totalPlayers} players voted
            </div>
          </div>

          <div className="voting-games">
            {votingState.availableGames.map((gameType) => {
              const info = getGameInfo(gameType);
              const votes = votingState.votes[gameType] || 0;
              const isSelected = votingState.yourVote === gameType;
              
              return (
                <button
                  key={gameType}
                  onClick={() => handleVoteForGame(gameType)}
                  className={`vote-game-button ${isSelected ? 'selected' : ''}`}
                  disabled={votingState.yourVote !== null}
                >
                  <div className="game-title">{info.emoji} {info.title}</div>
                  <div className="game-description">{info.description}</div>
                  <div className="game-players">{info.players}</div>
                  <div className="vote-count">
                    {votes} vote{votes !== 1 ? 's' : ''}
                    {isSelected && <span className="your-vote"> (Your Vote)</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {player?.isHost && votingState.totalVotes > 0 && (
            <div className="voting-controls">
              <button onClick={handleEndVoting} className="end-voting-button">
                End Voting Early
              </button>
            </div>
          )}
        </div>
      )}

      {/* Regular Game Selection (when not voting) */}
      {!votingState.isVoting && (
        <div className="game-selection">
          <h3>Game Selection</h3>
          
          {player?.isHost && (
            <div className="host-options">
              <div className="selection-mode">
                <button 
                  onClick={handleStartVoting}
                  disabled={players.length < 3}
                  className="start-voting-button"
                >
                  🗳️ Start Voting
                </button>
                <div className="mode-description">
                  Let everyone vote on which game to play!
                </div>
              </div>
              
              <div className="or-divider">OR</div>
              
              <div className="direct-selection">
                <div className="mode-description">Choose a game directly (host decides):</div>
                <div className="games">
                  <button 
                    onClick={() => handleDirectGameStart('spyfall')}
                    disabled={players.length < 3}
                    className="game-button spyfall"
                  >
                    <div className="game-title">Spyfall 🕵️</div>
                    <div className="game-description">Find the spy among you!</div>
                    <div className="game-players">3-8 players</div>
                  </button>
                  
                  <button 
                    onClick={() => handleDirectGameStart('mafia')}
                    disabled={players.length < 4}
                    className="game-button mafia"
                  >
                    <div className="game-title">Mafia 🔫</div>
                    <div className="game-description">Town vs Mafia - Who will survive?</div>
                    <div className="game-players">4-12 players</div>
                  </button>
                  
                  <button 
                    onClick={() => handleDirectGameStart('objection')}
                    disabled={players.length < 3}
                    className="game-button objection"
                  >
                    <div className="game-title">Objection! ⚖️</div>
                    <div className="game-description">Debate wild topics and object to arguments!</div>
                    <div className="game-players">3-10 players</div>
                  </button>
                  
                  <button 
                    onClick={() => handleDirectGameStart('codenames')}
                    disabled={players.length < 4}
                    className="game-button codenames"
                  >
                    <div className="game-title">Codenames 🔤</div>
                    <div className="game-description">Team word association game with spies!</div>
                    <div className="game-players">4-10 players</div>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="player-requirements">
            {players.length < 3 && <p>Need at least 3 players for Spyfall and Objection!</p>}
            {players.length === 3 && <p>Ready for Spyfall and Objection! Need 4+ for Mafia and Codenames.</p>}
            {players.length >= 4 && <p>Ready to play all games!</p>}
          </div>
          
          {!player?.isHost && (
            <div className="waiting-message">
              <p>Waiting for <strong>{players.find(p => p.isHost)?.name}</strong> (host) to start voting or choose a game...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Lobby;