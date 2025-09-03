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

  // Initialize the game
  startGame() {
    this.selectLocationAndSpy();
    this.assignRoles();
    this.startTimer();
    this.notifyGameStarted();
    
    // Set up game event listeners
    this.setupGameEvents();
  }

  selectLocationAndSpy() {
    // Select random location
    this.gameData.location = this.locations[Math.floor(Math.random() * this.locations.length)];
    
    // Select random spy
    const spyIndex = Math.floor(Math.random() * this.lobby.players.length);
    this.gameData.spyId = this.lobby.players[spyIndex].id;
    
    console.log(`Spyfall Game: Location is "${this.gameData.location}", Spy is "${this.lobby.players[spyIndex].name}"`);
  }

  assignRoles() {
    // Send role-specific data to each player with delay to ensure components are ready
    setTimeout(() => {
      this.lobby.players.forEach((player) => {
        const isSpy = player.id === this.gameData.spyId;
        const roleData = {
          isSpy,
          location: isSpy ? null : this.gameData.location,
          gamePhase: this.gameData.phase,
          timeRemaining: this.gameData.timer
        };
        
        console.log(`Sending role to ${player.name}:`, roleData);
        this.io.to(player.id).emit('roleAssigned', roleData);
      });
    }, 500);
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
    this.io.to(this.lobby.code).emit('spyfallGameStarted', {
      phase: this.gameData.phase,
      playerCount: this.lobby.players.length,
      timeRemaining: this.gameData.timer
    });
  }

  setupGameEvents() {
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (!socket) return;

      // Handle role requests (for reconnection or late loading)
      socket.on('requestSpyfallRole', () => {
        this.handleRoleRequest(socket, player);
      });

      // Handle questions/discussion
      socket.on('spyfallQuestion', (data) => {
        this.handleQuestion(socket, player, data);
      });

      // Handle voting
      socket.on('spyfallVote', (data) => {
        this.handleVote(socket, player, data);
      });

      // Handle spy guess
      socket.on('spyGuess', (data) => {
        this.handleSpyGuess(socket, player, data);
      });
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

  startVotingPhase() {
    if (this.gameData.phase !== 'discussion') return;
    
    clearInterval(this.timerInterval);
    this.gameData.phase = 'voting';
    this.gameData.timer = 60; // 1 minute for voting
    this.gameData.votes.clear();
    
    this.io.to(this.lobby.code).emit('spyfallVotingStarted', {
      phase: this.gameData.phase,
      timeRemaining: this.gameData.timer,
      players: this.lobby.players.map(p => ({ id: p.id, name: p.name }))
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

  handleVote(socket, player, data) {
    if (this.gameData.phase !== 'voting') return;
    
    this.gameData.votes.set(player.id, data.votedPlayerId);
    
    // Broadcast vote count (without revealing who voted for whom)
    const voteCount = this.gameData.votes.size;
    this.io.to(this.lobby.code).emit('voteUpdate', {
      votesReceived: voteCount,
      totalPlayers: this.lobby.players.length
    });
    
    // If everyone voted, end voting early
    if (voteCount === this.lobby.players.length) {
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
    
    // If the spy disconnected, end the game
    if (playerId === this.gameData.spyId) {
      this.endGame({
        winner: 'citizens',
        reason: 'spy_disconnected'
      });
      return;
    }
    
    // Check if we should end voting due to not enough players
    if (this.gameData.phase === 'voting' && this.gameData.votes.size === this.lobby.players.length) {
      this.endVoting();
    }
  }
}

module.exports = SpyfallGame;