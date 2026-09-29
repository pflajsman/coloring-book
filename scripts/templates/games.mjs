import { page, circle, ellipse, rect, line, path, poly, dot, dashed, digit } from './svg.mjs';

// Deterministic PRNG so regenerating the pages gives identical files.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Recursive-backtracker maze: every cell reachable, exactly one path
// between any two cells. walls.right[y][x] / walls.down[y][x] = wall present.
export function makeMaze(cols, rows, seed) {
  const r = rng(seed);
  const right = Array.from({ length: rows }, () => Array(cols).fill(true));
  const down = Array.from({ length: rows }, () => Array(cols).fill(true));
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny][nx]);
    if (!next.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = next[Math.floor(r() * next.length)];
    if (dx === 1) right[y][x] = false;
    if (dx === -1) right[y][nx] = false;
    if (dy === 1) down[y][x] = false;
    if (dy === -1) down[ny][x] = false;
    seen[ny][nx] = true;
    stack.push([nx, ny]);
  }
  return { cols, rows, walls: { right, down } };
}

export function solveMaze(m) {
  const seen = new Set(['0,0']);
  const q = [[0, 0]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === m.cols - 1 && y === m.rows - 1) return true;
    const moves = [];
    if (x < m.cols - 1 && !m.walls.right[y][x]) moves.push([x + 1, y]);
    if (x > 0 && !m.walls.right[y][x - 1]) moves.push([x - 1, y]);
    if (y < m.rows - 1 && !m.walls.down[y][x]) moves.push([x, y + 1]);
    if (y > 0 && !m.walls.down[y - 1][x]) moves.push([x, y - 1]);
    for (const [nx, ny] of moves) {
      const k = `${nx},${ny}`;
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return false;
}

// Maze drawn on a 1000x640 board centred on the page, entrance on the left
// of the top-left cell, exit on the right of the bottom-right cell. Small
// start and goal icons sit outside the board.
function mazeSvg(m, startIcon, goalIcon) {
  const W = 900, H = 600, x0 = 150, y0 = 100;
  const cw = W / m.cols, ch = H / m.rows;
  const parts = [];
  // Outer frame with the two openings.
  parts.push(line(x0, y0, x0 + W, y0));
  parts.push(line(x0, y0 + H, x0 + W, y0 + H));
  parts.push(line(x0, y0 + ch, x0, y0 + H));
  parts.push(line(x0 + W, y0, x0 + W, y0 + H - ch));
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
    const px = x0 + x * cw, py = y0 + y * ch;
    if (x < m.cols - 1 && m.walls.right[y][x]) parts.push(line(px + cw, py, px + cw, py + ch));
    if (y < m.rows - 1 && m.walls.down[y][x]) parts.push(line(px, py + ch, px + cw, py + ch));
  }
  parts.push(startIcon(x0 - 75, y0 + ch / 2));
  parts.push(goalIcon(x0 + W + 75, y0 + H - ch / 2));
  return page(parts.join('\n'));
}

// Small icons for maze ends (about 110 px across, closed shapes).
const bunny = (cx, cy) => [ellipse(cx, cy + 15, 38, 32), ellipse(cx - 16, cy - 45, 11, 28), ellipse(cx + 16, cy - 45, 11, 28), dot(cx - 12, cy + 8, 5), dot(cx + 12, cy + 8, 5)].join('');
const carrot = (cx, cy) => [poly([[cx - 26, cy - 30], [cx + 26, cy - 30], [cx, cy + 50]]), path(`M${cx} ${cy - 30} L${cx - 14} ${cy - 62} M${cx} ${cy - 30} L${cx + 14} ${cy - 62}`)].join('');
const mouse = (cx, cy) => [ellipse(cx, cy + 10, 40, 28), circle(cx - 26, cy - 18, 14), circle(cx + 26, cy - 18, 14), dot(cx - 10, cy + 4, 5), dot(cx + 10, cy + 4, 5)].join('');
const cheese = (cx, cy) => [poly([[cx - 45, cy + 30], [cx + 45, cy + 30], [cx + 45, cy - 10], [cx - 45, cy - 40]]), circle(cx - 8, cy + 8, 9)].join('');
const bee = (cx, cy) => [ellipse(cx, cy, 36, 26), ellipse(cx - 12, cy - 34, 18, 12), ellipse(cx + 12, cy - 34, 18, 12), line(cx - 8, cy - 26, cx - 8, cy + 26), line(cx + 10, cy - 24, cx + 10, cy + 24)].join('');
const flowerIcon = (cx, cy) => [circle(cx, cy, 16), ...[0, 72, 144, 216, 288].map((a) => { const r = (a * Math.PI) / 180; return circle(cx + Math.cos(r) * 34, cy + Math.sin(r) * 34, 18); })].join('');
const boat = (cx, cy) => [poly([[cx - 50, cy + 10], [cx + 50, cy + 10], [cx + 30, cy + 40], [cx - 30, cy + 40]]), poly([[cx, cy + 10], [cx, cy - 55], [cx + 38, cy + 10]])].join('');
const island = (cx, cy) => [path(`M${cx - 55} ${cy + 35} Q ${cx} ${cy - 10} ${cx + 55} ${cy + 35} Z`), line(cx, cy + 12, cx + 4, cy - 45), path(`M${cx + 4} ${cy - 45} Q ${cx + 40} ${cy - 55} ${cx + 45} ${cy - 30} M${cx + 4} ${cy - 45} Q ${cx - 30} ${cy - 60} ${cx - 42} ${cy - 30}`)].join('');

// Connect-the-dots: numbered points around a shape outline. Only the dots
// and numbers are drawn; the child draws the lines.
function dotsSvg(points) {
  const parts = points.map(([x, y], i) => dot(x, y, 9) + digit(x + (x < 600 ? -30 : 30), y - 16, String(i + 1)));
  return page(parts.join('\n'));
}
const around = (count, fn) => Array.from({ length: count }, (_, i) => fn((i / count) * Math.PI * 2, i));
const STAR = around(10, (a, i) => { const r = i % 2 ? 150 : 320; return [600 + Math.sin(a) * r, 410 - Math.cos(a) * r]; });
const HOUSE = [[380, 700], [380, 400], [300, 400], [600, 130], [900, 400], [820, 400], [820, 700], [700, 700], [600, 700], [480, 700]];
const HEART = around(20, (a) => { const t = a; return [600 + 16 * Math.sin(t) ** 3 * 19, 400 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 19]; });
const FISH = around(20, (a) => { const x = Math.cos(a), y = Math.sin(a); return x < -0.6 ? [600 + x * 420, 400 + y * 340] : [560 + x * 300, 400 + y * 200]; });

// Board games to play with a grown-up.
function ticTacToe(big) {
  const s = big ? 540 : 420, x0 = 600 - s / 2, y0 = 400 - s / 2;
  const parts = [line(x0 + s / 3, y0, x0 + s / 3, y0 + s), line(x0 + (2 * s) / 3, y0, x0 + (2 * s) / 3, y0 + s), line(x0, y0 + s / 3, x0 + s, y0 + s / 3), line(x0, y0 + (2 * s) / 3, x0 + s, y0 + (2 * s) / 3)];
  return page(parts.join('\n'));
}
function twoBoards() {
  const board = (cx) => { const s = 360, x0 = cx - s / 2, y0 = 220; return [line(x0 + s / 3, y0, x0 + s / 3, y0 + s), line(x0 + (2 * s) / 3, y0, x0 + (2 * s) / 3, y0 + s), line(x0, y0 + s / 3, x0 + s, y0 + s / 3), line(x0, y0 + (2 * s) / 3, x0 + s, y0 + (2 * s) / 3)].join(''); };
  return page(board(330) + board(870));
}
function dotGrid(cols, rows) {
  const gap = Math.min(900 / (cols - 1), 600 / (rows - 1));
  const x0 = 600 - (gap * (cols - 1)) / 2, y0 = 400 - (gap * (rows - 1)) / 2;
  const parts = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) parts.push(dot(x0 + x * gap, y0 + y * gap, 10));
  return page(parts.join('\n'));
}

// Tracing sheets: dashed lines to follow with a finger or the pen.
const rows4 = (fn) => [180, 330, 480, 630].map(fn).join('\n');
const zigzag = () => page(rows4((y) => dashed(`M150 ${y} ${Array.from({ length: 9 }, (_, i) => `L${250 + i * 100} ${y + (i % 2 ? -50 : 50)}`).join(' ')}`)));
const waves = () => page(rows4((y) => dashed(`M150 ${y} ${Array.from({ length: 5 }, (_, i) => `Q ${250 + i * 200} ${y - 70} ${350 + i * 200} ${y} T ${450 + i * 200} ${y}`).join(' ')}`)));
const loops = () => page(rows4((y) => dashed(`M150 ${y + 30} ${Array.from({ length: 7 }, (_, i) => { const x = 230 + i * 120; return `C ${x + 40} ${y + 30} ${x + 60} ${y - 60} ${x} ${y - 60} C ${x - 60} ${y - 60} ${x - 40} ${y + 30} ${x + 120} ${y + 30}`; }).join(' ')}`)));
const shapes = () => page([
  dashed('M200 200 L400 200 L400 400 L200 400 Z'),
  dashed(`M${650} 300 m -110 0 a 110 110 0 1 0 220 0 a 110 110 0 1 0 -220 0`),
  dashed('M1000 190 L1110 410 L890 410 Z'),
  dashed('M300 700 L200 600 Q 200 520 300 560 Q 400 520 400 600 Z'),
  dashed('M700 520 L740 610 L840 620 L765 685 L790 780 L700 730 L610 780 L635 685 L560 620 L660 610 Z'),
].join('\n'));

export const GAMES = [
  { id: 'maze-bunny', name: 'Bunny maze', category: 'Games', svg: mazeSvg(makeMaze(4, 3, 11), bunny, carrot) },
  { id: 'maze-mouse', name: 'Mouse maze', category: 'Games', svg: mazeSvg(makeMaze(5, 4, 23), mouse, cheese) },
  { id: 'maze-bee', name: 'Bee maze', category: 'Games', svg: mazeSvg(makeMaze(6, 4, 37), bee, flowerIcon) },
  { id: 'maze-boat', name: 'Boat maze', category: 'Games', svg: mazeSvg(makeMaze(6, 5, 41), boat, island) },
  { id: 'dots-star', name: 'Dots: star', category: 'Games', svg: dotsSvg(STAR) },
  { id: 'dots-house', name: 'Dots: house', category: 'Games', svg: dotsSvg(HOUSE) },
  { id: 'dots-heart', name: 'Dots: heart', category: 'Games', svg: dotsSvg(HEART) },
  { id: 'dots-fish', name: 'Dots: fish', category: 'Games', svg: dotsSvg(FISH) },
  { id: 'tic-tac-toe', name: 'Tic-tac-toe', category: 'Games', svg: ticTacToe(true) },
  { id: 'tic-tac-toe-two', name: 'Two tic-tac-toes', category: 'Games', svg: twoBoards() },
  { id: 'dot-grid-small', name: 'Dots and boxes (small)', category: 'Games', svg: dotGrid(5, 4) },
  { id: 'dot-grid-big', name: 'Dots and boxes (big)', category: 'Games', svg: dotGrid(7, 5) },
  { id: 'trace-zigzag', name: 'Trace: zigzag', category: 'Games', svg: zigzag() },
  { id: 'trace-waves', name: 'Trace: waves', category: 'Games', svg: waves() },
  { id: 'trace-loops', name: 'Trace: loops', category: 'Games', svg: loops() },
  { id: 'trace-shapes', name: 'Trace: shapes', category: 'Games', svg: shapes() },
];
