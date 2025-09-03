// games/codenames.js
class CodenamesGame {
  constructor(lobby, io) {
    this.lobby = lobby;
    this.io = io;
    
    this.wordBank = [
      // Animals
      "LION", "EAGLE", "SHARK", "ELEPHANT", "TIGER", "WOLF", "BEAR", "DOLPHIN", "PENGUIN", "GIRAFFE",
      "ZEBRA", "KANGAROO", "OCTOPUS", "BUTTERFLY", "SPIDER", "SNAKE", "RABBIT", "HORSE", "COW", "PIG",
      
      // Objects
      "BOOK", "CHAIR", "TABLE", "PHONE", "COMPUTER", "CAR", "BICYCLE", "CLOCK", "MIRROR", "LAMP",
      "CAMERA", "GUITAR", "PIANO", "SWORD", "SHIELD", "CROWN", "DIAMOND", "KEY", "LOCK", "BRIDGE",
      
      // Places
      "BEACH", "MOUNTAIN", "FOREST", "DESERT", "CITY", "VILLAGE", "CASTLE", "SCHOOL", "HOSPITAL", "PARK",
      "LIBRARY", "MUSEUM", "THEATER", "STADIUM", "AIRPORT", "STATION", "HOTEL", "RESTAURANT", "BANK", "SHOP",
      
      // Abstract
      "LOVE", "FREEDOM", "PEACE", "WAR", "TIME", "SPACE", "ENERGY", "POWER", "MAGIC", "DREAM",
      "HOPE", "FEAR", "JOY", "ANGER", "WISDOM", "TRUTH", "LIE", "SECRET", "MYSTERY", "ADVENTURE",
      
      // Actions
      "RUN", "JUMP", "SWIM", "FLY", "DANCE", "SING", "WRITE", "READ", "THINK", "SLEEP",
      "EAT", "DRINK", "PLAY", "WORK", "STUDY", "TRAVEL", "EXPLORE", "DISCOVER", "CREATE", "DESTROY",
      
      // Colors/Elements
      "RED", "BLUE", "GREEN", "YELLOW", "BLACK", "WHITE", "SILVER", "GOLD", "FIRE", "WATER",
      "EARTH", "AIR", "ICE", "LIGHTNING", "SHADOW", "LIGHT", "DARK", "BRIGHT", "RAINBOW", "STORM",
      
      // Food
      "APPLE", "BANANA", "ORANGE", "PIZZA", "BURGER", "CAKE", "BREAD", "CHEESE", "MILK", "COFFEE",
      "TEA", "SOUP", "FISH", "CHICKEN", "BEEF", "RICE", "PASTA", "SALAD", "COOKIE", "CHOCOLATE",
      
      // Science/Tech
      "ROBOT", "LASER", "ROCKET", "SATELLITE", "ATOM", "MOLECULE", "VIRUS", "BACTERIA", "GENE", "BRAIN",
      "HEART", "BLOOD", "BONE", "MUSCLE", "NERVE", "CELL", "ORGAN", "SYSTEM", "NETWORK", "CODE"
    ];

    this.gameData = {
      phase: 'setup', // setup, playing, finished
      teams: {
        red: { players: [], spymaster: null, wordsFound: 0, wordsTotal: 0 },
        blue: { players: [], spymaster: null, wordsFound: 0, wordsTotal: 0 }
      },
      currentTeam: 'red', // red or blue
      grid: [], // 5x5 grid of words with colors
      keyCard: [], // spymaster view of colors
      currentClue: null, // { word: string, number: number, from: playerId }
      guessesRemaining: 0,
      revealedWords: new Set(),
      gameStartTime: Date.now(),
      winner: null,
      gameHistory: []
    };
  }

  startGame() {
    this.assignTeams();
    this.generateGrid();
    this.broadcastGameState();
    this.setupGameEvents();
    
    this.addToHistory("Game started! Red team goes first.");
  }

  assignTeams() {
    const shuffledPlayers = [...this.lobby.players].sort(() => Math.random() - 0.5);
    
    // Assign players to teams alternately
    shuffledPlayers.forEach((player, index) => {
      const team = index % 2 === 0 ? 'red' : 'blue';
      this.gameData.teams[team].players.push(player);
    });
    
    // Assign spymasters (first player of each team)
    this.gameData.teams.red.spymaster = this.gameData.teams.red.players[0];
    this.gameData.teams.blue.spymaster = this.gameData.teams.blue.players[0];
    
    console.log('Teams assigned:', {
      red: this.gameData.teams.red.players.map(p => p.name),
      blue: this.gameData.teams.blue.players.map(p => p.name),
      redSpymaster: this.gameData.teams.red.spymaster.name,
      blueSpymaster: this.gameData.teams.blue.spymaster.name
    });
  }

  generateGrid() {
    // Randomly select 25 words
    const shuffledWords = [...this.wordBank].sort(() => Math.random() - 0.5).slice(0, 25);
    
    // Create color assignment
    // Standard Codenames: 9 for starting team, 8 for other team, 7 neutral, 1 assassin
    const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
    const otherTeam = startingTeam === 'red' ? 'blue' : 'red';
    
    this.gameData.currentTeam = startingTeam;
    
    const colors = [
      ...Array(9).fill(startingTeam),
      ...Array(8).fill(otherTeam),
      ...Array(7).fill('neutral'),
      'assassin'
    ].sort(() => Math.random() - 0.5);
    
    // Set word totals
    this.gameData.teams[startingTeam].wordsTotal = 9;
    this.gameData.teams[otherTeam].wordsTotal = 8;
    
    // Create grid with words and colors
    this.gameData.grid = shuffledWords.map((word, index) => ({
      word,
      color: colors[index],
      revealed: false,
      position: { row: Math.floor(index / 5), col: index % 5 }
    }));
    
    // Create key card for spymasters
    this.gameData.keyCard = this.gameData.grid.map(cell => ({
      word: cell.word,
      color: cell.color,
      position: cell.position
    }));
    
    this.gameData.phase = 'playing';
  }

  broadcastGameState() {
    // Send different data to spymasters vs operatives
    this.lobby.players.forEach(player => {
      const playerTeam = this.getPlayerTeam(player.id);
      const isSpymaster = this.isSpymaster(player.id);
      
      const gameState = {
        phase: this.gameData.phase,
        teams: {
          red: {
            players: this.gameData.teams.red.players.map(p => ({ id: p.id, name: p.name })),
            spymaster: { id: this.gameData.teams.red.spymaster.id, name: this.gameData.teams.red.spymaster.name },
            wordsFound: this.gameData.teams.red.wordsFound,
            wordsTotal: this.gameData.teams.red.wordsTotal
          },
          blue: {
            players: this.gameData.teams.blue.players.map(p => ({ id: p.id, name: p.name })),
            spymaster: { id: this.gameData.teams.blue.spymaster.id, name: this.gameData.teams.blue.spymaster.name },
            wordsFound: this.gameData.teams.blue.wordsFound,
            wordsTotal: this.gameData.teams.blue.wordsTotal
          }
        },
        playerTeam,
        isSpymaster,
        currentTeam: this.gameData.currentTeam,
        currentClue: this.gameData.currentClue,
        guessesRemaining: this.gameData.guessesRemaining,
        grid: this.gameData.grid.map(cell => ({
          word: cell.word,
          revealed: cell.revealed,
          color: cell.revealed ? cell.color : null,
          position: cell.position
        })),
        keyCard: isSpymaster ? this.gameData.keyCard : null,
        history: this.gameData.gameHistory.slice(-10),
        winner: this.gameData.winner
      };
      
      this.io.to(player.id).emit('codenamesGameState', gameState);
    });
  }

  getPlayerTeam(playerId) {
    if (this.gameData.teams.red.players.find(p => p.id === playerId)) return 'red';
    if (this.gameData.teams.blue.players.find(p => p.id === playerId)) return 'blue';
    return null;
  }

  isSpymaster(playerId) {
    return this.gameData.teams.red.spymaster.id === playerId || 
           this.gameData.teams.blue.spymaster.id === playerId;
  }

  handleClue(player, clueData) {
    const playerTeam = this.getPlayerTeam(player.id);
    
    // Validate clue giver
    if (!this.isSpymaster(player.id) || playerTeam !== this.gameData.currentTeam) {
      return;
    }
    
    if (this.gameData.currentClue) {
      return; // Clue already given
    }
    
    const { word, number } = clueData;
    
    if (!word || !word.trim() || number < 1 || number > 9) {
      this.io.to(player.id).emit('error', 'Invalid clue format');
      return;
    }
    
    this.gameData.currentClue = {
      word: word.toUpperCase().trim(),
      number: parseInt(number),
      from: player.id,
      fromName: player.name
    };
    
    this.gameData.guessesRemaining = parseInt(number) + 1; // +1 bonus guess
    
    this.addToHistory(`${playerTeam.toUpperCase()} Spymaster gave clue: "${this.gameData.currentClue.word}" for ${this.gameData.currentClue.number} words`);
    this.broadcastGameState();
  }

  handleGuess(player, wordIndex) {
    const playerTeam = this.getPlayerTeam(player.id);
    
    // Validate guess
    if (this.isSpymaster(player.id)) {
      this.io.to(player.id).emit('error', 'Spymasters cannot make guesses');
      return;
    }
    
    if (playerTeam !== this.gameData.currentTeam) {
      this.io.to(player.id).emit('error', 'Not your team\'s turn');
      return;
    }
    
    if (!this.gameData.currentClue) {
      this.io.to(player.id).emit('error', 'Wait for your spymaster to give a clue');
      return;
    }
    
    if (this.gameData.guessesRemaining <= 0) {
      this.io.to(player.id).emit('error', 'No guesses remaining');
      return;
    }
    
    const cell = this.gameData.grid[wordIndex];
    if (!cell || cell.revealed) {
      this.io.to(player.id).emit('error', 'Invalid word selection');
      return;
    }
    
    // Reveal the word
    cell.revealed = true;
    this.gameData.revealedWords.add(wordIndex);
    this.gameData.guessesRemaining--;
    
    const wordColor = cell.color;
    this.addToHistory(`${player.name} (${playerTeam.toUpperCase()}) guessed "${cell.word}" - ${wordColor.toUpperCase()}`);
    
    // Handle different word types
    if (wordColor === 'assassin') {
      // Game over - team that guessed assassin loses
      this.endGame(playerTeam === 'red' ? 'blue' : 'red', 'assassin');
      return;
    } else if (wordColor === playerTeam) {
      // Correct guess - team word
      this.gameData.teams[playerTeam].wordsFound++;
      
      // Check win condition
      if (this.gameData.teams[playerTeam].wordsFound >= this.gameData.teams[playerTeam].wordsTotal) {
        this.endGame(playerTeam, 'all_words_found');
        return;
      }
      
      // Team can continue guessing if they have guesses left
      if (this.gameData.guessesRemaining <= 0) {
        this.endTurn();
      }
    } else {
      // Wrong guess - neutral or other team's word
      if (wordColor !== 'neutral') {
        // Other team's word - they get a point
        const otherTeam = playerTeam === 'red' ? 'blue' : 'red';
        this.gameData.teams[otherTeam].wordsFound++;
        
        // Check if other team won
        if (this.gameData.teams[otherTeam].wordsFound >= this.gameData.teams[otherTeam].wordsTotal) {
          this.endGame(otherTeam, 'all_words_found');
          return;
        }
      }
      
      this.endTurn();
    }
    
    this.broadcastGameState();
  }

  handleEndTurn(player) {
    const playerTeam = this.getPlayerTeam(player.id);
    
    if (playerTeam !== this.gameData.currentTeam || this.isSpymaster(player.id)) {
      return;
    }
    
    this.endTurn();
  }

  endTurn() {
    this.gameData.currentTeam = this.gameData.currentTeam === 'red' ? 'blue' : 'red';
    this.gameData.currentClue = null;
    this.gameData.guessesRemaining = 0;
    
    this.addToHistory(`Turn switched to ${this.gameData.currentTeam.toUpperCase()} team`);
    this.broadcastGameState();
  }

  endGame(winner, reason) {
    this.gameData.phase = 'finished';
    this.gameData.winner = winner;
    
    const reasonText = {
      'all_words_found': 'Found all their words!',
      'assassin': 'Other team hit the assassin!'
    };
    
    this.addToHistory(`Game Over! ${winner.toUpperCase()} team wins - ${reasonText[reason]}`);
    
    // Reveal all words
    this.gameData.grid.forEach(cell => {
      cell.revealed = true;
    });
    
    const gameResult = {
      winner,
      reason,
      duration: Math.floor((Date.now() - this.gameData.gameStartTime) / 1000),
      finalScore: {
        red: this.gameData.teams.red.wordsFound,
        blue: this.gameData.teams.blue.wordsFound
      },
      teams: this.gameData.teams,
      history: this.gameData.gameHistory
    };
    
    this.io.to(this.lobby.code).emit('codenamesGameEnded', gameResult);
    
    setTimeout(() => {
      this.lobby.gameState = 'waiting';
      this.lobby.currentGame = null;
      this.cleanup();
    }, 20000);
  }

  addToHistory(event) {
    this.gameData.gameHistory.push({
      timestamp: new Date().toISOString(),
      event
    });
  }

  setupGameEvents() {
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (!socket) return;

      socket.on('requestCodenamesState', () => {
        this.broadcastGameState();
      });

      socket.on('codenamesClue', (data) => {
        this.handleClue(player, data);
      });

      socket.on('codenamesGuess', (data) => {
        this.handleGuess(player, data.wordIndex);
      });

      socket.on('codenamesEndTurn', () => {
        this.handleEndTurn(player);
      });
    });
  }

  cleanup() {
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (socket) {
        socket.removeAllListeners('requestCodenamesState');
        socket.removeAllListeners('codenamesClue');
        socket.removeAllListeners('codenamesGuess');
        socket.removeAllListeners('codenamesEndTurn');
      }
    });
  }

  handlePlayerDisconnect(playerId) {
    // Remove from teams
    this.gameData.teams.red.players = this.gameData.teams.red.players.filter(p => p.id !== playerId);
    this.gameData.teams.blue.players = this.gameData.teams.blue.players.filter(p => p.id !== playerId);
    
    // If a spymaster disconnected, assign new one
    if (this.gameData.teams.red.spymaster?.id === playerId && this.gameData.teams.red.players.length > 0) {
      this.gameData.teams.red.spymaster = this.gameData.teams.red.players[0];
      this.addToHistory(`New RED spymaster: ${this.gameData.teams.red.spymaster.name}`);
    }
    
    if (this.gameData.teams.blue.spymaster?.id === playerId && this.gameData.teams.blue.players.length > 0) {
      this.gameData.teams.blue.spymaster = this.gameData.teams.blue.players[0];
      this.addToHistory(`New BLUE spymaster: ${this.gameData.teams.blue.spymaster.name}`);
    }
    
    // End game if not enough players
    if (this.gameData.teams.red.players.length === 0 || this.gameData.teams.blue.players.length === 0) {
      this.endGame('nobody', 'insufficient_players');
    } else {
      this.broadcastGameState();
    }
  }
}

module.exports = CodenamesGame;