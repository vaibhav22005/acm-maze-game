// Labyrinth and Fog-of-War Generation Engine
class MazeGenerator {
  constructor(difficulty = 'medium') {
    this.setDifficulty(difficulty);
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    if (difficulty === 'easy') {
      this.width = 17;
      this.height = 17;
    } else if (difficulty === 'hard') {
      this.width = 35;
      this.height = 35;
    } else {
      // Default: Medium hardness as requested
      this.width = 27;
      this.height = 27;
    }
  }

  generate() {
    const W = this.width;
    const H = this.height;

    // 1 = Wall, 0 = Passage
    const grid = Array.from({ length: H }, () => Array(W).fill(1));

    // Randomized DFS Recursive Backtracker
    const stack = [];
    const startX = 1;
    const startY = 1;

    grid[startY][startX] = 0;
    stack.push([startX, startY]);

    const dirs = [
      [0, -2], // Up
      [0, 2],  // Down
      [-2, 0], // Left
      [2, 0]   // Right
    ];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];

      // Shuffle directions for randomized labyrinth branching
      const shuffledDirs = [...dirs].sort(() => Math.random() - 0.5);
      let foundUnvisited = false;

      for (const [dx, dy] of shuffledDirs) {
        const nx = cx + dx;
        const ny = cy + dy;

        if (nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && grid[ny][nx] === 1) {
          // Carve path and intermediate wall
          grid[cy + dy / 2][cx + dx / 2] = 0;
          grid[ny][nx] = 0;
          stack.push([nx, ny]);
          foundUnvisited = true;
          break;
        }
      }

      if (!foundUnvisited) {
        stack.pop();
      }
    }

    const playerStart = { x: 1, y: 1 };

    // Find all valid passage positions (excluding start)
    const passageCells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] === 0 && !(x === playerStart.x && y === playerStart.y)) {
          passageCells.push({ x, y });
        }
      }
    }

    // Place ACM spell letters at random positions
    const runeLetters = ['A', 'C', 'M'];
    const runeColors = { 'A': '#00f3ff', 'C': '#ff007f', 'M': '#ffd700' };
    const letters = [];

    // Filter candidates with fair distance from start
    const validCandidates = passageCells.filter(p => {
      const distStart = Math.abs(p.x - playerStart.x) + Math.abs(p.y - playerStart.y);
      return distStart >= 7;
    });

    const shuffledCandidates = [...validCandidates].sort(() => Math.random() - 0.5);

    // Pick 3 distributed spots
    for (const char of runeLetters) {
      let chosen = null;
      for (let i = 0; i < shuffledCandidates.length; i++) {
        const cand = shuffledCandidates[i];
        const tooClose = letters.some(l => {
          const d = Math.abs(l.x - cand.x) + Math.abs(l.y - cand.y);
          return d < 6;
        });

        if (!tooClose) {
          chosen = cand;
          shuffledCandidates.splice(i, 1);
          break;
        }
      }

      if (!chosen && shuffledCandidates.length > 0) {
        chosen = shuffledCandidates.pop();
      }

      letters.push({
        char: char,
        x: chosen.x,
        y: chosen.y,
        found: false, // Completely invisible until reached!
        color: runeColors[char]
      });
    }

    const travelled = Array.from({ length: H }, () => Array(W).fill(false));
    const revealedWalls = Array.from({ length: H }, () => Array(W).fill(false));

    let totalPassages = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] === 0) totalPassages++;
      }
    }

    return {
      width: W,
      height: H,
      grid,
      playerStart,
      letters,
      travelled,
      revealedWalls,
      totalPassages
    };
  }
}

if (typeof window !== 'undefined') window.MazeGenerator = MazeGenerator;
if (typeof module !== 'undefined') module.exports = { MazeGenerator };
