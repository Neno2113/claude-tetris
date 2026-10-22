'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skinSelect = document.getElementById('skin-select');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');
const playBtn = document.getElementById('play-btn');
const clearBtn = document.getElementById('clear-btn');
const recordsBody = document.getElementById('records-body');
const statsEl = document.getElementById('stats');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

const RECORDS_KEY = 'tetris.records';
const STATS_KEY = 'tetris.stats';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, startLevel = 1, combo, maxCombo, records, stats, pendingEntry, savedEntry;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  combo = clearLines() ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins: colors[] indexado como COLORS (1-7) ----
const SKINS = {
  retro: {
    colors: COLORS,
    bg: '#1a1a25',
    grid: '#22222e',
    drawBlock(context, x, y, ci, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[ci];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#536dfe', '#ff9100'],
    bg: '#000000',
    grid: '#16161c',
    drawBlock(context, x, y, ci, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = this.colors[ci];
      context.shadowBlur = 12;
      context.strokeStyle = this.colors[ci];
      context.lineWidth = 2;
      context.fillStyle = this.colors[ci] + '55';
      context.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
      context.strokeRect(x * size + 3, y * size + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.globalAlpha = 1;
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8e6', '#bfe8c4', '#f6b8b8', '#b8c4f0', '#ffd9b0'],
    bg: '#fdf6f0',
    grid: '#efe4da',
    drawBlock(context, x, y, ci, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[ci];
      context.beginPath();
      const px = x * size + 2, py = y * size + 2, s = size - 4, r = 7;
      if (context.roundRect) context.roundRect(px, py, s, s, r);
      else {
        context.moveTo(px + r, py);
        context.arcTo(px + s, py, px + s, py + s, r);
        context.arcTo(px + s, py + s, px, py + s, r);
        context.arcTo(px, py + s, px, py, r);
        context.arcTo(px, py, px + s, py, r);
        context.closePath();
      }
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    colors: [null, '#29adff', '#ffec27', '#b24bd6', '#00e436', '#ff004d', '#4a5cd9', '#ffa300'],
    bg: '#1d2b53',
    grid: '#27386b',
    drawBlock(context, x, y, ci, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      const px = x * size, py = y * size, u = size / 6;
      context.fillStyle = '#000';
      context.fillRect(px, py, size, size);
      context.fillStyle = this.colors[ci];
      context.fillRect(px + 2, py + 2, size - 4, size - 4);
      // damero oscuro (dither)
      context.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++)
          if ((i + j) % 2) context.fillRect(px + 2 + i * u * 0.96 + 0.5, py + 2 + j * u * 0.96 + 0.5, u * 0.96, u * 0.96);
      context.globalAlpha = 1;
    },
  },
};

let skinName = 'retro';
try {
  const saved = localStorage.getItem('tetris.skin');
  if (saved && Object.prototype.hasOwnProperty.call(SKINS, saved)) skinName = saved;
} catch (e) { /* localStorage no disponible */ }

function applySkin(name) {
  skinName = name;
  const bg = SKINS[name].bg;
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  if (board && current && next) { draw(); drawNext(); }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  SKINS[skinName].drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skinName].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.fillStyle = SKINS[skinName].bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.fillStyle = SKINS[skinName].bg;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Records (localStorage, siempre con try/catch) ----
function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* almacenamiento no disponible */ }
}

function loadRecords() {
  const list = loadJSON(RECORDS_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(r => r && typeof r.score === 'number')
    .map(r => ({ name: String(r.name ?? 'Jugador'), score: r.score, lines: Number(r.lines) || 0, level: Number(r.level) || 1, date: r.date }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
}

function loadStats() {
  const s = loadJSON(STATS_KEY, {});
  return {
    maxCombo: Number(s && s.maxCombo) || 0,
    maxLines: Number(s && s.maxLines) || 0,
  };
}

function qualifies(sc) {
  return sc > 0 && (records.length < MAX_RECORDS || sc > records[records.length - 1].score);
}

function renderRecords() {
  recordsBody.textContent = '';
  if (!records.length) {
    const tr = recordsBody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 6;
    td.className = 'empty';
    td.textContent = 'Sin records todavía';
  }
  records.forEach((r, i) => {
    const tr = recordsBody.insertRow();
    if (r === savedEntry) tr.className = 'current';
    const d = new Date(r.date);
    const date = isNaN(d) ? '' : d.toLocaleDateString('es');
    [i + 1, String(r.name), Number(r.score).toLocaleString(), r.lines, r.level, date].forEach(v => {
      tr.insertCell().textContent = v;
    });
  });
  statsEl.textContent = `Mejor combo: ${stats.maxCombo} · Máx. líneas: ${stats.maxLines}`;
}

function saveEntry() {
  if (!pendingEntry) return;
  pendingEntry.name = nameInput.value.trim().slice(0, 12) || 'Jugador';
  records.push(pendingEntry);
  records.sort((a, b) => b.score - a.score); // estable: empates quedan detrás
  records = records.slice(0, MAX_RECORDS);
  savedEntry = records.includes(pendingEntry) ? pendingEntry : null;
  pendingEntry = null;
  saveJSON(RECORDS_KEY, records);
  nameForm.classList.add('hidden');
  renderRecords();
}

function showStart() {
  records = loadRecords();
  stats = loadStats();
  savedEntry = pendingEntry = null;
  overlay.className = 'overlay mode-start';
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  nameForm.classList.add('hidden');
  renderRecords();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records = loadRecords();
  stats = loadStats();
  stats.maxCombo = Math.max(stats.maxCombo, maxCombo);
  stats.maxLines = Math.max(stats.maxLines, lines);
  saveJSON(STATS_KEY, stats);
  savedEntry = null;
  pendingEntry = qualifies(score)
    ? { name: '', score, lines, level, date: new Date().toISOString() }
    : null;
  nameForm.classList.toggle('hidden', !pendingEntry);
  nameInput.value = 'Jugador';
  renderRecords();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Combo máx.: ${maxCombo}`;
  overlay.className = 'overlay mode-over';
  if (pendingEntry) { nameInput.focus(); nameInput.select(); }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    dropAccum = 0;
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    controlsList.classList.add('hidden');
    startLevelSel.value = startLevel;
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  if (document.activeElement) document.activeElement.blur(); // evita que Space reactive un botón
  setup();
  overlay.className = 'overlay hidden';
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function setup() {
  combo = 0;
  maxCombo = 0;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  pauseMenu.classList.add('hidden');
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // escribiendo el nombre
  if (document.activeElement === skinSelect) skinSelect.blur(); // el juego tiene prioridad sobre el select
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat && e.target !== startLevelSel) togglePause(); // Esc en el select solo lo cierra
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });
playBtn.addEventListener('click', init);
nameForm.addEventListener('submit', e => { e.preventDefault(); saveEntry(); });
clearBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records y mejores marcas?')) return;
  records = [];
  stats = { maxCombo: 0, maxLines: 0 };
  savedEntry = pendingEntry = null;
  try { localStorage.removeItem(RECORDS_KEY); localStorage.removeItem(STATS_KEY); } catch (e) { /* ignorar */ }
  nameForm.classList.add('hidden');
  renderRecords();
});
resumeBtn.addEventListener('click', () => { resumeBtn.blur(); togglePause(); });
pauseRestartBtn.addEventListener('click', () => { pauseRestartBtn.blur(); init(); });
controlsBtn.addEventListener('click', () => { controlsBtn.blur(); controlsList.classList.toggle('hidden'); });
startLevelSel.addEventListener('change', () => { startLevel = +startLevelSel.value; startLevelSel.blur(); });

skinSelect.value = skinName;
skinSelect.addEventListener('change', () => {
  const name = skinSelect.value;
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) return;
  try { localStorage.setItem('tetris.skin', name); } catch (e) { /* ignorar */ }
  applySkin(name);
  skinSelect.blur(); // evita que flechas/Space cambien el select
});

applySkin(skinName);

// pantalla de inicio: el juego arranca con "Jugar"
setup();
gameOver = true;
draw();
showStart();
