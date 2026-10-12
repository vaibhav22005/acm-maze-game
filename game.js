// Multiplayer Client & Fog-of-War Renderer
class MazeGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimapCanvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.container = document.getElementById('canvasContainer');

    // UI elements
    this.lobbyScreen = document.getElementById('lobbyScreen');
    this.profileSetup = document.getElementById('profileSetup');
    this.initialActions = document.getElementById('initialActions');
    this.activeRoomView = document.getElementById('activeRoomView');
    this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
    this.qrImage = document.getElementById('qrImage');
    this.playerRosterList = document.getElementById('playerRosterList');
    this.playerCount = document.getElementById('playerCount');
    this.startGameBtn = document.getElementById('startGameBtn');
    this.waitingForHostText = document.getElementById('waitingForHostText');
    this.hostControls = document.getElementById('hostControls');
    this.countdownOverlay = document.getElementById('countdownOverlay');
    this.countdownDigit = document.getElementById('countdownDigit');

    this.countdownTimer = document.getElementById('countdownTimer');
    this.matchTimerBox = document.getElementById('matchTimerBox');
    this.stepsVal = document.getElementById('stepsVal');
    this.exploredVal = document.getElementById('exploredVal');
    this.gameBanner = document.getElementById('gameBanner');
    this.bannerText = document.getElementById('bannerText');
    this.hudRoomBadge = document.getElementById('hudRoomBadge');
    this.liveFeed = document.getElementById('liveFeed');

    this.leaderboardModal = document.getElementById('leaderboardModal');
    this.podiumContainer = document.getElementById('podiumContainer');
    this.scoreboardBody = document.getElementById('scoreboardBody');
    this.nextRoundBtn = document.getElementById('nextRoundBtn');
    this.returnLobbyBtn = document.getElementById('returnLobbyBtn');
    this.helpModal = document.getElementById('helpModal');

    // Player State
    this.playerName = 'Runner_1';
    this.playerAvatar = '⚡';
    this.isHost = false;
    this.roomCode = null;
    this.playerId = null;
    this.timerDuration = 120;
    this.difficulty = 'medium';

    // Game & Maze State
    this.maze = null;
    this.player = { x: 1, y: 1, renderX: 1, renderY: 1 };
    this.stepsCount = 0;
    this.finished = false;
    this.gameActive = false;

    // Camera
    this.camera = { x: 0, y: 0 };
    this.tileSize = 42;

    // Visual particles & floating text
    this.particles = [];
    this.floatingTexts = [];

    // WebSocket connection
    this.ws = null;

    this.initNetworking();
    this.initEventListeners();
    this.resizeCanvas();
    this.startLoop();

    // Auto-detect room code from URL params: e.g. /?room=ACM1
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      document.getElementById('joinCodeInput').value = roomParam.toUpperCase();
    }
  }

  // ================= NETWORKING =================
  initNetworking() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to Multiplayer Game Server');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('Disconnected from Multiplayer Game Server. Reconnecting in 3s...');
      setTimeout(() => this.initNetworking(), 3000);
    };
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  handleServerMessage(data) {
    switch (data.type) {
      case 'ROOM_CREATED':
      case 'ROOM_JOINED':
        this.roomCode = data.roomCode;
        this.playerId = data.playerId;
        this.isHost = data.isHost;
        this.timerDuration = data.timerDuration;
        this.difficulty = data.difficulty;

        this.hudRoomBadge.textContent = `ROOM: ${this.roomCode}`;
        this.roomCodeDisplay.textContent = this.roomCode;
        this.qrImage.src = data.qrUrl;
        const qrUrlDisplay = document.getElementById('qrUrlDisplay');
        if (qrUrlDisplay) {
          qrUrlDisplay.textContent = data.joinUrl;
        }

        // Display active room view
        this.initialActions.classList.add('hidden');
        this.activeRoomView.classList.remove('hidden');

        if (this.isHost) {
          this.hostControls.classList.remove('hidden');
          this.startGameBtn.classList.remove('hidden');
          this.waitingForHostText.classList.add('hidden');
        } else {
          this.hostControls.classList.add('hidden');
          this.startGameBtn.classList.add('hidden');
          this.waitingForHostText.classList.remove('hidden');
        }

        this.updateRoster(data.players);
        break;

      case 'PLAYER_JOINED':
        this.updateRoster(data.players);
        if (data.announcement) {
          this.addFeedItem(data.announcement);
        }
        break;

      case 'PLAYER_LEFT':
        this.updateRoster(data.players);
        this.addFeedItem(`${data.playerName} left.`);
        break;

      case 'TIMER_UPDATED':
        this.timerDuration = data.timerDuration;
        document.querySelectorAll('.timer-btn').forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.seconds) === this.timerDuration);
        });
        break;

      case 'DIFFICULTY_UPDATED':
        this.difficulty = data.difficulty;
        document.querySelectorAll('.diff-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.diff === this.difficulty);
        });
        break;

      case 'START_COUNTDOWN':
        this.lobbyScreen.classList.add('hidden');
        this.countdownOverlay.classList.remove('hidden');
        this.countdownDigit.textContent = data.count;
        window.soundCtrl.playStep();
        break;

      case 'COUNTDOWN_TICK':
        this.countdownDigit.textContent = data.count;
        this.countdownDigit.style.animation = 'none';
        void this.countdownDigit.offsetWidth; // trigger reflow
        this.countdownDigit.style.animation = 'zoomCountdown 0.8s ease-out';
        window.soundCtrl.playStep();
        break;

      case 'GAME_STARTED':
        this.countdownOverlay.classList.add('hidden');
        this.startMatch(data.mazeData, data.timerDuration);
        break;

      case 'TIMER_TICK':
        this.updateTimerDisplay(data.remaining);
        break;

      case 'EVENT_LETTER_COLLECTED':
        if (data.playerId !== this.playerId) {
          this.addFeedItem(`⚡ ${data.playerName} found Rune [${data.char}]! (${data.count}/3)`);
        }
        break;

      case 'PLAYER_FINISHED':
        if (data.playerId !== this.playerId) {
          this.addFeedItem(`🏆 ${data.playerName} FINISHED! (#${data.rank} in ${data.finishTime}s)`);
        }
        break;

      case 'GAME_OVER':
        this.handleGameOver(data.reason, data.leaderboard);
        break;

      case 'RETURN_TO_LOBBY':
        this.leaderboardModal.classList.remove('active');
        this.lobbyScreen.classList.remove('hidden');
        this.gameActive = false;
        this.updateRoster(data.players);
        break;

      case 'ERROR':
        alert(data.message);
        break;
    }
  }

  updateRoster(players) {
    this.playerCount.textContent = players.length;
    this.playerRosterList.innerHTML = '';
    players.forEach(p => {
      const badge = document.createElement('div');
      badge.className = `player-badge ${p.isHost ? 'host' : ''}`;
      badge.innerHTML = `<span>${p.avatar}</span> <span>${p.name}</span> ${p.isHost ? '👑' : ''}`;
      this.playerRosterList.appendChild(badge);
    });
  }

  addFeedItem(text) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = text;
    this.liveFeed.appendChild(item);
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 4000);
  }

  // ================= MATCH PLAY =================
  startMatch(mazeData, duration) {
    this.gameActive = true;
    this.finished = false;
    this.stepsCount = 0;
    this.stepsVal.textContent = '0';
    this.exploredVal.textContent = '0%';
    this.particles = [];
    this.floatingTexts = [];
    this.leaderboardModal.classList.remove('active');

    // Reset HUD Runes
    ['A', 'C', 'M'].forEach(c => {
      const slot = document.getElementById(`rune-${c}`);
      slot.classList.remove('acquired');
    });

    this.maze = mazeData;
    this.player.x = this.maze.playerStart.x;
    this.player.y = this.maze.playerStart.y;
    this.player.renderX = this.player.x;
    this.player.renderY = this.player.y;

    this.visitCell(this.player.x, this.player.y);
    this.updateTimerDisplay(duration);
    this.showBanner('RACE STARTED! Find runes A, C, M in ANY order to finish!', 'highlight');
    this.renderMinimap();
    window.soundCtrl.playExitUnlocked();
  }

  updateTimerDisplay(remaining) {
    const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    this.countdownTimer.textContent = `${mins}:${secs}`;

    if (remaining <= 15) {
      this.matchTimerBox.classList.add('critical');
    } else {
      this.matchTimerBox.classList.remove('critical');
    }
  }

  visitCell(x, y) {
    if (!this.maze.travelled[y][x]) {
      this.maze.travelled[y][x] = true;

      // Reveal surrounding walls
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.maze.width && ny >= 0 && ny < this.maze.height) {
            if (this.maze.grid[ny][nx] === 1) {
              this.maze.revealedWalls[ny][nx] = true;
            }
          }
        }
      }
    }
  }

  showBanner(msg, type = '') {
    this.bannerText.textContent = msg;
    this.gameBanner.className = 'banner ' + type;
  }

  movePlayer(dx, dy) {
    if (!this.gameActive || this.finished) return;

    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (nx < 0 || nx >= this.maze.width || ny < 0 || ny >= this.maze.height) {
      window.soundCtrl.playBump();
      return;
    }

    if (this.maze.grid[ny][nx] === 1) {
      window.soundCtrl.playBump();
      return;
    }

    // Valid move
    this.player.x = nx;
    this.player.y = ny;
    this.stepsCount++;
    this.stepsVal.textContent = this.stepsCount;
    window.soundCtrl.playStep();

    this.visitCell(nx, ny);
    this.addStepParticles(nx, ny);
    this.checkLetters(nx, ny);
    this.updateStats();
    this.renderMinimap();

    // Broadcast progress
    this.send({
      type: 'UPDATE_PROGRESS',
      steps: this.stepsCount,
      exploredPct: parseInt(this.exploredVal.textContent, 10) || 0
    });
  }

  checkLetters(x, y) {
    this.maze.letters.forEach(letter => {
      if (!letter.found && letter.x === x && letter.y === y) {
        letter.found = true;
        const slot = document.getElementById(`rune-${letter.char}`);
        if (slot) slot.classList.add('acquired');

        window.soundCtrl.playRuneFound(letter.char);
        this.addRuneExplosion(x, y, letter.char, letter.color);
        this.addFloatingText(`Rune [${letter.char}] Discovered!`, x, y, letter.color);

        const collectedCount = this.maze.letters.filter(l => l.found).length;

        // Send to server
        this.send({
          type: 'COLLECT_LETTER',
          char: letter.char,
          steps: this.stepsCount,
          exploredPct: parseInt(this.exploredVal.textContent, 10) || 0
        });

        // REQUISITE: GAME ENDS IMMEDIATELY AFTER COLLECTING ALL LETTERS (NO EXIT NEEDED)
        if (collectedCount === 3) {
          this.finished = true;
          this.showBanner('🏆 ALL 3 RUNES RETRIEVED! YOU HAVE FINISHED!', 'success');
          window.soundCtrl.playVictory();
        } else {
          this.showBanner(`Acquired Rune [${letter.char}]! (${collectedCount}/3 collected - any order)`, 'highlight');
        }
      }
    });
  }

  updateStats() {
    let visitedCount = 0;
    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        if (this.maze.grid[y][x] === 0 && this.maze.travelled[y][x]) {
          visitedCount++;
        }
      }
    }
    const pct = Math.round((visitedCount / this.maze.totalPassages) * 100);
    this.exploredVal.textContent = `${pct}%`;
  }

  addStepParticles(x, y) {
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: x + 0.5 + (Math.random() - 0.5) * 0.3,
        y: y + 0.5 + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        life: 0.5,
        color: 'rgba(0, 243, 255, 0.4)',
        size: Math.random() * 3 + 1
      });
    }
  }

  addRuneExplosion(x, y, char, color) {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      this.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: color,
        size: Math.random() * 4 + 2
      });
    }
  }

  addFloatingText(text, x, y, color) {
    this.floatingTexts.push({
      text,
      x: x + 0.5,
      y: y + 0.2,
      vy: -1.2,
      life: 1.5,
      color
    });
  }

  // ================= LEADERBOARD =================
  handleGameOver(reason, leaderboard) {
    this.gameActive = false;
    window.soundCtrl.playVictory();

    // Render Podium
    this.podiumContainer.innerHTML = '';
    const top3 = [leaderboard[1], leaderboard[0], leaderboard[2]]; // order: 2nd, 1st, 3rd
    const classes = ['second', 'first', 'third'];
    const medals = ['🥈', '🥇', '🥉'];

    top3.forEach((p, idx) => {
      if (p) {
        const spot = document.createElement('div');
        spot.className = `podium-spot ${classes[idx]}`;
        spot.innerHTML = `
          <div class="podium-avatar">${p.avatar} ${medals[idx]}</div>
          <div class="podium-name">${p.name}</div>
          <div class="podium-time">${p.finished ? p.finishTime + 's' : p.lettersCount + '/3 Runes'}</div>
        `;
        this.podiumContainer.appendChild(spot);
      }
    });

    // Render Table
    this.scoreboardBody.innerHTML = '';
    leaderboard.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${p.rank}</strong></td>
        <td><span>${p.avatar}</span> ${p.name} ${p.isHost ? '👑' : ''}</td>
        <td><span class="${p.finished ? 'badge-finished' : 'badge-dnf'}">${p.finished ? 'FINISHED' : 'TIME OUT'}</span></td>
        <td>${p.finished ? p.finishTime + 's' : '--'}</td>
        <td>${p.lettersCount}/3 (${p.lettersFound.join('') || '-'})</td>
        <td>${p.steps}</td>
      `;
      this.scoreboardBody.appendChild(tr);
    });

    // Host next round control
    if (this.isHost) {
      this.nextRoundBtn.classList.remove('hidden');
    } else {
      this.nextRoundBtn.classList.add('hidden');
    }

    setTimeout(() => {
      this.leaderboardModal.classList.add('active');
    }, 600);
  }

  // ================= MINIMAP =================
  renderMinimap() {
    if (!this.maze) return;
    const W = this.maze.width;
    const H = this.maze.height;
    const mw = this.minimapCanvas.width;
    const mh = this.minimapCanvas.height;
    const cellW = mw / W;
    const cellH = mh / H;

    this.minimapCtx.fillStyle = '#04060d';
    this.minimapCtx.fillRect(0, 0, mw, mh);

    // Revealed walls
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.maze.grid[y][x] === 1 && this.maze.revealedWalls[y][x]) {
          this.minimapCtx.fillStyle = '#263657';
          this.minimapCtx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Travelled paths
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.maze.grid[y][x] === 0 && this.maze.travelled[y][x]) {
          this.minimapCtx.fillStyle = '#00f3ff';
          this.minimapCtx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Discovered letters
    this.maze.letters.forEach(l => {
      if (l.found) {
        this.minimapCtx.fillStyle = l.color;
        this.minimapCtx.fillRect(l.x * cellW, l.y * cellH, cellW * 1.5, cellH * 1.5);
      }
    });

    // Player position
    this.minimapCtx.fillStyle = '#ffe600';
    this.minimapCtx.beginPath();
    this.minimapCtx.arc((this.player.x + 0.5) * cellW, (this.player.y + 0.5) * cellH, Math.max(cellW * 0.8, 3), 0, Math.PI * 2);
    this.minimapCtx.fill();
  }

  resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    if (rect.width < 500) {
      this.tileSize = 34;
    } else if (rect.width < 900) {
      this.tileSize = 40;
    } else {
      this.tileSize = 46;
    }
  }

  startLoop() {
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    if (!this.maze) return;
    const lerpFactor = Math.min(15 * dt, 1);
    this.player.renderX += (this.player.x - this.player.renderX) * lerpFactor;
    this.player.renderY += (this.player.y - this.player.renderY) * lerpFactor;

    const viewW = this.canvas.width / (window.devicePixelRatio || 1);
    const viewH = this.canvas.height / (window.devicePixelRatio || 1);
    const targetCamX = (this.player.renderX + 0.5) * this.tileSize - viewW / 2;
    const targetCamY = (this.player.renderY + 0.5) * this.tileSize - viewH / 2;

    this.camera.x += (targetCamX - this.camera.x) * lerpFactor;
    this.camera.y += (targetCamY - this.camera.y) * lerpFactor;

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  render() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    this.ctx.fillStyle = '#03050c';
    this.ctx.fillRect(0, 0, width, height);

    if (!this.maze) return;

    this.ctx.save();
    this.ctx.translate(-Math.floor(this.camera.x), -Math.floor(this.camera.y));

    const ts = this.tileSize;
    const startCol = Math.max(0, Math.floor(this.camera.x / ts));
    const endCol = Math.min(this.maze.width, Math.ceil((this.camera.x + width) / ts) + 1);
    const startRow = Math.max(0, Math.floor(this.camera.y / ts));
    const endRow = Math.min(this.maze.height, Math.ceil((this.camera.y + height) / ts) + 1);

    // 1. Render Travelled Paths & Revealed 3D Walls
    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const px = x * ts;
        const py = y * ts;

        if (this.maze.grid[y][x] === 0) {
          if (this.maze.travelled[y][x]) {
            // Walkable Open Floor Tile
            this.ctx.fillStyle = '#061024';
            this.ctx.fillRect(px, py, ts, ts);

            this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.25)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);

            const brk = Math.max(3, Math.floor(ts * 0.15));
            this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            ctxMoveCorner(this.ctx, px, py, ts, brk);
            this.ctx.stroke();

            // Glowing center node
            this.ctx.save();
            this.ctx.shadowColor = '#00f3ff';
            this.ctx.shadowBlur = 5;
            this.ctx.fillStyle = '#00f3ff';
            this.ctx.beginPath();
            this.ctx.arc(px + ts / 2, py + ts / 2, 2.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
          }
        } else if (this.maze.grid[y][x] === 1) {
          if (this.maze.revealedWalls[y][x]) {
            // High-Contrast 3D Beveled Wall Monolith
            const b = Math.max(3, Math.floor(ts * 0.16));
            this.ctx.fillStyle = '#101728';
            this.ctx.fillRect(px, py, ts, ts);

            this.ctx.fillStyle = '#2b395c';
            this.ctx.fillRect(px + b, py + b, ts - b * 2, ts - b * 2);

            this.ctx.fillStyle = '#5c73a8';
            this.ctx.fillRect(px + b, py + b, ts - b * 2, 2);
            this.ctx.fillRect(px + b, py + b, 2, ts - b * 2);

            this.ctx.fillStyle = '#0c111e';
            this.ctx.fillRect(px + b, py + ts - b - 2, ts - b * 2, 2);
            this.ctx.fillRect(px + ts - b - 2, py + b, 2, ts - b * 2);

            this.ctx.strokeStyle = '#43588a';
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);

            this.ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
            const mid = ts / 2;
            this.ctx.fillRect(px + mid - 3, py + mid - 3, 6, 6);
          }
        }
      }
    }

    // 2. Render ACM Letters (ONLY visible when reached!)
    this.maze.letters.forEach(letter => {
      if (letter.found) {
        const lx = letter.x * ts + ts / 2;
        const ly = letter.y * ts + ts / 2;

        this.ctx.save();
        this.ctx.fillStyle = letter.color;
        this.ctx.shadowColor = letter.color;
        this.ctx.shadowBlur = 12;
        this.ctx.font = '900 16px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(letter.char, lx, ly);

        this.ctx.strokeStyle = letter.color;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(lx, ly, ts * 0.38, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    });

    // 3. Render Flashlight Aura & Player
    const plx = (this.player.renderX + 0.5) * ts;
    const ply = (this.player.renderY + 0.5) * ts;

    const aura = this.ctx.createRadialGradient(plx, ply, 3, plx, ply, ts * 1.8);
    aura.addColorStop(0, 'rgba(0, 243, 255, 0.28)');
    aura.addColorStop(0.4, 'rgba(0, 243, 255, 0.1)');
    aura.addColorStop(1, 'transparent');

    this.ctx.fillStyle = aura;
    this.ctx.beginPath();
    this.ctx.arc(plx, ply, ts * 1.8, 0, Math.PI * 2);
    this.ctx.fill();

    // Player Avatar Orb
    this.ctx.save();
    this.ctx.shadowColor = '#00f3ff';
    this.ctx.shadowBlur = 15;
    this.ctx.fillStyle = '#00f3ff';
    this.ctx.beginPath();
    this.ctx.arc(plx, ply, ts * 0.32, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(plx, ply, ts * 0.15, 0, Math.PI * 2);
    this.ctx.fill();

    const orbitAngle = performance.now() * 0.004;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.arc(plx, ply, ts * 0.42, orbitAngle, orbitAngle + Math.PI * 1.2);
    this.ctx.stroke();
    this.ctx.restore();

    // 4. Particles
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.beginPath();
      this.ctx.arc(p.x * ts, p.y * ts, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });

    // 5. Floating Notifications
    this.floatingTexts.forEach(ft => {
      this.ctx.save();
      this.ctx.font = 'bold 14px Orbitron';
      this.ctx.fillStyle = ft.color;
      this.ctx.shadowColor = ft.color;
      this.ctx.shadowBlur = 10;
      this.ctx.globalAlpha = Math.min(1, ft.life);
      this.ctx.textAlign = 'center';
      this.ctx.fillText(ft.text, ft.x * ts, ft.y * ts);
      this.ctx.restore();
    });

    this.ctx.restore();
  }

  // ================= EVENT LISTENERS =================
  initEventListeners() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.renderMinimap();
    });

    // Avatar selector
    document.querySelectorAll('.avatar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.playerAvatar = btn.dataset.avatar;
      });
    });

    // Create Room
    document.getElementById('createRoomBtn').addEventListener('click', () => {
      this.playerName = document.getElementById('playerNameInput').value.trim() || 'Player 1';
      this.send({
        type: 'CREATE_ROOM',
        name: this.playerName,
        avatar: this.playerAvatar,
        timerDuration: this.timerDuration,
        difficulty: this.difficulty
      });
    });

    // Join Room
    document.getElementById('joinRoomBtn').addEventListener('click', () => {
      const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
      if (!code) return alert('Please enter a 4-letter Room Code!');
      this.playerName = document.getElementById('playerNameInput').value.trim() || 'Player 2';
      this.send({
        type: 'JOIN_ROOM',
        roomCode: code,
        name: this.playerName,
        avatar: this.playerAvatar
      });
    });

    // Copy Join Link
    document.getElementById('copyLinkBtn').addEventListener('click', () => {
      const url = `http://${window.location.host}/?room=${this.roomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Join Link copied to clipboard!');
      });
    });

    const openTabBtn = document.getElementById('openTabBtn');
    if (openTabBtn) {
      openTabBtn.addEventListener('click', () => {
        window.open(`http://${window.location.host}/?room=${this.roomCode}`, '_blank');
      });
    }

    // Timer Selector
    document.querySelectorAll('.timer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.isHost) return;
        const dur = parseInt(btn.dataset.seconds, 10);
        this.timerDuration = dur;
        this.send({ type: 'SET_TIMER', timerDuration: dur });
      });
    });

    // Difficulty Selector
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.isHost) return;
        const diff = btn.dataset.diff;
        this.difficulty = diff;
        this.send({ type: 'SET_DIFFICULTY', difficulty: diff });
      });
    });

    // Start Game Button (Host)
    this.startGameBtn.addEventListener('click', () => {
      if (this.isHost) {
        this.send({ type: 'START_GAME' });
      }
    });

    // Play Again / Next Round
    this.nextRoundBtn.addEventListener('click', () => {
      if (this.isHost) {
        this.send({ type: 'PLAY_AGAIN' });
      }
    });

    this.returnLobbyBtn.addEventListener('click', () => {
      this.leaderboardModal.classList.remove('active');
      this.lobbyScreen.classList.remove('hidden');
    });

    // Keyboard navigation with smooth key repeat
    this.keysDown = {};
    this.keyRepeatTimer = null;

    const getDirFromKeys = () => {
      if (this.keysDown['ArrowUp'] || this.keysDown['w'] || this.keysDown['W']) return [0, -1];
      if (this.keysDown['ArrowDown'] || this.keysDown['s'] || this.keysDown['S']) return [0, 1];
      if (this.keysDown['ArrowLeft'] || this.keysDown['a'] || this.keysDown['A']) return [-1, 0];
      if (this.keysDown['ArrowRight'] || this.keysDown['d'] || this.keysDown['D']) return [1, 0];
      return null;
    };

    const startKeyRepeat = () => {
      if (this.keyRepeatTimer) return;
      this.keyRepeatTimer = setInterval(() => {
        const dir = getDirFromKeys();
        if (dir) {
          this.movePlayer(dir[0], dir[1]);
        } else {
          clearInterval(this.keyRepeatTimer);
          this.keyRepeatTimer = null;
        }
      }, 130);
    };

    window.addEventListener('keydown', (e) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'a', 'A', 'd', 'D'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        if (!this.keysDown[e.key]) {
          this.keysDown[e.key] = true;
          const dir = getDirFromKeys();
          if (dir) this.movePlayer(dir[0], dir[1]);
          startKeyRepeat();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      delete this.keysDown[e.key];
      if (!getDirFromKeys()) {
        if (this.keyRepeatTimer) {
          clearInterval(this.keyRepeatTimer);
          this.keyRepeatTimer = null;
        }
      }
    });

    // Mobile D-Pad
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      const handlePress = (e) => {
        e.preventDefault();
        const dir = btn.dataset.dir;
        if (dir === 'up') this.movePlayer(0, -1);
        if (dir === 'down') this.movePlayer(0, 1);
        if (dir === 'left') this.movePlayer(-1, 0);
        if (dir === 'right') this.movePlayer(1, 0);
      };
      btn.addEventListener('touchstart', handlePress, { passive: false });
      btn.addEventListener('mousedown', handlePress);
    });

    // Sound toggle & help
    document.getElementById('soundToggleBtn').addEventListener('click', (e) => {
      const enabled = window.soundCtrl.toggleSound();
      e.target.textContent = enabled ? '🔊' : '🔇';
    });

    document.getElementById('helpBtn').addEventListener('click', () => {
      this.helpModal.classList.add('active');
    });

    document.getElementById('closeHelpBtn').addEventListener('click', () => {
      this.helpModal.classList.remove('active');
    });
  }
}

function ctxMoveCorner(ctx, px, py, ts, brk) {
  ctx.moveTo(px + 3, py + 3 + brk); ctx.lineTo(px + 3, py + 3); ctx.lineTo(px + 3 + brk, py + 3);
  ctx.moveTo(px + ts - 3 - brk, py + 3); ctx.lineTo(px + ts - 3, py + 3); ctx.lineTo(px + ts - 3, py + 3 + brk);
  ctx.moveTo(px + 3, py + ts - 3 - brk); ctx.lineTo(px + 3, py + ts - 3); ctx.lineTo(px + 3 + brk, py + ts - 3);
  ctx.moveTo(px + ts - 3 - brk, py + ts - 3); ctx.lineTo(px + ts - 3, py + ts - 3); ctx.lineTo(px + ts - 3, py + ts - 3 - brk);
}

window.addEventListener('DOMContentLoaded', () => {
  window.mazeGame = new MazeGame();
});
