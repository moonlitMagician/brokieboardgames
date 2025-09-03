// games/spyfall.js
class SpyfallGame {
  constructor(lobby, io) {
    this.lobby = lobby;
    this.io = io;
    
    this.locations = [
      'Beach', 'Hospital', 'School', 'Restaurant', 'Bank', 'Airport',
      'Casino', 'Circus', 'Embassy', 'Hotel', 'Military Base', 'Movie Studio',
      'Spa', 'Theater', 'University', 'Amusement Park', 'Art Museum', 'Barbershop',
      'Cathedral', 'Christmas Market', 'Corporate Party', 'Crusader Army',
      'Day Spa', 'Forest', 'Gas Station', 'Harbor Docks', 'Ice Hockey Stadium',
      'Jazz Club', 'Library', 'Night Club', 'Ocean Liner', 'Passenger Train',
      'Polar Station', 'Police Station', 'Racing Circuit', 'Retirement Home',
      'Rock Concert', 'Service Station', 'Space Station', 'Submarine', 'Supermarket',
      'Temple', 'University', 'Wedding', 'Zoo'
    ];
    
    this.gameData = {
      location: null,
      spyId: null,
      phase: 'discussion', // discussion, voting, results
      timer: 480, // 8 minutes
      votes: new Map(),
      gameStartTime: Date.now(),
      questions: []
    };
  }

  startGame() {
    this.selectLocationAndSpy();
    this.assignRoles();
    this.startTimer();
    this.notifyGameStarted();
    this.setupGameEvents();
  }

  selectLocationAndSpy() {
    const connectedPlayers = this.lobby.players.filter(p => p.connected);
    
    // Select random location
    this.gameData.location = this.locations[Math.floor(Math.random() * this.locations.length)];
    
    // Select random spy
    const spyIndex = Math.floor(Math.random() * connectedPlayers.length);
    this.gameData.spyId = connectedPlayers[spyIndex].id;
    
    console.log(`Spyfall Game: Location is "${this.gameData.location}", Spy is "${connectedPlayers[spyIndex].name}"`);
  }

  assignRoles() {
    // Send role-specific data to each player immediately and with delay
    this.lobby.players.filter(p => p.connected).forEach((player) => {
      const isSpy = player.id === this.gameData.spyId;
      const roleData = {
        isSpy,
        location: isSpy ? null : this.gameData.location,
        gamePhase: this.gameData.phase,
        timeRemaining: this.gameData.timer
      };
      
      console.log(`Sending role to ${player.name}:`, roleData);
      
      // Send immediately
      this.io.to(player.id).emit('roleAssigned', roleData);
      
      // Also send with delay as backup
      setTimeout(() => {
        this.io.to(player.id).emit('roleAssigned', roleData);
      }, 100);
      
      // And another backup for slower connections
      setTimeout(() => {
        this.io.to(player.id).emit('roleAssigned', roleData);
      }, 1000);
    });
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      this.gameData.timer--;
      
      // Broadcast timer update every 10 seconds or when time is running low
      if (this.gameData.timer % 10 === 0 || this.gameData.timer <= 30) {
        this.io.to(this.lobby.code).emit('timerUpdate', {
          timeRemaining: this.gameData.timer
        });
      }
      
      // End discussion phase when timer runs out
      if (this.gameData.timer <= 0) {
        this.startVotingPhase();
      }
    }, 1000);
  }

  notifyGameStarted() {
    const connectedPlayers = this.lobby.players.filter(p => p.connected);
    this.io.to(this.lobby.code).emit('spyfallGameStarted', {
      phase: this.gameData.phase,
      playerCount: connectedPlayers.length,
      timeRemaining: this.gameData.timer
    });
  }

  startVotingPhase() {
    if (this.gameData.phase !== 'discussion') return;
    
    clearInterval(this.timerInterval);
    this.gameData.phase = 'voting';
    this.gameData.timer = 60; // 1 minute for voting
    this.gameData.votes.clear();
    
    const connectedPlayers = this.lobby.players.filter(p => p.connected);
    this.io.to(this.lobby.code).emit('spyfallVotingStarted', {
      phase: this.gameData.phase,
      timeRemaining: this.gameData.timer,
      players: connectedPlayers.map(p => ({ id: p.id, name: p.name }))
    });

    // Start voting timer
    this.timerInterval = setInterval(() => {
      this.gameData.timer--;
      
      if (this.gameData.timer % 10 === 0 || this.gameData.timer <= 10) {
        this.io.to(this.lobby.code).emit('timerUpdate', {
          timeRemaining: this.gameData.timer
        });
      }
      
      if (this.gameData.timer <= 0) {
        this.endVoting();
      }
    }, 1000);
  }

  handleQuestion(socket, player, data) {
    const question = {
      id: Date.now(),
      from: player.name,
      to: data.targetPlayer,
      question: data.question,
      timestamp: new Date().toISOString()
    };
    
    this.gameData.questions.push(question);
    
    // Broadcast question to all players
    this.io.to(this.lobby.code).emit('spyfallQuestionAsked', question);
  }

  handleVote(socket, player, data) {
    if (this.gameData.phase !== 'voting') return;
    
    this.gameData.votes.set(player.id, data.votedPlayerId);
    
    // Broadcast vote count (without revealing who voted for whom)
    const voteCount = this.gameData.votes.size;
    const connectedPlayers = this.lobby.players.filter(p => p.connected);
    this.io.to(this.lobby.code).emit('voteUpdate', {
      votesReceived: voteCount,
      totalPlayers: connectedPlayers.length
    });
    
    // If everyone voted, end voting early
    if (voteCount === connectedPlayers.length) {
      this.endVoting();
    }
  }

  handleSpyGuess(socket, player, data) {
    // Only the spy can make a location guess
    if (player.id !== this.gameData.spyId) return;
    
    const guessedCorrectly = data.locationGuess.toLowerCase() === this.gameData.location.toLowerCase();
    
    this.endGame({
      winner: guessedCorrectly ? 'spy' : 'citizens',
      reason: guessedCorrectly ? 'spy_guessed_location' : 'spy_wrong_guess',
      spyGuess: data.locationGuess,
      actualLocation: this.gameData.location
    });
  }

  endVoting() {
    clearInterval(this.timerInterval);
    
    // Count votes
    const voteResults = this.countVotes();
    const mostVotedPlayer = voteResults.mostVoted;
    
    // Check if the most voted player is the spy
    const spyWasFound = mostVotedPlayer && mostVotedPlayer.id === this.gameData.spyId;
    
    if (spyWasFound) {
      this.endGame({
        winner: 'citizens',
        reason: 'spy_caught',
        votedOut: mostVotedPlayer,
        voteResults: voteResults.results
      });
    } else {
      // Give spy a chance to guess the location
      this.gameData.phase = 'spy_guess';
      this.gameData.timer = 30;
      
      this.io.to(this.lobby.code).emit('spyGuessPhase', {
        phase: this.gameData.phase,
        timeRemaining: this.gameData.timer,
        votedOut: mostVotedPlayer,
        message: mostVotedPlayer ? 
          `${mostVotedPlayer.name} was voted out, but they weren't the spy! The spy has 30 seconds to guess the location.` :
          'No clear majority in voting. The spy has 30 seconds to guess the location.'
      });
      
      // Timer for spy guess
      this.timerInterval = setInterval(() => {
        this.gameData.timer--;
        
        if (this.gameData.timer <= 0) {
          this.endGame({
            winner: 'citizens',
            reason: 'spy_timeout',
            actualLocation: this.gameData.location
          });
        }
      }, 1000);
    }
  }

  countVotes() {
    const voteCounts = new Map();
    
    // Count votes for each player
    this.gameData.votes.forEach((votedFor) => {
      voteCounts.set(votedFor, (voteCounts.get(votedFor) || 0) + 1);
    });
    
    // Find player with most votes
    let mostVoted = null;
    let maxVotes = 0;
    let tie = false;
    
    voteCounts.forEach((votes, playerId) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        mostVoted = this.lobby.players.find(p => p.id === playerId);
        tie = false;
      } else if (votes === maxVotes && votes > 0) {
        tie = true;
      }
    });
    
    return {
      mostVoted: tie ? null : mostVoted,
      results: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
        player: this.lobby.players.find(p => p.id === playerId),
        votes
      }))
    };
  }

  endGame(result) {
    clearInterval(this.timerInterval);
    this.gameData.phase = 'finished';
    
    const gameResult = {
      ...result,
      spy: this.lobby.players.find(p => p.id === this.gameData.spyId),
      location: this.gameData.location,
      duration: Math.floor((Date.now() - this.gameData.gameStartTime) / 1000),
      questions: this.gameData.questions
    };
    
    this.io.to(this.lobby.code).emit('spyfallGameEnded', gameResult);
    
    // Reset lobby state
    setTimeout(() => {
      this.lobby.gameState = 'waiting';
      this.lobby.currentGame = null;
      this.cleanup();
    }, 10000); // Show results for 10 seconds
  }

  // RECONNECTION METHODS
  handlePlayerReconnection(oldSocketId, newSocketId, player) {
    console.log(`Spyfall: Player ${player.name} reconnected (${oldSocketId} -> ${newSocketId})`);
    
    // Update spy reference if necessary
    if (this.gameData.spyId === oldSocketId) {
      this.gameData.spyId = newSocketId;
    }
    
    // Set up game event listeners
    this.setupPlayerEvents(player);
    
    // Resend the player's role and current game state
    setTimeout(() => {
      const isSpy = player.id === this.gameData.spyId;
      const roleData = {
        isSpy,
        location: isSpy ? null : this.gameData.location,
        gamePhase: this.gameData.phase,
        timeRemaining: this.gameData.timer
      };
      
      console.log(`Resending Spyfall role to reconnected player ${player.name}:`, roleData);
      this.io.to(newSocketId).emit('roleAssigned', roleData);
      
      // Send current game state
      const connectedPlayers = this.lobby.players.filter(p => p.connected);
      this.io.to(newSocketId).emit('spyfallGameStarted', {
        phase: this.gameData.phase,
        playerCount: connectedPlayers.length,
        timeRemaining: this.gameData.timer
      });
      
      // If voting phase, send voting state
      if (this.gameData.phase === 'voting') {
        this.io.to(newSocketId).emit('spyfallVotingStarted', {
          phase: this.gameData.phase,
          timeRemaining: this.gameData.timer,
          players: connectedPlayers.map(p => ({ id: p.id, name: p.name }))
        });
      }
      
      // If spy guess phase, send spy guess state
      if (this.gameData.phase === 'spy_guess') {
        this.io.to(newSocketId).emit('spyGuessPhase', {
          phase: this.gameData.phase,
          timeRemaining: this.gameData.timer
        });
      }
    }, 1000);
  }

  // Add this method to set up event listeners for a specific player
  setupPlayerEvents(player) {
    const socket = this.io.sockets.sockets.get(player.id);
    if (!socket) return;

    // Remove old listeners to prevent duplicates
    socket.removeAllListeners('requestSpyfallRole');
    socket.removeAllListeners('spyfallQuestion');
    socket.removeAllListeners('spyfallVote');
    socket.removeAllListeners('spyGuess');

    // Set up fresh listeners
    socket.on('requestSpyfallRole', () => {
      this.handleRoleRequest(socket, player);
    });

    socket.on('spyfallQuestion', (data) => {
      this.handleQuestion(socket, player, data);
    });

    socket.on('spyfallVote', (data) => {
      this.handleVote(socket, player, data);
    });

    socket.on('spyGuess', (data) => {
      this.handleSpyGuess(socket, player, data);
    });
  }

  // Update your existing setupGameEvents method to use the new setupPlayerEvents
  setupGameEvents() {
    this.lobby.players.filter(p => p.connected).forEach(player => {
      this.setupPlayerEvents(player);
    });
  }

  handleRoleRequest(socket, player) {
    console.log(`Role request from ${player.name}`);
    
    const isSpy = player.id === this.gameData.spyId;
    const roleData = {
      isSpy,
      location: isSpy ? null : this.gameData.location,
      gamePhase: this.gameData.phase,
      timeRemaining: this.gameData.timer
    };
    
    console.log(`Sending requested role to ${player.name}:`, roleData);
    socket.emit('roleAssigned', roleData);
  }

  cleanup() {
    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    // Remove event listeners
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (socket) {
        socket.removeAllListeners('requestSpyfallRole');
        socket.removeAllListeners('spyfallQuestion');
        socket.removeAllListeners('spyfallVote');
        socket.removeAllListeners('spyGuess');
      }
    });
  }

  // Handle player disconnection
  handlePlayerDisconnect(playerId) {
    // Remove votes from disconnected player
    this.gameData.votes.delete(playerId);
    
    // Find the disconnected player
    const disconnectedPlayer = this.lobby.players.find(p => p.id === playerId);
    if (!disconnectedPlayer) return;
    
    // If the spy disconnected, wait for potential reconnection
    if (playerId === this.gameData.spyId) {
      setTimeout(() => {
        const player = this.lobby.players.find(p => p.persistentId === disconnectedPlayer.persistentId);
        if (!player || !player.connected) {
          // Spy didn't reconnect, end the game
          this.endGame({
            winner: 'citizens',
            reason: 'spy_disconnected'
          });
        }
      }, 30000); // Wait 30 seconds for spy to reconnect
      return;
    }
    
    // Check if we should end voting due to not enough connected players
    const connectedPlayers = this.lobby.players.filter(p => p.connected);
    if (this.gameData.phase === 'voting' && this.gameData.votes.size === connectedPlayers.length) {
      this.endVoting();
    }
    
    // If too few players remain connected, end the game
    if (connectedPlayers.length < 3) {
      setTimeout(() => {
        const currentConnected = this.lobby.players.filter(p => p.connected);
        if (currentConnected.length < 3) {
          this.endGame({
            winner: 'nobody',
            reason: 'insufficient_players'
          });
        }
      }, 30000);
    }
  }
}

module.exports = SpyfallGame;