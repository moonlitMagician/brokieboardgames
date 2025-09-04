// games/mafia.js
class MafiaGame {
  constructor(lobby, io) {
    this.lobby = lobby;
    this.io = io;
    
    this.gameData = {
      phase: 'night', // night, day, voting, results
      dayNumber: 1,
      nightActions: new Map(), // playerId -> action
      votes: new Map(), // playerId -> votedForId
      alivePlayers: [],
      deadPlayers: [],
      roles: new Map(), // playerId -> role
      gameStartTime: Date.now(),
      timer: 120, // 2 minutes per phase
      nightResults: {
        killed: null,
        saved: null,
        investigated: null
      }
    };

    this.roleDistribution = this.calculateRoles(lobby.players.length);
  }

  calculateRoles(playerCount) {
    // Role distribution based on player count
    if (playerCount < 4) return null; // Minimum 4 players
    
    let mafia = Math.floor(playerCount / 3); // 1 mafia per 3 players
    let detective = 1;
    let doctor = playerCount >= 6 ? 1 : 0; // Doctor only with 6+ players
    let villagers = playerCount - mafia - detective - doctor;

    return {
      mafia,
      detective,
      doctor,
      villagers,
      total: playerCount
    };
  }

  startGame() {
    if (!this.roleDistribution) {
      this.io.to(this.lobby.code).emit('error', 'Not enough players for Mafia');
      return;
    }

    this.assignRoles();
    this.setupAlivePlayers();
    this.startNightPhase();
    this.setupGameEvents();
  }

  assignRoles() {
    const shuffledPlayers = [...this.lobby.players].sort(() => Math.random() - 0.5);
    let roleIndex = 0;

    // Assign Mafia
    for (let i = 0; i < this.roleDistribution.mafia; i++) {
      this.gameData.roles.set(shuffledPlayers[roleIndex].id, 'mafia');
      roleIndex++;
    }

    // Assign Detective
    this.gameData.roles.set(shuffledPlayers[roleIndex].id, 'detective');
    roleIndex++;

    // Assign Doctor (if applicable)
    if (this.roleDistribution.doctor > 0) {
      this.gameData.roles.set(shuffledPlayers[roleIndex].id, 'doctor');
      roleIndex++;
    }

    // Assign remaining as Villagers
    for (let i = roleIndex; i < shuffledPlayers.length; i++) {
      this.gameData.roles.set(shuffledPlayers[i].id, 'villager');
    }

    // Send roles to players
    setTimeout(() => {
      shuffledPlayers.forEach(player => {
        const role = this.gameData.roles.get(player.id);
        const roleData = {
          role,
          phase: this.gameData.phase,
          dayNumber: this.gameData.dayNumber,
          timeRemaining: this.gameData.timer,
          alivePlayers: this.gameData.alivePlayers.map(p => ({ id: p.id, name: p.name })),
          mafiaMembers: role === 'mafia' ? this.getMafiaMembers() : null
        };
        
        console.log(`Sending role to ${player.name}: ${role}`);
        this.io.to(player.id).emit('mafiaRoleAssigned', roleData);
      });
    }, 500);
  }

  setupAlivePlayers() {
    this.gameData.alivePlayers = [...this.lobby.players];
  }

  getMafiaMembers() {
    return this.lobby.players
      .filter(p => this.gameData.roles.get(p.id) === 'mafia')
      .map(p => ({ id: p.id, name: p.name }));
  }

  startNightPhase() {
    this.gameData.phase = 'night';
    this.gameData.timer = 120; // 2 minutes
    this.gameData.nightActions.clear();
    this.gameData.nightResults = { killed: null, saved: null, investigated: null };

    this.io.to(this.lobby.code).emit('mafiaPhaseChange', {
      phase: this.gameData.phase,
      dayNumber: this.gameData.dayNumber,
      timeRemaining: this.gameData.timer,
      message: `Night ${this.gameData.dayNumber} - Special roles, make your moves!`
    });

    this.startTimer();
  }

  startDayPhase() {
    this.gameData.phase = 'day';
    this.gameData.timer = 180; // 3 minutes for discussion
    
    // Process night actions
    this.processNightActions();
    
    this.io.to(this.lobby.code).emit('mafiaPhaseChange', {
      phase: this.gameData.phase,
      dayNumber: this.gameData.dayNumber,
      timeRemaining: this.gameData.timer,
      nightResults: this.gameData.nightResults,
      alivePlayers: this.gameData.alivePlayers.map(p => ({ id: p.id, name: p.name })),
      deadPlayers: this.gameData.deadPlayers.map(p => ({ id: p.id, name: p.name, role: this.gameData.roles.get(p.id) }))
    });

    // Check win conditions
    if (this.checkWinConditions()) return;

    this.startTimer();
  }

  startVotingPhase() {
    this.gameData.phase = 'voting';
    this.gameData.timer = 90; // 1.5 minutes for voting
    this.gameData.votes.clear();

    this.io.to(this.lobby.code).emit('mafiaPhaseChange', {
      phase: this.gameData.phase,
      dayNumber: this.gameData.dayNumber,
      timeRemaining: this.gameData.timer,
      alivePlayers: this.gameData.alivePlayers.map(p => ({ id: p.id, name: p.name }))
    });

    this.startTimer();
  }

  processNightActions() {
    const mafiaKill = Array.from(this.gameData.nightActions.entries())
      .find(([playerId, action]) => 
        this.gameData.roles.get(playerId) === 'mafia' && action.type === 'kill'
      );

    const doctorSave = Array.from(this.gameData.nightActions.entries())
      .find(([playerId, action]) => 
        this.gameData.roles.get(playerId) === 'doctor' && action.type === 'save'
      );

    const detectiveInvestigate = Array.from(this.gameData.nightActions.entries())
      .find(([playerId, action]) => 
        this.gameData.roles.get(playerId) === 'detective' && action.type === 'investigate'
      );

    // Process kill and save
    if (mafiaKill) {
      const targetId = mafiaKill[1].targetId;
      const saved = doctorSave && doctorSave[1].targetId === targetId;
      
      if (!saved) {
        const killedPlayer = this.gameData.alivePlayers.find(p => p.id === targetId);
        if (killedPlayer) {
          this.gameData.alivePlayers = this.gameData.alivePlayers.filter(p => p.id !== targetId);
          this.gameData.deadPlayers.push(killedPlayer);
          this.gameData.nightResults.killed = killedPlayer;
        }
      } else {
        this.gameData.nightResults.saved = this.gameData.alivePlayers.find(p => p.id === targetId);
      }
    }

    // Process investigation
    if (detectiveInvestigate) {
      const targetId = detectiveInvestigate[1].targetId;
      const targetPlayer = this.lobby.players.find(p => p.id === targetId);
      const targetRole = this.gameData.roles.get(targetId);
      
      this.gameData.nightResults.investigated = {
        player: targetPlayer,
        isMafia: targetRole === 'mafia'
      };
      
      // Send investigation result only to detective
      const detectiveId = detectiveInvestigate[0];
      this.io.to(detectiveId).emit('investigationResult', {
        target: targetPlayer.name,
        isMafia: targetRole === 'mafia'
      });
    }
  }

  checkWinConditions() {
    const aliveMafia = this.gameData.alivePlayers.filter(p => 
      this.gameData.roles.get(p.id) === 'mafia'
    ).length;

    const aliveTown = this.gameData.alivePlayers.length - aliveMafia;

    // Mafia wins if they equal or outnumber town
    if (aliveMafia >= aliveTown) {
      this.endGame('mafia', 'Mafia outnumbers the town!');
      return true;
    }

    // Town wins if all mafia are eliminated
    if (aliveMafia === 0) {
      this.endGame('town', 'All Mafia members have been eliminated!');
      return true;
    }

    return false;
  }

  startTimer() {
    clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      this.gameData.timer--;
      
      if (this.gameData.timer % 10 === 0 || this.gameData.timer <= 10) {
        this.io.to(this.lobby.code).emit('mafiaTimerUpdate', {
          timeRemaining: this.gameData.timer
        });
      }
      
      if (this.gameData.timer <= 0) {
        this.handlePhaseTimeout();
      }
    }, 1000);
  }

  handlePhaseTimeout() {
    switch (this.gameData.phase) {
      case 'night':
        this.startDayPhase();
        break;
      case 'day':
        this.startVotingPhase();
        break;
      case 'voting':
        this.processVoting();
        break;
    }
  }

  processVoting() {
    clearInterval(this.timerInterval);
    
    // Count votes
    const voteResults = this.countVotes();
    
    if (voteResults.eliminated) {
      // Remove eliminated player
      const eliminatedPlayer = voteResults.eliminated;
      this.gameData.alivePlayers = this.gameData.alivePlayers.filter(p => p.id !== eliminatedPlayer.id);
      this.gameData.deadPlayers.push(eliminatedPlayer);
      
      this.io.to(this.lobby.code).emit('playerEliminated', {
        eliminated: eliminatedPlayer,
        role: this.gameData.roles.get(eliminatedPlayer.id),
        voteResults: voteResults.results
      });
      
      // Check win conditions
      setTimeout(() => {
        if (!this.checkWinConditions()) {
          this.gameData.dayNumber++;
          this.startNightPhase();
        }
      }, 3000);
    } else {
      this.io.to(this.lobby.code).emit('noElimination', {
        reason: 'No majority vote',
        voteResults: voteResults.results
      });
      
      setTimeout(() => {
        this.gameData.dayNumber++;
        this.startNightPhase();
      }, 3000);
    }
  }

  countVotes() {
    const voteCounts = new Map();
    
    this.gameData.votes.forEach((votedFor) => {
      voteCounts.set(votedFor, (voteCounts.get(votedFor) || 0) + 1);
    });
    
    let mostVoted = null;
    let maxVotes = 0;
    let tie = false;
    
    voteCounts.forEach((votes, playerId) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        mostVoted = this.gameData.alivePlayers.find(p => p.id === playerId);
        tie = false;
      } else if (votes === maxVotes && votes > 0) {
        tie = true;
      }
    });
    
    // Need majority to eliminate
    const requiredVotes = Math.floor(this.gameData.alivePlayers.length / 2) + 1;
    const eliminated = (!tie && maxVotes >= requiredVotes) ? mostVoted : null;
    
    return {
      eliminated,
      results: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
        player: this.gameData.alivePlayers.find(p => p.id === playerId),
        votes
      }))
    };
  }

  setupGameEvents() {
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (!socket) return;

      socket.on('requestMafiaRole', () => {
        this.handleRoleRequest(socket, player);
      });

      socket.on('mafiaAction', (data) => {
        this.handleNightAction(socket, player, data);
      });

      socket.on('mafiaVote', (data) => {
        this.handleVote(socket, player, data);
      });
    });
  }

  handleRoleRequest(socket, player) {
    const role = this.gameData.roles.get(player.id);
    const roleData = {
      role,
      phase: this.gameData.phase,
      dayNumber: this.gameData.dayNumber,
      timeRemaining: this.gameData.timer,
      alivePlayers: this.gameData.alivePlayers.map(p => ({ id: p.id, name: p.name })),
      deadPlayers: this.gameData.deadPlayers.map(p => ({ id: p.id, name: p.name, role: this.gameData.roles.get(p.id) })),
      mafiaMembers: role === 'mafia' ? this.getMafiaMembers() : null
    };
    
    socket.emit('mafiaRoleAssigned', roleData);
  }

  handleNightAction(socket, player, data) {
    if (this.gameData.phase !== 'night') return;
    if (!this.gameData.alivePlayers.find(p => p.id === player.id)) return;

    const role = this.gameData.roles.get(player.id);
    
    // Validate action based on role
    if ((role === 'mafia' && data.type === 'kill') ||
        (role === 'detective' && data.type === 'investigate') ||
        (role === 'doctor' && data.type === 'save')) {
      
      this.gameData.nightActions.set(player.id, {
        type: data.type,
        targetId: data.targetId
      });
      
      socket.emit('actionConfirmed', {
        type: data.type,
        target: this.gameData.alivePlayers.find(p => p.id === data.targetId)?.name
      });
    }
  }

  handleVote(socket, player, data) {
    if (this.gameData.phase !== 'voting') return;
    if (!this.gameData.alivePlayers.find(p => p.id === player.id)) return;
    
    this.gameData.votes.set(player.id, data.votedPlayerId);
    
    const voteCount = this.gameData.votes.size;
    this.io.to(this.lobby.code).emit('mafiaVoteUpdate', {
      votesReceived: voteCount,
      totalPlayers: this.gameData.alivePlayers.length
    });
    
    if (voteCount === this.gameData.alivePlayers.length) {
      this.processVoting();
    }
  }

  endGame(winner, reason) {
    clearInterval(this.timerInterval);
    this.gameData.phase = 'finished';
    
    const gameResult = {
      winner,
      reason,
      duration: Math.floor((Date.now() - this.gameData.gameStartTime) / 1000),
      finalRoles: Array.from(this.gameData.roles.entries()).map(([playerId, role]) => ({
        player: this.lobby.players.find(p => p.id === playerId),
        role
      })),
      survivors: this.gameData.alivePlayers,
      casualties: this.gameData.deadPlayers
    };
    
    this.io.to(this.lobby.code).emit('mafiaGameEnded', gameResult);
    
    setTimeout(() => {
      this.lobby.gameState = 'waiting';
      this.lobby.currentGame = null;
      this.cleanup();
    }, 15000);
  }

  cleanup() {
    clearInterval(this.timerInterval);
    
    this.lobby.players.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.id);
      if (socket) {
        socket.removeAllListeners('requestMafiaRole');
        socket.removeAllListeners('mafiaAction');
        socket.removeAllListeners('mafiaVote');
      }
    });
  }

  handlePlayerDisconnect(playerId) {
    // Remove from alive players if present
    this.gameData.alivePlayers = this.gameData.alivePlayers.filter(p => p.id !== playerId);
    
    // Remove any pending actions/votes
    this.gameData.nightActions.delete(playerId);
    this.gameData.votes.delete(playerId);
    
    // Check if game should continue
    if (this.gameData.alivePlayers.length < 3) {
      this.endGame('nobody', 'Too many players disconnected');
    } else {
      this.checkWinConditions();
    }
  }
}

module.exports = MafiaGame;