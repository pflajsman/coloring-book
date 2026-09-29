# Part C: New and Cleaned-Up Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 21 badly rendering templates, add 60 new bold original pictures (44 new subjects + 16 redraws), and keep the picker working offline.

**Architecture:** Node ES-module scripts under `scripts/templates/` generate SVG files into `public/templates/` and rewrite `manifest.json`. A shared toolkit (`svg.mjs`) fixes the line style. Games are procedural (`games.mjs`). Pictures are described as small primitive lists in `pictures/*.mjs`. A checker (`check.mjs`) renders every template through the app's own pipeline in headless Chrome and enforces fillability thresholds, and writes a contact sheet for visual review.

**Tech Stack:** Node 20+ ESM, Vitest (node env), headless Google Chrome (`/Applications/Google Chrome.app`), no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-kid-lock-icons-templates-design.md` (Part C: C, C2, C3)

## Global Constraints

- Source SVG viewBox `0 0 1200 800`; root group `fill="none" stroke="#000" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"` (the app letterboxes to 88 %, so 9 renders at about 8 px, the spec's 6 to 8).
- No fills except black dots/eyes (`fill="#000"`), no grey, no shading, no text except digits on connect-the-dots and one-word labels on mazes ("Start" is not used; icons only).
- Every region a child should colour must be closed. Closed shapes are drawn as `circle`, `ellipse`, `rect`, closed `path` (ending in `Z`) or polygons.
- Checker thresholds for pictures (not games): `big >= 3`, `tiny <= 3`, `small <= 12`, `2 <= ink% <= 16`. Games: `tiny <= 6`, `ink% <= 16`, no `small` limit (digits have counters).
- Manifest keeps `blank` first; categories in order: Animals, Fairy tales, Fantasy, Vehicles, Places, Nature, Food, Toys, Games. Ids are kebab-case and equal the file name without `.svg`.
- Redraws reuse the old id and file name. Dropped entirely: `santa`, `princess-couple`, `princess-fairy`, `unicorn`, `unicorn-castle`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no em dashes in user-facing names.

## Review Focus

- A picture whose main body is not closed, so one fill tap floods the page: caught by the checker's `big >= 3` plus the contact sheet review; Task 3 test `flags an open outline`.
- A maze with no path from start to goal: Task 2 test `every maze is solvable`.
- Two generated entries with the same id, or a manifest entry without a file: Task 1 test `mergeManifest rejects duplicate ids`, Task 7 check `every manifest file exists`.
- Offline: new files must be precached (`svg` already in globPatterns); Task 7 build check greps `dist/sw.js` for a new file.
- Very small details a 3-year-old cannot fill (eyes, buttons): thresholds `small <= 12` and visual review; drawing rule "no enclosed area smaller than about 40 px across at 1200x800, except eyes drawn as solid dots".

## Deviation note (drawing content)

The artwork itself is creative work that is authored and judged visually, so Tasks 4 to 6 give a content brief per picture plus one fully coded example, not every coordinate. The gate for each picture is objective: checker thresholds pass and the contact sheet shows a recognizable subject with closed bold outlines. Record any picture that needed a second attempt in the ledger.

---

### Task 1: Toolkit, manifest merge and test wiring

**Files:**
- Create: `scripts/templates/svg.mjs`
- Create: `scripts/templates/manifest.mjs`
- Test: `scripts/templates/templates.test.mjs`
- Modify: `vitest.config.ts` (include scripts tests)

**Interfaces:**
- Produces (`svg.mjs`): `page(body: string): string`; `circle(cx, cy, r)`, `ellipse(cx, cy, rx, ry)`, `rect(x, y, w, h, r = 0)`, `line(x1, y1, x2, y2)`, `path(d)`, `poly(points: [number, number][], closed = true)`, `dot(cx, cy, r)` (black filled), `dashed(d, dash = 22, gap = 18)`, `digit(x, y, text, size = 34)`, `group(transform, ...parts)`. All return strings.
- Produces (`manifest.mjs`): `CATEGORY_ORDER`, `mergeManifest(existing: Entry[], { remove: string[], upsert: Entry[] }): Entry[]` where `Entry = { id, name, file, category }`.

- [ ] **Step 1: Write the failing tests**

`scripts/templates/templates.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { page, circle, poly, dashed, dot, digit } from './svg.mjs';
import { mergeManifest } from './manifest.mjs';

describe('svg toolkit', () => {
  it('wraps content in the fixed line style', () => {
    const s = page(circle(10, 10, 5));
    expect(s).toContain('viewBox="0 0 1200 800"');
    expect(s).toContain('stroke-width="9"');
    expect(s).toContain('fill="none"');
    expect(s).toContain('<circle cx="10" cy="10" r="5"/>');
  });

  it('closes polygons unless asked not to', () => {
    expect(poly([[0, 0], [10, 0], [10, 10]])).toContain('Z');
    expect(poly([[0, 0], [10, 0]], false)).not.toContain('Z');
  });

  it('dots are filled black, dashes are dashed, digits are text', () => {
    expect(dot(1, 2, 3)).toContain('fill="#000"');
    expect(dashed('M0 0 L10 0')).toContain('stroke-dasharray');
    expect(digit(5, 5, '12')).toContain('>12</text>');
  });
});

describe('mergeManifest', () => {
  const blank = { id: 'blank', name: 'Blank page', file: null, category: 'Other' };
  const cat = { id: 'cat', name: 'Kitty cat', file: 'cat.svg', category: 'Animals' };
  const horseOld = { id: 'horse', name: 'Horse', file: 'horse.svg', category: 'Animals' };

  it('removes, upserts and keeps blank first, grouped by category order', () => {
    const out = mergeManifest([blank, cat, horseOld, { id: 'santa', name: 'Santa', file: 'santa.svg', category: 'Fantasy' }], {
      remove: ['santa'],
      upsert: [
        { id: 'horse', name: 'Pony', file: 'horse.svg', category: 'Animals' },
        { id: 'maze-bunny', name: 'Bunny maze', file: 'maze-bunny.svg', category: 'Games' },
        { id: 'castle', name: 'Castle', file: 'castle.svg', category: 'Fairy tales' },
      ],
    });
    expect(out.map((e) => e.id)).toEqual(['blank', 'cat', 'horse', 'castle', 'maze-bunny']);
    expect(out.find((e) => e.id === 'horse').name).toBe('Pony');
  });

  it('rejects duplicate ids in the upsert list', () => {
    expect(() => mergeManifest([blank], { remove: [], upsert: [cat, cat] })).toThrow(/duplicate/);
  });
});
```

In `vitest.config.ts` change `include: ['src/**/*.test.ts']` to `include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs']`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/templates/templates.test.mjs`
Expected: FAIL, cannot resolve `./svg.mjs`.

- [ ] **Step 3: Implement the toolkit**

`scripts/templates/svg.mjs`:

```js
// Tiny SVG toolkit for generated coloring pages. One fixed line style for
// every picture: bold black round strokes, no fills, 1200x800 canvas. The
// app letterboxes pages to 88 %, so 9 units render at about 8 px.

const n = (v) => Math.round(v * 10) / 10;

export function page(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
<g fill="none" stroke="#000" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
${body}
</g>
</svg>
`;
}

export const circle = (cx, cy, r) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
export const ellipse = (cx, cy, rx, ry) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"/>`;
export const rect = (x, y, w, h, r = 0) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r ? ` rx="${n(r)}"` : ''}/>`;
export const line = (x1, y1, x2, y2) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`;
export const path = (d) => `<path d="${d}"/>`;
export const poly = (points, closed = true) =>
  `<path d="M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}${closed ? ' Z' : ''}"/>`;
// Solid black dot (eyes, noses, connect-the-dots points). Filled so it never
// becomes a tiny unfillable ring.
export const dot = (cx, cy, r) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#000" stroke="none"/>`;
export const dashed = (d, dash = 22, gap = 18) => `<path d="${d}" stroke-dasharray="${dash} ${gap}"/>`;
export const digit = (x, y, text, size = 34) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" fill="#000" stroke="none" text-anchor="middle">${text}</text>`;
export const group = (transform, ...parts) => `<g transform="${transform}">${parts.join('')}</g>`;
```

`scripts/templates/manifest.mjs`:

```js
// Merge generated entries into templates/manifest.json: drop removed ids,
// replace or add generated ones, keep "blank" first and group by category.

export const CATEGORY_ORDER = ['Other', 'Animals', 'Fairy tales', 'Fantasy', 'Vehicles', 'Places', 'Nature', 'Food', 'Toys', 'Games'];

export function mergeManifest(existing, { remove, upsert }) {
  const seen = new Set();
  for (const e of upsert) {
    if (seen.has(e.id)) throw new Error(`duplicate template id: ${e.id}`);
    seen.add(e.id);
  }
  const drop = new Set(remove);
  const byId = new Map();
  for (const e of existing) if (!drop.has(e.id)) byId.set(e.id, e);
  for (const e of upsert) byId.set(e.id, e);
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  // Stable: keeps existing order inside a category, new entries after.
  return [...byId.values()]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e.category) - rank(b.e.category) || a.i - b.i)
    .map(({ e }) => e);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run scripts/templates/templates.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/templates/svg.mjs scripts/templates/manifest.mjs scripts/templates/templates.test.mjs vitest.config.ts
git commit -m "Add SVG toolkit and manifest merge for generated templates"
```

---

### Task 2: Games (mazes, connect-the-dots, boards, tracing)

**Files:**
- Create: `scripts/templates/games.mjs`
- Test: `scripts/templates/games.test.mjs`

**Interfaces:**
- Consumes: toolkit (Task 1).
- Produces: `rng(seed): () => number` (mulberry32); `makeMaze(cols, rows, seed): { cols, rows, walls: { right: boolean[][], down: boolean[][] } }`; `solveMaze(maze): boolean` (start top-left cell, goal bottom-right cell); `GAMES: Array<{ id, name, category: 'Games', svg: string }>` (16 entries).

- [ ] **Step 1: Write the failing tests**

`scripts/templates/games.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { GAMES, makeMaze, solveMaze } from './games.mjs';

describe('makeMaze', () => {
  it('is deterministic for a seed', () => {
    expect(makeMaze(5, 4, 7)).toEqual(makeMaze(5, 4, 7));
    expect(makeMaze(5, 4, 7)).not.toEqual(makeMaze(5, 4, 8));
  });

  it('every maze is solvable', () => {
    for (let seed = 1; seed <= 50; seed++) expect(solveMaze(makeMaze(6, 4, seed))).toBe(true);
  });

  it('is a perfect maze (cells - 1 openings)', () => {
    const m = makeMaze(6, 4, 3);
    let open = 0;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (x < m.cols - 1 && !m.walls.right[y][x]) open++;
      if (y < m.rows - 1 && !m.walls.down[y][x]) open++;
    }
    expect(open).toBe(6 * 4 - 1);
  });
});

describe('GAMES', () => {
  it('has 16 pages with unique ids in the Games category', () => {
    expect(GAMES).toHaveLength(16);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(16);
    for (const g of GAMES) {
      expect(g.category).toBe('Games');
      expect(g.svg).toContain('viewBox="0 0 1200 800"');
    }
  });

  it('connect-the-dots pages number every dot', () => {
    const d10 = GAMES.filter((g) => g.id.startsWith('dots-')).map((g) => (g.svg.match(/<text /g) ?? []).length);
    expect(d10.sort((a, b) => a - b)).toEqual([10, 10, 20, 20]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/templates/games.test.mjs`
Expected: FAIL, cannot resolve `./games.mjs`.

- [ ] **Step 3: Implement games.mjs**

`scripts/templates/games.mjs`:

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run scripts/templates/games.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/templates/games.mjs scripts/templates/games.test.mjs
git commit -m "Add procedural game pages: mazes, connect-the-dots, boards, tracing"
```

---

### Task 3: Render checker and generator entry point

**Files:**
- Create: `scripts/templates/check.html` (runs in headless Chrome)
- Create: `scripts/templates/checkRules.mjs`
- Test: add to `scripts/templates/templates.test.mjs`
- Create: `scripts/templates/check.mjs` (Node: static server + Chrome)
- Create: `scripts/templates/make.mjs` (writes SVGs + manifest)
- Modify: `package.json` scripts: `"templates": "node scripts/templates/make.mjs"`, `"templates:check": "node scripts/templates/check.mjs"`

**Interfaces:**
- Produces: `checkEntry(m: { id, ink, big, small, tiny }, isGame: boolean): string[]` (list of problems, empty = pass); `make.mjs` imports `GAMES` and `PICTURES` (from `pictures/index.mjs`, Task 4) and a `REMOVE` list.

- [ ] **Step 1: Failing test for the rules**

Append to `scripts/templates/templates.test.mjs`:

```js
import { checkEntry } from './checkRules.mjs';

describe('checkEntry', () => {
  it('passes a clean picture', () => {
    expect(checkEntry({ id: 'lion', ink: 6, big: 9, small: 4, tiny: 0 }, false)).toEqual([]);
  });

  it('flags an open outline (too few fillable areas)', () => {
    expect(checkEntry({ id: 'x', ink: 5, big: 2, small: 0, tiny: 0 }, false).join()).toMatch(/fillable/);
  });

  it('flags specks and faint or heavy ink', () => {
    const p = checkEntry({ id: 'x', ink: 1, big: 9, small: 30, tiny: 9 }, false).join(' | ');
    expect(p).toMatch(/specks/);
    expect(p).toMatch(/small areas/);
    expect(p).toMatch(/ink/);
  });

  it('games may have many small areas (digit counters)', () => {
    expect(checkEntry({ id: 'dots-star', ink: 3, big: 1, small: 40, tiny: 2 }, true)).toEqual([]);
  });
});
```

Run: `npx vitest run scripts/templates/templates.test.mjs`
Expected: FAIL, cannot resolve `./checkRules.mjs`.

- [ ] **Step 2: Implement checkRules.mjs**

```js
// Fillability rules for generated pages, measured on the app's own render
// (1200x800, white stripped). "big" = areas a child can fill (>= 1500 px),
// "small" = 60..1499 px, "tiny" = 4..59 px specks that make Fill look patchy.

export function checkEntry(m, isGame) {
  const problems = [];
  if (m.tiny > (isGame ? 6 : 3)) problems.push(`${m.id}: ${m.tiny} specks`);
  if (m.ink > 16) problems.push(`${m.id}: ink ${m.ink}% too heavy`);
  if (!isGame) {
    if (m.big < 3) problems.push(`${m.id}: only ${m.big} fillable areas (open outline?)`);
    if (m.small > 12) problems.push(`${m.id}: ${m.small} small areas`);
    if (m.ink < 2) problems.push(`${m.id}: ink ${m.ink}% too faint`);
  }
  return problems;
}
```

Run the test again. Expected: PASS.

- [ ] **Step 3: check.html (browser side)**

`scripts/templates/check.html`: the review page used during the cleanup review, adapted:
- loads `templates/manifest.json`, optional `?ids=a,b` filter;
- for each entry with a file: draws the SVG letterboxed at 6 % margin onto a 1200x800 canvas, applies the same alpha mapping as `processLineArt` in `src/templates/index.ts` (light >= 240 → 0, <= 64 → keep, linear between), measures ink % (alpha >= 128) and connected transparent regions (4-neighbour) bucketed as big >= 1500, small 60..1499, tiny 4..59;
- renders a 4-column contact sheet (384x256 thumbnails with id and metrics);
- writes `RESULTS` + JSON of `{ id, category, ink, big, small, tiny }` into a `<pre id="out">` and sets `document.title = 'done'`.

Copy the drawing and metrics code verbatim from `src/templates/index.ts` (`letterbox`, `processLineArt`) so the check can't drift from the app; keep a comment saying so.

- [ ] **Step 4: check.mjs (Node side)**

```js
// Render every template through the app's pipeline in headless Chrome,
// apply checkEntry, write a contact sheet, exit non-zero on problems.
// Usage: npm run templates:check [-- --ids=a,b] [-- --sheet=path.png]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { checkEntry } from './checkRules.mjs';
import { GAMES } from './games.mjs';
import { PICTURES } from './pictures/index.mjs';

// Only generated pages are held to the rules; kept clipart was accepted
// as-is in the 2026-09-29 review and is reported for information.
const generatedIds = new Set([...GAMES, ...PICTURES].map((g) => g.id));
const run = promisify(execFile);
const ROOT = path.resolve('public');
const HERE = path.resolve('scripts/templates');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ids = arg('ids') ?? '';
const sheet = arg('sheet');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = url.pathname === '/check.html' ? path.join(HERE, 'check.html') : path.join(ROOT, url.pathname);
  try {
    const body = await readFile(file);
    const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.json') ? 'application/json' : 'text/html';
    res.writeHead(200, { 'content-type': type }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;
const page = `http://localhost:${port}/check.html${ids ? `?ids=${ids}` : ''}`;
const flags = ['--headless=new', '--disable-gpu', '--virtual-time-budget=120000'];

try {
  const { stdout } = await run(CHROME, [...flags, '--dump-dom', page], { maxBuffer: 64 * 1024 * 1024 });
  const json = stdout.match(/RESULTS(\[.*?\])<\/pre>/s)?.[1];
  if (!json) throw new Error('checker page produced no results');
  const results = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (sheet) {
    const rowsN = Math.ceil(results.length / 4);
    await run(CHROME, [...flags, `--window-size=1590,${Math.max(300, rowsN * 290 + 40)}`, `--screenshot=${path.resolve(sheet)}`, page]);
  }
  const problems = results.filter((m) => generatedIds.has(m.id)).flatMap((m) => checkEntry(m, m.category === 'Games'));
  for (const m of results) console.log(`${generatedIds.has(m.id) ? ' ' : 'i'} ${m.id.padEnd(22)} ink ${String(m.ink).padStart(4)}% big ${m.big} small ${m.small} tiny ${m.tiny}`);
  if (problems.length) {
    console.error('\nProblems:\n' + problems.join('\n'));
    process.exitCode = 1;
  } else console.log(`\nAll ${results.length} templates pass.`);
} finally {
  server.close();
}
```

- [ ] **Step 5: make.mjs**

```js
// Write generated pages to public/templates and update manifest.json.
// Usage: npm run templates
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { GAMES } from './games.mjs';
import { PICTURES } from './pictures/index.mjs';
import { mergeManifest } from './manifest.mjs';

const DIR = path.resolve('public/templates');
// Rejected in the 2026-09-29 review and not redrawn.
export const REMOVE = ['santa', 'princess-couple', 'princess-fairy', 'unicorn', 'unicorn-castle'];

const generated = [...PICTURES, ...GAMES];
for (const g of generated) await writeFile(path.join(DIR, `${g.id}.svg`), g.svg);
for (const id of REMOVE) await rm(path.join(DIR, `${id}.svg`), { force: true });

const manifestPath = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const templates = mergeManifest(manifest.templates, {
  remove: REMOVE,
  upsert: generated.map(({ id, name, category }) => ({ id, name, file: `${id}.svg`, category })),
});
await writeFile(manifestPath, JSON.stringify({ templates }, null, 2) + '\n');
console.log(`Wrote ${generated.length} templates, removed ${REMOVE.length}; manifest has ${templates.length} entries.`);
```

Create `scripts/templates/pictures/index.mjs` with `export const PICTURES = [];` for now (filled in Tasks 4 to 6).

- [ ] **Step 6: Run generator and checker for games**

Run: `npm run templates && npm run templates:check -- --ids=<the 16 game ids, comma separated> --sheet=<scratchpad>/games.png`

Expected: no "Problems" section. Then read the sheet image and confirm: mazes have wide corridors and a visible way in and out; dots have readable numbers; boards and tracing lines are clear. Fix and re-run until both hold.

- [ ] **Step 7: Verify and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add scripts/templates package.json public/templates
git commit -m "Add template generator and render checker; generate game pages"
```

(The 5 dropped templates are removed from disk and manifest by this run.)

---

### Tasks 4 to 6: Picture sets

Each picture lives in `scripts/templates/pictures/<set>.mjs` as:

```js
export const ANIMALS = [
  { id: 'lion', name: 'Lion', category: 'Animals', svg: page([...].join('\n')) },
  // ...
];
```

and `pictures/index.mjs` re-exports `PICTURES = [...ANIMALS, ...FAIRY, ...VEHICLES, ...PLACES_FOOD]` as sets are added.

**Drawing rules (every picture):**
- Subject fills roughly 60 to 80 % of the 1200x800 canvas; simple, friendly, front or side view.
- Build from closed primitives; overlapping shapes are fine (they create more fill areas). Faces: eyes as `dot`, one smile path.
- 6 to 20 fillable areas; nothing enclosed smaller than about 40 px across except solid dots.
- No text, no ground clutter; at most one simple ground line.

**Worked example (lion), to set the pattern:**

```js
import { page, circle, ellipse, path, dot, poly } from '../svg.mjs';

const mane = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return circle(600 + Math.cos(a) * 170, 330 + Math.sin(a) * 170, 70);
}).join('\n');

export const lion = {
  id: 'lion', name: 'Lion', category: 'Animals',
  svg: page([
    ellipse(620, 600, 230, 130),            // body
    mane,                                   // mane puffs (overlap = many areas)
    circle(600, 330, 150),                  // face
    circle(505, 205, 38), circle(695, 205, 38), // ears
    dot(545, 310, 14), dot(655, 310, 14),   // eyes
    poly([[575, 360], [625, 360], [600, 390]]), // nose
    path('M560 410 Q 600 445 640 410'),     // smile
    path('M850 600 Q 960 540 950 450'), circle(952, 430, 28), // tail + tuft
    ellipse(500, 710, 50, 30), ellipse(740, 710, 50, 30),     // paws
  ].join('\n')),
};
```

### Task 4: Animals (17)

**Files:** Create `scripts/templates/pictures/animals.mjs`; modify `pictures/index.mjs`.

Content briefs (id, name):
- New: `lion` Lion (example above), `giraffe` Giraffe (long neck, 5 to 6 big closed spots, ossicones), `zebra` Zebra (side view, 5 thick stripes as closed bands clipped inside the body by drawing them as separate closed shapes), `penguin` Penguin (egg body, belly oval, flippers, feet), `hedgehog` Hedgehog (half-dome with 7 big spike triangles, face oval), `fox` Fox (sitting, big tail with tip, pointed ears), `whale` Whale (big rounded body, water spout of 3 drops, fin, tail), `octopus` Octopus (round head, 6 wavy closed legs), `chick` Chick (round body, head, wing, beak, feet, egg shell below), `ladybug` Ladybug (round shell split in two, 6 spots as circles, head, 6 legs).
- Redraws (same ids): `horse` Horse (side view, mane as 4 lobes, tail, 4 legs, hooves), `cow` Cow (side view, 4 big patches as closed blobs, udder, horns), `frog` Frog (front view sitting, big eyes on top, wide mouth, front and back legs), `elephant` Elephant (side view, big ear, trunk, 4 legs, tail), `snail` Snail (spiral shell as 3 nested closed rings, body, 2 eye stalks), `monkey` Monkey (sitting front view, face mask, ears, curled tail, banana), `dinosaur` Dinosaur (friendly long-neck sauropod, 5 back plates, 4 legs, tail).

- [ ] **Step 1:** Write `animals.mjs` with the 17 entries following the drawing rules; add `...ANIMALS` to `PICTURES`.
- [ ] **Step 2:** Run `npm run templates && npm run templates:check -- --ids=<the 17 ids> --sheet=<scratchpad>/animals.png`. Expected: no "Problems" section.
- [ ] **Step 3:** Read the contact sheet. Each picture must be recognizable at thumbnail size and have closed bold outlines. Redraw any that fail and re-run; ledger each redraw.
- [ ] **Step 4:** `npm test && npm run build`, then commit: `git add scripts/templates public/templates && git commit -m "Add 10 new animals and redraw 7 old ones in bold style"`.

### Task 5: Fairy tales (13)

**Files:** Create `scripts/templates/pictures/fairy.mjs`; modify `pictures/index.mjs`.

All in category `Fairy tales`:
- New: `red-riding-hood` Red Riding Hood (girl with hooded cape, basket), `wolf` Wolf (sitting, friendly, big ears and tail), `three-pigs-house` Three little pigs' house (brick house with big bricks as rectangles, door, window, chimney), `castle` Castle (3 towers with cone roofs, gate, 2 windows, flag), `knight` Knight (helmet with visor, shield with a cross, sword), `mermaid` Mermaid (long hair, fish tail with fin, shell top), `gnome` Gnome (tall pointy hat, big beard, nose, boots), `frog-prince` Frog prince (frog with crown), `gingerbread-house` Gingerbread house (roof with icing waves, candy circles, door), `pumpkin-carriage` Pumpkin carriage (pumpkin body with segments, 2 wheels, door, window).
- Redraws: `dragon` Dragon (friendly, side view, 4 back spikes, wing, curled tail), `witch` Witch (hat, hair, broom, simple dress), `princess` Princess (crown, long dress with 2 tiers, arms, face).

- [ ] **Step 1 to 4:** as Task 4 (ids above; sheet `fairy.png`; commit message "Add fairy-tale pictures and redraw dragon, witch, princess").

Also: move nothing from Fantasy (spec says existing Fantasy items stay).

### Task 6: Vehicles, places and food (14)

**Files:** Create `scripts/templates/pictures/vehicles.mjs` and `pictures/places-food.mjs`; modify `pictures/index.mjs`.

- Vehicles (category `Vehicles`) new: `race-car` Race car, `fire-truck` Fire truck (ladder, 2 windows, 3 wheels), `police-car` Police car (light on top), `bus` Bus (6 windows, door, 2 wheels), `tractor` Tractor (big back wheel, small front wheel, cab, exhaust), `excavator` Excavator (tracks, cab, arm, bucket), `ambulance` Ambulance (cross on the side as a closed plus shape), `monster-truck` Monster truck (huge wheels). Redraws: `car` Car (friendly round car, 2 windows, 2 wheels, lights), `train` Train (engine + 2 wagons, big wheels, chimney with 2 smoke puffs).
- Places and food: `house` House (category `Places`: square body, triangle roof, door, 2 windows, chimney, no tiles, no grass), `apple` Apple (category `Food`: bold apple with leaf and stem), `cherry` Cherries (category `Food`: 2 cherries, stems, 1 leaf), `mushroom` Mushroom (category `Nature`: big cap with 5 round spots, stem, one small mushroom beside).

- [ ] **Step 1 to 4:** as Task 4 (sheets `vehicles.png`, `places-food.png`; commit message "Add vehicle pictures and redraw car, train, house, apple, cherry, mushroom").

### Task 7: Full check, app check and docs

**Files:**
- Modify: `README.md`, `PROJECT.md` (template count, categories, how to regenerate)

- [ ] **Step 1: Full checker run**

Run: `npm run templates && npm run templates:check -- --sheet=<scratchpad>/all.png`
Expected: no "Problems" section (only generated ids are enforced; kept clipart is printed with an `i` marker for information).

- [ ] **Step 2: Manifest integrity**

Run: `node -e "const m=require('./public/templates/manifest.json').templates;const fs=require('fs');const miss=m.filter(t=>t.file&&!fs.existsSync('public/templates/'+t.file));const ids=new Set(m.map(t=>t.id));console.log(m.length,'entries',miss.length,'missing',ids.size===m.length?'unique':'DUPLICATES')"`
Expected: `102 entries 0 missing unique` (41 kept + 60 generated + blank).

- [ ] **Step 3: Offline precache**

Run: `npm run build && grep -q 'templates/maze-bunny.svg' dist/sw.js && grep -q 'templates/lion.svg' dist/sw.js && echo precached`
Expected: `precached`.

- [ ] **Step 4: In-app check**

`npm run dev`, open Pictures: categories include Fairy tales and Games; thumbnails show; load `lion`, `maze-bunny`, `dots-star`, `house`; Fill inside the lion's face colours only the face; the old santa/unicorn/unicorn-castle/princess-couple/princess-fairy are gone.

- [ ] **Step 5: Docs**

README: template count "64 line-art templates across ..." becomes "101 line-art templates across Animals, Fairy tales, Fantasy, Vehicles, Places, Nature, Food, Toys and Games (original bold drawings plus CC0 clipart), lazy-loaded with category filter"; add a "Regenerating templates" section: `npm run templates` then `npm run templates:check -- --sheet=sheet.png`. PROJECT.md: update the Templates section counts and category list, add `scripts/templates/` to the architecture tree, and replace the known issue "Some templates leak fill" with a note that the dot-shaded clipart was removed on 2026-09-29.

- [ ] **Step 6: Checklist and commit**

Append to `docs/device-checklist-part-a.md`:

```markdown

## Part C (pictures)

- [ ] Pictures shows the Fairy tales and Games categories.
- [ ] Fill inside a new animal colours one part at a time (no leaking into the page).
- [ ] A maze can be traced from the start picture to the goal picture with the pen.
- [ ] Connect-the-dots numbers are readable on the tablet.
- [ ] With airplane mode on, a new picture still opens.
```

```bash
git add README.md PROJECT.md docs/device-checklist-part-a.md scripts/templates
git commit -m "Document regenerated template library and checker"
```
