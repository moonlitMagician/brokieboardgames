// games/objection.js
class ObjectionGame {
  constructor(lobby, io) {
    this.lobby = lobby;
    this.io = io;
    
    this.topics = [
      // Normal topics
      "Pineapple belongs on pizza",
      "Cats are better than dogs",
      "Morning showers are superior to evening showers",
      "Books are better than movies",
      "Summer is the best season",
      "Coffee is overrated",
      "Social media is harmful to society",
      "Working from home is more productive",
      "Breakfast is the most important meal",
      "Physical books are better than e-books",
      
      // Weird/Nonsensical topics
      "Socks should be considered a vegetable",
      "Gravity is just a conspiracy by the shoe industry",
      "Penguins are secret government agents",
      "Clouds are actually just sky sheep",
      "Mondays should be illegal",
      "Spoons are the most dangerous utensil",
      "Trees are plotting against humans",
      "The moon is made of abandoned dreams",
      "Escalators are just lazy stairs",
      "Bananas are trying to communicate with us",
      "Doorknobs have feelings",
      "Fish invented swimming to mock humans",
      "Toasters are time machines in disguise",
      "Pigeons are the real rulers of cities",
      "Sandwiches taste better when cut diagonally because of physics",
      "Aliens refuse to visit Earth because of our music taste",
      "Socks disappear in the dryer to start their own civilization",
      "Mirrors are windows to a parallel universe where everyone is left-handed",
      "Hiccups are attempts by your soul to escape",
      "Traffic lights are actually mood rings for the city",
      "The SA goverenment is fully functional",
      //morally dubious concepts
      //"Oranje is a perfect place to live",
      //"Hitler was right",
      //"9/11 was a inside job",
      //"The being gay is okay but the rest of the spectrum is wrong",
      //"There are only 2 genders and 72 mental disorders",
      //"Obama wasnt a good president",
      //"Being racist is funny",
      //"People should beat their kids more",
      //"Being feminist doesnt give you the right to complain about nothin",
      //"Being vegan destroys your bodies microbiome",
      //"The wage gape in sports is only because male athletes are better",
      //"You shouldnt shower every day",
      //"You must forcefully imposse your belif on other people",
      //"The bay of pigs shouldnt get any backlash becuase it worked",
      //"SLavery was 200 years ago you cannot keep blaming white people"
      
      
    ];

    this.gameData = {
      phase: 'arguing', // arguing, objection, voting, finished
      currentSpeaker: null,
      currentTopic: '',
      currentObjector: null,
      objectionArgument: '',
      playerLives: new Map(), // playerId -> lives count
      alivePlayers: [],
      eliminatedPlayers: [],
      votes: new Map(), // playerId -> 'sustain' or 'overrule'
      timer: 0,
      gameStartTime: Date.now(),
      roundHistory: []
    };
  }

  startGame() {
    this.initializePlayers();
    this.startNewRound();
    this.setupGameEvents();
  }

  initializePlayers() {
    // Give everyone 3 lives
    this.lobby.players.filter(p => p.connected).forEach(player => {
      this.gameData.playerLives.set(player.id, 3);
    });
    this.gameData.alivePlayers = [...this.lobby.players.filter(p => p.connected)];
    
    // Send initial game state
    setTimeout(() => {
      this.broadcastGameState();
    }, 500);
  }

  startNewRound() {
    // Pick random speaker from alive players
    const randomIndex = Math.floor(Math.random() * this.gameData.alivePlayers.length);
    this.gameData.currentSpeaker = this.gameData.alivePlayers[randomIndex];
    
    // Pick random topic
    const topicIndex = Math.floor(Math.random() * this.topics.length);
    this.gameData.currentTopic = this.topics[topicIndex];
    
    // Set phase and timer
    this.gameData.phase = 'arguing';
    this.gameData.timer = 300; // 5 minutes to argue (or until objection)
    this.gameData.currentObjector = null;
    this.gameData.objectionArgument = '';
    this.gameData.votes.clear();

    this.broadcastGameState();
    this.startTimer();
  }

  startTimer() {
    clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      this.gameData.timer--;
      
      // Broadcast timer updates
      if (this.gameData.timer % 10 === 0 || this.gameData.timer <= 10) {
        this.io.to(this.lobby.code).emit('objectionTimerUpdate', {
          timeRemaining: this.gameData.timer
        });
      }
      
      // Handle timeouts
      if (this.gameData.timer <= 0) {
        this.handleTimeout();
      }
    }, 1000);
  }

  handleTimeout() {
    switch (this.gameData.phase) {
      case 'arguing':
        // If no objection, speaker "wins" this round, start new round
        this.addToHistory(`${this.gameData.currentSpeaker.name} argued successfully for "${this.gameData.currentTopic}" with no objections`);
        this.startNewRound();
        break;
        
      case 'objection':
        // Objector ran out of time, auto-overrule
        this.handleObjectionVerdict('overrule');
        break;
        
      case 'voting':
        // Voting time up, count existing votes
        this.processVotes();
        break;
    }
  }

  handleObjection(objectingPlayer, objectionText) {
    if (this.gameData.phase !== 'arguing') return;
    if (!this.gameData.alivePlayers.find(p => p.id === objectingPlayer.id)) return;
    if (objectingPlayer.id === this.gameData.currentSpeaker.id) return; // Can't object to yourself
    
    this.gameData.phase = 'objection';
    this.gameData.currentObjector = objectingPlayer;
    this.gameData.objectionArgument = objectionText;
    this.gameData.timer = 60; // 1 minute to make objection case
    
    this.broadcastGameState();
    this.startTimer();
  }

  startVoting() {
    this.gameData.phase = 'voting';
    this.gameData.timer = 30; // 30 seconds to vote
    this.gameData.votes.clear();
    
    this.broadcastGameState();
    this.startTimer();
  }

  handleVote(player, vote) {
    if (this.gameData.phase !== 'voting') return;
    if (!this.gameData.alivePlayers.find(p => p.id === player.id)) return;
    if (vote !== 'sustain' && vote !== 'overrule') return;
    
    this.gameData.votes.set(player.id, vote);
    
    // Broadcast vote count
    const sustainVotes = Array.from(this.gameData.votes.values()).filter(v => v === 'sustain').length;
    const overruleVotes = Array.from(this.gameData.votes.values()).filter(v => v === 'overrule').length;
    
    this.io.to(this.lobby.code).emit('objectionVoteUpdate', {
      sustainVotes,
      overruleVotes,
      totalVotes: this.gameData.votes.size,
      totalPlayers: this.gameData.alivePlayers.length
    });
    
    // If everyone voted, process immediately
    if (this.gameData.votes.size === this.gameData.alivePlayers.length) {
      this.processVotes();
    }
  }

  processVotes() {
    clearInterval(this.timerInterval);
    
    const sustainVotes = Array.from(this.gameData.votes.values()).filter(v => v === 'sustain').length;
    const overruleVotes = Array.from(this.gameData.votes.values()).filter(v => v === 'overrule').length;
    
    // Majority wins, ties go to overrule
    const verdict = sustainVotes > overruleVotes ? 'sustain' : 'overrule';
    
    this.handleObjectionVerdict(verdict);
  }

  handleObjectionVerdict(verdict) {
    if (verdict === 'sustain') {
      // Objection sustained - objector becomes new speaker with their argument as topic
      this.addToHistory(`${this.gameData.currentObjector.name} successfully objected to "${this.gameData.currentTopic}"`);
      
      this.gameData.currentSpeaker = this.gameData.currentObjector;
      this.gameData.currentTopic = this.gameData.objectionArgument;
      this.gameData.phase = 'arguing';
      this.gameData.timer = 300; // 5 minutes for new argument
      this.gameData.currentObjector = null;
      this.gameData.objectionArgument = '';
      
    } else {
      // Objection overruled - objector loses life and gets new topic
      this.addToHistory(`${this.gameData.currentObjector.name}'s objection to "${this.gameData.currentTopic}" was overruled`);
      
      const currentLives = this.gameData.playerLives.get(this.gameData.currentObjector.id);
      const newLives = currentLives - 1;
      this.gameData.playerLives.set(this.gameData.currentObjector.id, newLives);
      
      if (newLives <= 0) {
        // Player eliminated
        this.eliminatePlayer(this.gameData.currentObjector);
        if (this.checkGameEnd()) return;
        this.startNewRound();
      } else {
        // Give objector new topic
        const topicIndex = Math.floor(Math.random() * this.topics.length);
        this.gameData.currentSpeaker = this.gameData.currentObjector;
        this.gameData.currentTopic = this.topics[topicIndex];
        this.gameData.phase = 'arguing';
        this.gameData.timer = 300;
        this.gameData.currentObjector = null;
        this.gameData.objectionArgument = '';
      }
    }
    
    this.gameData.votes.clear();
    this.broadcastGameState();
    this.startTimer();
  }

  eliminatePlayer(player) {
    this.gameData.alivePlayers = this.gameData.alivePlayers.filter(p => p.id !== player.id);
    this.gameData.eliminatedPlayers.push(player);
    
    this.addToHistory(`${player.name} was eliminated with 0 lives remaining`);
    
    this.io.to(this.lobby.code).emit('playerEliminated', {
      eliminated: player,
      remainingPlayers: this.gameData.alivePlayers.length
    });
  }

  checkGameEnd() {
    if (this.gameData.alivePlayers.length <= 1) {
      this.endGame();
      return true;
    }
    return false;
  }

  endGame() {
    clearInterval(this.timerInterval);
    this.gameData.phase = 'finished';
    
    const winner = this.gameData.alivePlayers.length === 1 ? this.gameData.alivePlayers[0] : null;
    
    const gameResult = {
      winner,
      duration: Math.floor((Date.now() - this.gameData.gameStartTime) / 1000),
      finalLives: Array.from(this.gameData.playerLives.entries()).map(([playerId, lives]) => ({
        player: this.lobby.players.find(p => p.id === playerId),
        lives
      })),
      history: this.gameData.roundHistory,
      survivors: this.gameData.alivePlayers,
      eliminated: this.gameData.eliminatedPlayers
    };
    
    this.io.to(this.lobby.code).emit('objectionGameEnded', gameResult);
    
    setTimeout(() => {
      this.lobby.gameState = 'waiting';
      this.lobby.currentGame = null;
      this.cleanup();
    }, 15000);
  }

  addToHistory(event) {
    this.gameData.roundHistory.push({
      timestamp: new Date().toISOString(),
      event
    });
  }

  broadcastGameState() {
    const gameState = {
      phase: this.gameData.phase,
      currentSpeaker: this.gameData.currentSpeaker,
      currentTopic: this.gameData.currentTopic,
      currentObjector: this.gameData.currentObjector,
      objectionArgument: this.gameData.objectionArgument,
      timeRemaining: this.gameData.timer,
      playerLives: Array.from(this.gameData.playerLives.entries()).map(([playerId, lives]) => ({
        player: this.lobby.players.find(p => p.id === playerId),
        lives
      })),
      alivePlayers: this.gameData.alivePlayers,
      eliminatedPlayers: this.gameData.eliminatedPlayers,
      history: this.gameData.roundHistory.slice(-5) // Last 5 events
    };
    
    this.io.to(this.lobby.code).emit('objectionGameState', gameState);
  }

  // RECONNECTION METHODS
  handlePlayerReconnection(oldSocketId, newSocketId, player) {
    console.log(`Objection: Player ${player.name} reconnected (${oldSocketId} -> ${newSocketId})`);
    
    this.setupPlayerEvents(player);
    
    setTimeout(() => {
      // Resend current game state
      this.broadcastGameState();
      
      // If player was the current speaker or objector, update accordingly
      if (this.gameData.currentSpeaker?.id === oldSocketId) {
        this.gameData.currentSpeaker.id = newSocketId;
      }
      if (this.gameData.currentObjector?.id === oldSocketId) {
        this.gameData.currentObjector.id = newSocketId;
      }
    }, 1000);
  }

  setupPlayerEvents(player) {
    const socket = this.io.sockets.sockets.get(player.id);
    if (!socket) return;

    // Remove old listeners to prevent duplicates
    socket.removeAllListeners('requestObjectionState');
    socket.removeAllListeners('makeObjection');
    socket.removeAllListeners('finishObjectionArgument');
    socket.removeAllListeners('objectionVote');

    // Set up fresh listeners
    socket.on('requestObjectionState', () => {
      this.broadcastGameState();
    });

    socket.on('makeObjection', (data) => {
      this.handleObjection(player, data.objectionText);
    });

    socket.on('finishObjectionArgument', () => {
      if (this.gameData.currentObjector?.id === player.id && this.gameData.phase === 'objection') {
        this.startVoting();
      }
    });

    socket.on('objectionVote', (data) => {
      this.handleVote(player, data.vote);
    });
  }

  setupGameEvents() {
    this.lobby.players.filter(p => p.connected).forEach(player => {
      this.setupPlayerEvents(player);
    });
  }

  cleanup() {
    clearInterval(this.timerInterval);
    
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (socket) {
        socket.removeAllListeners('requestObjectionState');
        socket.removeAllListeners('makeObjection');
        socket.removeAllListeners('finishObjectionArgument');
        socket.removeAllListeners('objectionVote');
      }
    });
  }

  handlePlayerDisconnect(playerId) {
    const disconnectedPlayer = this.lobby.players.find(p => p.id === playerId);
    if (!disconnectedPlayer) return;
    
    // Remove any pending votes
    this.gameData.votes.delete(playerId);
    
    // If current speaker or objector disconnected, handle appropriately
    if (this.gameData.currentSpeaker?.id === playerId || this.gameData.currentObjector?.id === playerId) {
      // Wait for potential reconnection before starting new round
      setTimeout(() => {
        const player = this.lobby.players.find(p => p.persistentId === disconnectedPlayer.persistentId);
        if (!player || !player.connected) {
          // Player didn't reconnect, start new round or end game
          if (this.gameData.alivePlayers.filter(p => p.connected).length > 1) {
            this.startNewRound();
          } else {
            this.endGame();
          }
        }
      }, 30000); // Wait 30 seconds for reconnection
      return;
    }
    
    // Check if game should continue
    const connectedAlivePlayers = this.gameData.alivePlayers.filter(p => p.connected);
    if (connectedAlivePlayers.length <= 1) {
      setTimeout(() => {
        const currentConnected = this.gameData.alivePlayers.filter(p => p.connected);
        if (currentConnected.length <= 1) {
          this.endGame();
        }
      }, 30000);
    }
  }
}

module.exports = ObjectionGame;
