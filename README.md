# ⚡ ACM Maze Quest — Multiplayer Fog of War

An interactive real-time multiplayer party maze game featuring progressive fog-of-war exploration rendering, random hidden collectible runes (**A**, **C**, and **M**), seamless QR code mobile join, host-configurable countdown timers, and a live synchronized post-game leaderboard!

---

## 🎮 Gameplay & Mechanics

1. **Fog of War (Exploration Trail)**:
   - The labyrinth starts completely shrouded in darkness.
   - Corridors and bordering walls are permanently revealed only as players travel through them.
2. **Hidden ACM Runes (Any Order Collection)**:
   - Runes **A**, **C**, and **M** are dynamically spawned at random reachable positions every match.
   - Runes remain completely invisible in the labyrinth until stepped on.
   - Collect them in **any order**!
3. **Instant Victory (No Exit Portal)**:
   - As soon as a player collects their 3rd rune, their race concludes immediately.
4. **Seamless QR Code Join**:
   - Host screen presents a high-resolution QR code and a 4-letter room code (e.g. \ACM1\).
   - Other players scan with their mobile phone cameras to instantly join the lobby.
5. **Configurable Match Timer**:
   - Host chooses match duration: 60s, 120s, 180s, 300s.
6. **Live Leaderboard**:
   - Features top-3 podium (🥇, 🥈, 🥉) and detailed scoreboard.

---

## 🚀 Quick Start

### 1. Install Dependencies
\\\ash
npm install
\\\

### 2. Run the Game
\\\ash
node server.js
\\\

- **Host on Computer**: Open [http://localhost:3000](http://localhost:3000)
- **Join from Phones**: Scan the on-screen QR Code (or visit your LAN IP on the same Wi-Fi)

---

## 🛠️ Tech Stack
- **Backend**: Node.js, WebSockets (\ws\), \qrcode\
- **Frontend**: HTML5 Canvas, Vanilla ES6 JavaScript, CSS3 Cyberpunk Theme, Web Audio API
