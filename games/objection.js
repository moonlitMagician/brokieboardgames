// games/objection.js
class ObjectionGame {
  constructor(lobby, io) {
    this.lobby = lobby;
    this.io = io;
    
    this.normalTopics = [
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
      "Ice cream is a breakfast food",
      "Elevators are just vertical trains",
      "Shadows are proof the sun is spying on us",
      "Shoelaces secretly control our thoughts",
      "Cheese is humanity’s greatest invention",
      "The ocean is just soup with too much water",
      "Cereal is actually a type of salad",
      "Bubbles are nature’s way of laughing",
      "Chairs were invented to keep humans from floating away",
      "Sleep is just a free trial for death",
      "Raindrops are sky tears from laughing too hard",
      "Sneezes are brain resets",
      "Cookies taste better when stolen",
      "Maps are just flat globes pretending to be important",
      "Waffles are pancakes with abs",
      "Beards are face scarves",
      "Time zones are a government prank",
      "Lamps are trapped suns",
      "Your reflection is just a stranger who copies you"
    ];

    this.risqueTopics = [
      "Cancel culture has gone too far",
      "Gay sex is better than straight sex",
      "eating ass is the ultimate form of love",
      "Kanye west did no wrong",
      "Gay marriage is not real marriage",
      "Suicide should be encouraged over therapy to save money",
      "Women don't appreciate how good they have it",
      "Social media influencers should be culled",
      "Religion should be completely abolished",
      "The death penalty should be implimented",
      "Wealthy deserve their money, and have worked hard for it",
      "Parents should beat their kids",
      "9/11 really was not that bad and Americans are being dramatic",
      "Modern art is pretentious garbage",
      "One sex is inheritly better than the ohter",
      "There are only two genders, the rest are mental issues",
      "Women don't belong in STEM",
      "Fat-phobia is good for society",
      "Child abuse builds character",
      "You should wait for marriage before having sex",
      "Oral is overrated",
      "Polyamoury is way better than monogamy",
      "Gooning is good for the mind and soul",
      "Everyone is a little gay",
      "Participation trophies are ruining children",
      "Traditional gender roles were better for society",
      "Climate change activism is mostly virtue signaling",
      "Standardized testing is educational racism",
      "Social justice movements do more harm than good",
      "Trump is a great president actually",
      "Capitalism is great for society",
      "Democracy is failing as a system",
      "People struggling with mental health are attention seekers",
      "Cultural appropriation is not a real problem",
      "The nuclear family is an outdated concept",
      "Trigger warnings make people weaker",
      "Meritocracy is a myth that justifies inequality",
      "Men biologically cannot be involved fathers",
      "Poor people must simply just work harder",
      "Smoking should be encouraged to kids"
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
      timer: 120, // 2 minutes for arguing
      gameStartTime: Date.now(),
      roundHistory: [],
      rerollVotes: new Set(),
      useRisqueTopics: false
    };
  }

  startGame() {
    this.initializePlayers();
    this.startNewRound();
    this.setupGameEvents();
  }

  initializePlayers() {
    // Give everyone 3 lives
    this.lobby.players.forEach(player => {
      this.gameData.playerLives.set(player.id, 3);
    });
    this.gameData.alivePlayers = [...this.lobby.players];
    
    // Send initial game state
    setTimeout(() => {
      this.broadcastGameState();
    }, 500);
  }

  startNewRound() {
    // Pick random speaker from alive players
    const randomIndex = Math.floor(Math.random() * this.gameData.alivePlayers.length);
    this.gameData.currentSpeaker = this.gameData.alivePlayers[randomIndex];
    
    // Pick random topic based on settings
    const topicPool = this.gameData.useRisqueTopics ? 
      [...this.normalTopics, ...this.risqueTopics] : 
      this.normalTopics;
    const topicIndex = Math.floor(Math.random() * topicPool.length);
    this.gameData.currentTopic = topicPool[topicIndex];
    
    // Set phase and timer
    this.gameData.phase = 'arguing';
    this.gameData.timer = 120; // 2 minutes to argue
    this.gameData.currentObjector = null;
    this.gameData.objectionArgument = '';
    this.gameData.votes.clear();
    this.gameData.rerollVotes.clear();

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
        // Speaker wins the game when time runs out
        this.addToHistory(`${this.gameData.currentSpeaker.name} wins by successfully arguing for 2 minutes without objection!`);
        this.endGame(this.gameData.currentSpeaker);
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
    if (vote !== 'sustain' && vote !== 'overrule') return;
    
    // Objector cannot vote on their own objection
    if (this.gameData.currentObjector && player.id === this.gameData.currentObjector.id) {
      return;
    }
    
    this.gameData.votes.set(player.id, vote);
    
    // Broadcast vote count
    const sustainVotes = Array.from(this.gameData.votes.values()).filter(v => v === 'sustain').length;
    const overruleVotes = Array.from(this.gameData.votes.values()).filter(v => v === 'overrule').length;
    
    // Total eligible voters (all players except the objector)
    const eligibleVoters = this.lobby.players.filter(p => p.id !== this.gameData.currentObjector.id).length;
    
    this.io.to(this.lobby.code).emit('objectionVoteUpdate', {
      sustain: sustainVotes,
      overrule: overruleVotes,
      total: this.gameData.votes.size,
      totalPlayers: eligibleVoters
    });
    
    // If everyone eligible voted, process immediately
    if (this.gameData.votes.size === eligibleVoters) {
      this.processVotes();
    }
  }

  handleRerollVote(player) {
    if (this.gameData.phase !== 'arguing') return;
    
    this.gameData.rerollVotes.add(player.id);
    
    // Broadcast reroll vote count
    this.io.to(this.lobby.code).emit('rerollVoteUpdate', {
      voters: Array.from(this.gameData.rerollVotes).map(playerId => {
        const p = this.lobby.players.find(player => player.id === playerId);
        return { id: playerId, name: p ? p.name : 'Unknown' };
      }),
      total: this.lobby.players.length
    });
    
    // Check if majority wants to reroll (more than half)
    const requiredVotes = Math.floor(this.lobby.players.length / 2) + 1;
    if (this.gameData.rerollVotes.size >= requiredVotes) {
      console.log(`Topic reroll triggered: ${this.gameData.rerollVotes.size}/${this.lobby.players.length} players voted`);
      this.rerollTopic();
    }
  }

  rerollTopic() {
    // Pick new random topic
    const topicPool = this.gameData.useRisqueTopics ? 
      [...this.normalTopics, ...this.risqueTopics] : 
      this.normalTopics;
    const topicIndex = Math.floor(Math.random() * topicPool.length);
    this.gameData.currentTopic = topicPool[topicIndex];
    
    // Reset timer and votes
    this.gameData.timer = 120;
    this.gameData.rerollVotes.clear();
    
    this.addToHistory(`Topic was rerolled to: "${this.gameData.currentTopic}"`);
    this.broadcastGameState();
    this.startTimer();
  }

  handleTopicToggle(player, useRisque) {
    // Only host can change this setting
    if (!player.isHost) return;
    
    this.gameData.useRisqueTopics = useRisque;
    this.broadcastGameState();
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
      this.gameData.timer = 120; // 2 minutes for new argument
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
        const topicPool = this.gameData.useRisqueTopics ? 
          this.risqueTopics : 
          this.normalTopics;
        const topicIndex = Math.floor(Math.random() * topicPool.length);
        this.gameData.currentSpeaker = this.gameData.currentObjector;
        this.gameData.currentTopic = topicPool[topicIndex];
        this.gameData.phase = 'arguing';
        this.gameData.timer = 120; // 2 minutes
        this.gameData.currentObjector = null;
        this.gameData.objectionArgument = '';
      }
    }
    
    this.gameData.votes.clear();
    this.gameData.rerollVotes.clear();
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
      if (this.gameData.alivePlayers.length === 1) {
        this.endGame(this.gameData.alivePlayers[0]);
      } else {
        this.endGame(null); // No survivors
      }
      return true;
    }
    return false;
  }

  endGame(winner) {
    clearInterval(this.timerInterval);
    this.gameData.phase = 'finished';
    
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
      history: this.gameData.roundHistory.slice(-5), // Last 5 events
      useRisqueTopics: this.gameData.useRisqueTopics,
      rerollVotes: Array.from(this.gameData.rerollVotes).map(playerId => {
        const p = this.lobby.players.find(player => player.id === playerId);
        return { id: playerId, name: p ? p.name : 'Unknown' };
      })
    };
    
    this.io.to(this.lobby.code).emit('objectionGameState', gameState);
  }

  setupGameEvents() {
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (!socket) return;

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

      socket.on('rerollVote', () => {
        this.handleRerollVote(player);
      });

      socket.on('toggleRisqueTopics', (data) => {
        this.handleTopicToggle(player, data.useRisque);
      });
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
        socket.removeAllListeners('rerollVote');
        socket.removeAllListeners('toggleRisqueTopics');
      }
    });
  }

  handlePlayerDisconnect(playerId) {
    // Remove from alive players
    this.gameData.alivePlayers = this.gameData.alivePlayers.filter(p => p.id !== playerId);
    
    // If current speaker or objector disconnected, start new round
    if (this.gameData.currentSpeaker?.id === playerId || this.gameData.currentObjector?.id === playerId) {
      if (this.gameData.alivePlayers.length > 1) {
        this.startNewRound();
      } else {
        this.endGame(this.gameData.alivePlayers[0] || null);
      }
      return;
    }
    
    // Remove any pending votes
    this.gameData.votes.delete(playerId);
    this.gameData.rerollVotes.delete(playerId);
    
    // Check if game should continue
    if (this.gameData.alivePlayers.length <= 1) {
      this.endGame(this.gameData.alivePlayers[0] || null);
    }
  }
}

module.exports = ObjectionGame;