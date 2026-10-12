const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');
const { MazeGenerator } = require('./maze.js');

const PORT = process.env.PORT || 3000;

// Discover Local Network IPv4 Address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!iface.address.startsWith('169.254.') && !iface.address.startsWith('192.168.56.')) {
          return iface.address;
        }
      }
    }
  }
  // Fallback to any external IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LAN_IP = getLocalIpAddress();

// Static HTTP Server & QR Code API
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // QR Code Image Generator Endpoint: /api/qrcode?text=...
  if (pathname === '/api/qrcode') {
    const text = parsedUrl.searchParams.get('text');
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing text query parameter');
    }
    try {
      const buffer = await QRCode.toBuffer(text, {
        width: 280,
        margin: 2,
        color: {
          dark: '#00f3ff',
          light: '#070b18'
        }
      });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buffer);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Error generating QR code: ' + err.message);
    }
  }

  // Network Info Endpoint: /api/info
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ lanIp: LAN_IP, port: PORT }));
  }

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// WebSocket Server for Real-Time Multiplayer
const wss = new WebSocketServer({ server });

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastToRoom(room, message, excludeWs = null) {
  const payload = JSON.stringify(message);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN && p.ws !== excludeWs) {
      p.ws.send(payload);
    }
  });
}

function computeLeaderboard(room) {
  const playersList = Array.from(room.players.values()).map(p => {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      isHost: p.id === room.hostId,
      finished: p.finished,
      finishTime: p.finishTime,
      lettersFound: Array.from(p.lettersFound),
      lettersCount: p.lettersFound.size,
      steps: p.steps,
      exploredPct: p.exploredPct
    };
  });

  // Rank sorting:
  // 1. Finished players first, sorted by fastest finishTime (ascending)
  // 2. Unfinished players sorted by letters collected (descending)
  // 3. Tie-breaker: lowest steps, highest exploredPct
  playersList.sort((a, b) => {
    if (a.finished && b.finished) {
      return a.finishTime - b.finishTime;
    }
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;

    // Both unfinished
    if (b.lettersCount !== a.lettersCount) {
      return b.lettersCount - a.lettersCount;
    }
    if (b.exploredPct !== a.exploredPct) {
      return b.exploredPct - a.exploredPct;
    }
    return a.steps - b.steps;
  });

  return playersList.map((p, idx) => ({ ...p, rank: idx + 1 }));
}

function endGame(room, reason = 'COMPLETED') {
  if (room.state === 'ENDED') return;
  room.state = 'ENDED';
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  const leaderboard = computeLeaderboard(room);
  broadcastToRoom(room, {
    type: 'GAME_OVER',
    reason,
    leaderboard
  });
}

wss.on('connection', (ws) => {
  let currentPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
  let currentRoomCode = null;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      switch (data.type) {
        case 'CREATE_ROOM': {
          const roomCode = generateRoomCode();
          currentRoomCode = roomCode;
          const hostName = data.name || 'Player 1';
          const avatar = data.avatar || '🚀';
          const timerDuration = data.timerDuration || 120; // 120 seconds default

          const newRoom = {
            code: roomCode,
            hostId: currentPlayerId,
            timerDuration: timerDuration,
            remainingTime: timerDuration,
            difficulty: data.difficulty || 'medium',
            state: 'LOBBY',
            mazeData: null,
            timerInterval: null,
            players: new Map()
          };

          const hostPlayer = {
            id: currentPlayerId,
            name: hostName,
            avatar: avatar,
            color: '#00f3ff',
            ws: ws,
            isHost: true,
            finished: false,
            finishTime: null,
            lettersFound: new Set(),
            steps: 0,
            exploredPct: 0
          };

          newRoom.players.set(currentPlayerId, hostPlayer);
          rooms.set(roomCode, newRoom);

          const joinUrl = `http://${LAN_IP}:${PORT}/?room=${roomCode}`;
          const qrUrl = `/api/qrcode?text=${encodeURIComponent(joinUrl)}`;

          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            roomCode: roomCode,
            playerId: currentPlayerId,
            isHost: true,
            joinUrl: joinUrl,
            qrUrl: qrUrl,
            timerDuration: newRoom.timerDuration,
            difficulty: newRoom.difficulty,
            players: Array.from(newRoom.players.values()).map(p => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              color: p.color,
              isHost: p.id === newRoom.hostId
            }))
          }));
          break;
        }

        case 'JOIN_ROOM': {
          const code = (data.roomCode || '').toUpperCase().trim();
          const room = rooms.get(code);

          if (!room) {
            return ws.send(JSON.stringify({ type: 'ERROR', message: `Room "${code}" not found!` }));
          }

          if (room.state !== 'LOBBY') {
            return ws.send(JSON.stringify({ type: 'ERROR', message: 'Match has already started!' }));
          }

          currentRoomCode = code;
          const colors = ['#00f3ff', '#ff007f', '#ffd700', '#00ff88', '#a855f7', '#f97316', '#38bdf8'];
          const color = colors[room.players.size % colors.length];

          const player = {
            id: currentPlayerId,
            name: data.name || `Player ${room.players.size + 1}`,
            avatar: data.avatar || '🎮',
            color: color,
            ws: ws,
            isHost: false,
            finished: false,
            finishTime: null,
            lettersFound: new Set(),
            steps: 0,
            exploredPct: 0
          };

          room.players.set(currentPlayerId, player);

          const joinUrl = `http://${LAN_IP}:${PORT}/?room=${code}`;
          const qrUrl = `/api/qrcode?text=${encodeURIComponent(joinUrl)}`;

          // Acknowledge joined player
          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            roomCode: code,
            playerId: currentPlayerId,
            isHost: false,
            joinUrl: joinUrl,
            qrUrl: qrUrl,
            timerDuration: room.timerDuration,
            difficulty: room.difficulty,
            players: Array.from(room.players.values()).map(p => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              color: p.color,
              isHost: p.id === room.hostId
            }))
          }));

          // Broadcast roster update to room
          broadcastToRoom(room, {
            type: 'PLAYER_JOINED',
            players: Array.from(room.players.values()).map(p => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              color: p.color,
              isHost: p.id === room.hostId
            })),
            announcement: `${player.name} joined the lobby!`
          });
          break;
        }

        case 'SET_TIMER': {
          const room = rooms.get(currentRoomCode);
          if (room && room.hostId === currentPlayerId && room.state === 'LOBBY') {
            const duration = Math.max(20, parseInt(data.timerDuration, 10) || 120);
            room.timerDuration = duration;
            room.remainingTime = duration;
            broadcastToRoom(room, {
              type: 'TIMER_UPDATED',
              timerDuration: duration
            });
          }
          break;
        }

        case 'SET_DIFFICULTY': {
          const room = rooms.get(currentRoomCode);
          if (room && room.hostId === currentPlayerId && room.state === 'LOBBY') {
            room.difficulty = data.difficulty || 'medium';
            broadcastToRoom(room, {
              type: 'DIFFICULTY_UPDATED',
              difficulty: room.difficulty
            });
          }
          break;
        }

        case 'START_GAME': {
          const room = rooms.get(currentRoomCode);
          if (!room || room.hostId !== currentPlayerId || room.state !== 'LOBBY') return;

          room.state = 'COUNTDOWN';

          // Generate shared maze so all players compete on the identical labyrinth & ACM placements
          const mazeGen = new MazeGenerator(room.difficulty);
          room.mazeData = mazeGen.generate();

          // Reset all player game states
          room.players.forEach(p => {
            p.finished = false;
            p.finishTime = null;
            p.lettersFound = new Set();
            p.steps = 0;
            p.exploredPct = 0;
          });

          // Broadcast 3-2-1 Countdown
          broadcastToRoom(room, {
            type: 'START_COUNTDOWN',
            count: 3
          });

          let countdown = 3;
          const cdInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
              broadcastToRoom(room, {
                type: 'COUNTDOWN_TICK',
                count: countdown
              });
            } else {
              clearInterval(cdInterval);
              // Launch Game
              room.state = 'PLAYING';
              room.remainingTime = room.timerDuration;

              broadcastToRoom(room, {
                type: 'GAME_STARTED',
                mazeData: room.mazeData,
                timerDuration: room.timerDuration,
                startTime: Date.now()
              });

              // Start Server Room Timer
              room.timerInterval = setInterval(() => {
                room.remainingTime--;
                broadcastToRoom(room, {
                  type: 'TIMER_TICK',
                  remaining: room.remainingTime
                });

                if (room.remainingTime <= 0) {
                  clearInterval(room.timerInterval);
                  room.timerInterval = null;
                  endGame(room, 'TIME_UP');
                }
              }, 1000);
            }
          }, 1000);
          break;
        }

        case 'COLLECT_LETTER': {
          const room = rooms.get(currentRoomCode);
          if (!room || room.state !== 'PLAYING') return;

          const player = room.players.get(currentPlayerId);
          if (!player) return;

          const char = data.char;
          player.lettersFound.add(char);
          player.steps = data.steps || player.steps;
          player.exploredPct = data.exploredPct || player.exploredPct;

          const count = player.lettersFound.size;

          // Broadcast letter event
          broadcastToRoom(room, {
            type: 'EVENT_LETTER_COLLECTED',
            playerId: currentPlayerId,
            playerName: player.name,
            char: char,
            count: count
          });

          // Check Win Condition: Game ends immediately when all 3 letters are gathered!
          if (count === 3 && !player.finished) {
            player.finished = true;
            player.finishTime = (room.timerDuration - room.remainingTime);

            broadcastToRoom(room, {
              type: 'PLAYER_FINISHED',
              playerId: currentPlayerId,
              playerName: player.name,
              finishTime: player.finishTime,
              rank: Array.from(room.players.values()).filter(p => p.finished).length
            });

            // Check if all players have finished
            const allFinished = Array.from(room.players.values()).every(p => p.finished);
            if (allFinished) {
              endGame(room, 'ALL_FINISHED');
            }
          }
          break;
        }

        case 'UPDATE_PROGRESS': {
          const room = rooms.get(currentRoomCode);
          if (!room || room.state !== 'PLAYING') return;
          const player = room.players.get(currentPlayerId);
          if (player) {
            player.steps = data.steps || player.steps;
            player.exploredPct = data.exploredPct || player.exploredPct;
          }
          break;
        }

        case 'PLAY_AGAIN': {
          const room = rooms.get(currentRoomCode);
          if (room && room.hostId === currentPlayerId) {
            if (room.timerInterval) clearInterval(room.timerInterval);
            room.state = 'LOBBY';
            room.mazeData = null;
            room.players.forEach(p => {
              p.finished = false;
              p.finishTime = null;
              p.lettersFound = new Set();
              p.steps = 0;
              p.exploredPct = 0;
            });
            broadcastToRoom(room, {
              type: 'RETURN_TO_LOBBY',
              players: Array.from(room.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                color: p.color,
                isHost: p.id === room.hostId
              })),
              timerDuration: room.timerDuration,
              difficulty: room.difficulty
            });
          }
          break;
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        const leavingPlayer = room.players.get(currentPlayerId);
        room.players.delete(currentPlayerId);

        if (room.players.size === 0) {
          if (room.timerInterval) clearInterval(room.timerInterval);
          rooms.delete(currentRoomCode);
        } else {
          // If host left, assign new host
          if (room.hostId === currentPlayerId) {
            const nextHost = room.players.values().next().value;
            if (nextHost) {
              room.hostId = nextHost.id;
              nextHost.isHost = true;
            }
          }
          broadcastToRoom(room, {
            type: 'PLAYER_LEFT',
            playerId: currentPlayerId,
            playerName: leavingPlayer ? leavingPlayer.name : 'A player',
            players: Array.from(room.players.values()).map(p => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              color: p.color,
              isHost: p.id === room.hostId
            }))
          });
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================================');
  console.log(`⚡ ACM MAZE MULTIPLAYER SERVER ACTIVE`);
  console.log(`🌐 Localhost: http://localhost:${PORT}`);
  console.log(`📱 LAN / Mobile Join: http://${LAN_IP}:${PORT}`);
  console.log('========================================================');
});
