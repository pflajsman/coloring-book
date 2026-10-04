import { page, circle, dot, dashed } from './svg.mjs';

// Handwriting practice: dashed letters, numbers and strokes to trace with a
// finger or the pen, on school-style guide lines (thin top and base lines,
// dashed midline). Each letter is a single-line skeleton, not a font
// outline, so tracing it once draws the letter. A small ring marks where to
// start.

const r1 = (v) => Math.round(v * 10) / 10;

// Arc on an ellipse as points, from angle a0 to a1 in degrees (0 = right,
// 90 = down, as in SVG). a1 < a0 runs anticlockwise on screen.
const arc = (cx, cy, rx, ry, a0, a1) => {
  const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
};

// Glyphs on a 100-unit grid: capitals and digits from y 0 (top) to 100
// (base line); small letters have the x-height at 50 and descenders to 140.
// Each glyph is { w, strokes: [[x, y], ...][], dots? }, strokes in writing
// order.
const G = (w, strokes, dots = []) => ({ w, strokes, dots });

export const UPPER = {
  A: G(70, [[[35, 0], [0, 100]], [[35, 0], [70, 100]], [[13, 62], [57, 62]]]),
  B: G(65, [[[0, 0], [0, 100]], [[0, 0], [35, 0], ...arc(35, 25, 25, 25, -90, 90), [0, 50]], [[0, 50], [40, 50], ...arc(40, 75, 25, 25, -90, 90), [0, 100]]]),
  C: G(80, [arc(42, 50, 42, 50, -45, -315)]),
  D: G(70, [[[0, 0], [0, 100]], [[0, 0], [25, 0], ...arc(25, 50, 45, 50, -90, 90), [0, 100]]]),
  E: G(55, [[[0, 0], [0, 100]], [[0, 0], [55, 0]], [[0, 50], [45, 50]], [[0, 100], [55, 100]]]),
  F: G(55, [[[0, 0], [0, 100]], [[0, 0], [55, 0]], [[0, 50], [45, 50]]]),
  G: G(82, [[...arc(42, 50, 42, 50, -45, -315), [72, 55], [48, 55]]]),
  H: G(65, [[[0, 0], [0, 100]], [[65, 0], [65, 100]], [[0, 50], [65, 50]]]),
  I: G(40, [[[20, 0], [20, 100]], [[0, 0], [40, 0]], [[0, 100], [40, 100]]]),
  J: G(55, [[[55, 0], [55, 70], ...arc(30, 70, 25, 30, 0, 180)]]),
  K: G(62, [[[0, 0], [0, 100]], [[60, 0], [0, 60]], [[20, 42], [62, 100]]]),
  L: G(50, [[[0, 0], [0, 100], [50, 100]]]),
  M: G(80, [[[0, 100], [0, 0], [40, 60], [80, 0], [80, 100]]]),
  N: G(65, [[[0, 100], [0, 0], [65, 100], [65, 0]]]),
  O: G(90, [arc(45, 50, 45, 50, -90, -450)]),
  P: G(60, [[[0, 0], [0, 100]], [[0, 0], [35, 0], ...arc(35, 25, 25, 25, -90, 90), [0, 50]]]),
  Q: G(95, [arc(45, 50, 45, 50, -90, -450), [[55, 72], [95, 105]]]),
  R: G(65, [[[0, 0], [0, 100]], [[0, 0], [35, 0], ...arc(35, 25, 25, 25, -90, 90), [0, 50]], [[30, 50], [65, 100]]]),
  S: G(68, [[...arc(34, 25, 32, 25, -25, -270), ...arc(34, 75, 34, 25, -90, 155).slice(1)]]),
  T: G(70, [[[0, 0], [70, 0]], [[35, 0], [35, 100]]]),
  U: G(66, [[[0, 0], [0, 65], ...arc(33, 65, 33, 35, 180, 0), [66, 0]]]),
  V: G(70, [[[0, 0], [35, 100], [70, 0]]]),
  W: G(92, [[[0, 0], [23, 100], [46, 30], [69, 100], [92, 0]]]),
  X: G(65, [[[0, 0], [65, 100]], [[65, 0], [0, 100]]]),
  Y: G(70, [[[0, 0], [35, 50]], [[70, 0], [35, 50], [35, 100]]]),
  Z: G(65, [[[0, 0], [65, 0], [0, 100], [65, 100]]]),
};

export const LOWER = {
  a: G(50, [arc(25, 75, 25, 25, -20, -380), [[50, 50], [50, 100]]]),
  b: G(50, [[[0, 0], [0, 100]], arc(25, 75, 25, 25, 180, 540)]),
  c: G(50, [arc(26, 75, 26, 25, -40, -320)]),
  d: G(50, [arc(25, 75, 25, 25, -20, -380), [[50, 0], [50, 100]]]),
  e: G(52, [[[2, 75], [52, 75], ...arc(27, 75, 25, 25, 0, -320).slice(1)]]),
  f: G(42, [[...arc(40, 20, 20, 20, -30, -180), [20, 100]], [[2, 50], [40, 50]]]),
  g: G(50, [arc(25, 75, 25, 25, -20, -380), [[50, 50], [50, 120], ...arc(27, 120, 23, 20, 0, 160).slice(1)]]),
  h: G(46, [[[0, 0], [0, 100]], [[0, 75], ...arc(23, 72, 23, 22, 180, 360), [46, 100]]]),
  i: G(20, [[[10, 50], [10, 100]]], [[10, 25]]),
  j: G(35, [[[30, 50], [30, 120], ...arc(12, 120, 18, 20, 0, 160).slice(1)]], [[30, 25]]),
  k: G(44, [[[0, 0], [0, 100]], [[42, 50], [0, 80]], [[14, 70], [44, 100]]]),
  l: G(20, [[[10, 0], [10, 100]]]),
  m: G(72, [[[0, 50], [0, 100]], [[0, 72], ...arc(18, 70, 18, 20, 180, 360), [36, 100]], [[36, 72], ...arc(54, 70, 18, 20, 180, 360), [72, 100]]]),
  n: G(46, [[[0, 50], [0, 100]], [[0, 75], ...arc(23, 72, 23, 22, 180, 360), [46, 100]]]),
  o: G(50, [arc(25, 75, 25, 25, -90, -450)]),
  p: G(50, [[[0, 50], [0, 140]], arc(25, 75, 25, 25, 180, 540)]),
  q: G(50, [arc(25, 75, 25, 25, -20, -380), [[50, 50], [50, 140]]]),
  r: G(40, [[[0, 50], [0, 100]], [[0, 75], ...arc(22, 72, 22, 20, 180, 310)]]),
  s: G(46, [[...arc(23, 62.5, 22, 12.5, -25, -270), ...arc(23, 87.5, 23, 12.5, -90, 155).slice(1)]]),
  t: G(38, [[[18, 15], [18, 100]], [[0, 50], [38, 50]]]),
  u: G(46, [[[0, 50], [0, 78], ...arc(23, 78, 23, 22, 180, 0)], [[46, 50], [46, 100]]]),
  v: G(50, [[[0, 50], [25, 100], [50, 50]]]),
  w: G(70, [[[0, 50], [17, 100], [35, 62], [53, 100], [70, 50]]]),
  x: G(46, [[[0, 50], [46, 100]], [[46, 50], [0, 100]]]),
  y: G(50, [[[0, 50], [25, 100]], [[50, 50], [8, 140]]]),
  z: G(46, [[[0, 50], [46, 50], [0, 100], [46, 100]]]),
};

export const DIGITS = {
  0: G(70, [arc(35, 50, 35, 50, -90, -450)]),
  1: G(40, [[[5, 22], [35, 0], [35, 100]]]),
  2: G(65, [[...arc(32, 30, 30, 30, -160, 30), [0, 100], [65, 100]]]),
  3: G(64, [[...arc(30, 27, 30, 27, -160, 90), ...arc(30, 77, 33, 23, -90, 160).slice(1)]]),
  4: G(68, [[[48, 100], [48, 0], [0, 70], [68, 70]]]),
  5: G(64, [[[60, 0], [10, 0], [8, 44], ...arc(32, 68, 32, 32, -125, 140)]]),
  6: G(68, [[...arc(40, 60, 38, 58, -60, -180), ...arc(35, 68, 33, 32, 180, -180).slice(1)]]),
  7: G(65, [[[0, 0], [65, 0], [22, 100]]]),
  8: G(64, [arc(32, 25, 25, 25, -30, -390), arc(32, 73, 30, 27, -90, 270)]),
  9: G(64, [[...arc(32, 30, 30, 30, 0, -360), [62, 100]]]),
};

const thin = (x1, y1, x2, y2, extra = '') =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke-width="3"${extra}/>`;

// Guide lines for one row: top line, dashed midline, base line.
function guides(top, base, mid, x0 = 90, x1 = 1110) {
  return [thin(x0, top, x1, top), thin(x0, mid, x1, mid, ' stroke-dasharray="14 14"'), thin(x0, base, x1, base)].join('\n');
}

// One glyph scaled so 100 units = `h` px, its left edge at x and its top
// line at y. Dashes scale with the size so small and big letters read alike.
function glyphSvg(g, x, y, h) {
  const s = h / 100;
  const P = ([px, py]) => [x + px * s, y + py * s];
  const dash = Math.max(12, h * 0.11);
  const out = g.strokes.map((st) => dashed(`M${st.map((p) => P(p).map(r1).join(' ')).join(' L')}`, r1(dash), r1(dash * 0.8)));
  const [sx, sy] = P(g.strokes[0][0]);
  out.push(circle(sx, sy, 13).replace('/>', ' stroke-width="5"/>'));
  for (const d of g.dots) out.push(dot(...P(d), 10));
  return out.join('\n');
}

// Rows of glyphs, each row centred in its own set of guide lines.
// `top` = the row's top line; small letters reserve room for descenders.
function sheet(rows, set, h, tops) {
  const parts = [];
  rows.forEach((chars, i) => {
    const top = tops[i];
    const base = top + h;
    // Midline: x-height for small letters, the middle bar for capitals.
    parts.push(guides(top, base, top + h / 2));
    const glyphs = [...chars].map((c) => set[c]);
    const cell = 1020 / glyphs.length;
    glyphs.forEach((g, k) => {
      const cx = 90 + cell * (k + 0.5);
      parts.push(glyphSvg(g, cx - (g.w * h) / 200, top, h));
    });
  });
  return page(parts.join('\n'));
}

const upper = (rows) => sheet(rows, UPPER, 150, [70, 320, 570]);
const lower = (rows) => sheet(rows, LOWER, 150, [40, 290, 540]);

// Blank guide lines to write on (a grown-up writes a word, the child copies).
const lines = () => page([100, 280, 460, 640].map((top) => guides(top, top + 120, top + 60, 120, 1080)).join('\n'));

// Pre-writing strokes. Rows of shapes children learn before letters.
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

// Straight lines: down, across, and both diagonals, each row with start rings.
const straight = () => {
  const parts = [];
  const row = (y, n, seg) => {
    for (let i = 0; i < n; i++) {
      const x = 170 + (i * 860) / (n - 1);
      const [a, b] = seg(x, y);
      parts.push(dashed(`M${r1(a[0])} ${r1(a[1])} L${r1(b[0])} ${r1(b[1])}`, 16, 13));
      parts.push(circle(a[0], a[1], 11).replace('/>', ' stroke-width="5"/>'));
    }
  };
  row(110, 8, (x, y) => [[x, y], [x, y + 110]]);
  row(330, 4, (x, y) => [[x - 80, y], [x + 80, y]]);
  row(430, 8, (x, y) => [[x + 40, y], [x - 40, y + 110]]);
  row(620, 8, (x, y) => [[x - 40, y], [x + 40, y + 110]]);
  return page(parts.join('\n'));
};

// Square "castle wall" and pointed "mountain" lines, alternating rows.
const ring = (x, y) => circle(x, y, 12).replace('/>', ' stroke-width="5"/>');
const castle = () => {
  const wall = (y) => {
    let d = `M140 ${y + 80}`;
    for (let i = 0; i < 6; i++) {
      const x = 140 + i * 160;
      d += ` L${x} ${y} L${x + 80} ${y} L${x + 80} ${y + 80} L${x + 160} ${y + 80}`;
    }
    return dashed(d) + ring(140, y + 80);
  };
  const peaks = (y) => dashed(`M140 ${y} ${Array.from({ length: 6 }, (_, i) => `L${220 + i * 160} ${y - 90} L${300 + i * 160} ${y}`).join(' ')}`) + ring(140, y);
  return page([wall(110), peaks(400), wall(480), peaks(760)].join('\n'));
};

// Arches (like m and n) and cups (like u), the curves inside letters.
const humps = () => {
  const arches = (b) => dashed(`M140 ${b} ${Array.from({ length: 7 }, (_, i) => `Q ${210 + i * 140} ${b - 200} ${280 + i * 140} ${b}`).join(' ')}`) + ring(140, b);
  const cups = (t) => dashed(`M140 ${t} ${Array.from({ length: 7 }, (_, i) => `Q ${210 + i * 140} ${t + 200} ${280 + i * 140} ${t}`).join(' ')}`) + ring(140, t);
  return page([arches(210), cups(290), arches(570), cups(650)].join('\n'));
};

// Three spirals, drawn from the middle outward.
const spirals = () => page([250, 600, 950].map((cx) => {
  const pts = [];
  for (let a = 0; a <= 360 * 3; a += 10) {
    const t = (a * Math.PI) / 180;
    const r = 6 + a * 0.13;
    pts.push([cx + Math.cos(t) * r, 400 + Math.sin(t) * r]);
  }
  return dashed(`M${pts.map((p) => p.map(r1).join(' ')).join(' L')}`, 16, 13) + circle(pts[0][0], pts[0][1], 11).replace('/>', ' stroke-width="5"/>');
}).join('\n'));

const w = (id, name, svg) => ({ id, name, category: 'Writing', svg });

export const WRITING = [
  w('trace-lines', 'Trace: lines', straight()),
  w('trace-zigzag', 'Trace: zigzag', zigzag()),
  w('trace-mountains', 'Trace: castle and mountains', castle()),
  w('trace-waves', 'Trace: waves', waves()),
  w('trace-humps', 'Trace: arches and cups', humps()),
  w('trace-loops', 'Trace: loops', loops()),
  w('trace-spirals', 'Trace: spirals', spirals()),
  w('trace-shapes', 'Trace: shapes', shapes()),
  w('write-numbers', 'Numbers 0-9', sheet(['01234', '56789'], DIGITS, 200, [110, 470])),
  w('write-upper-a-i', 'Letters A-I', upper(['ABC', 'DEF', 'GHI'])),
  w('write-upper-j-r', 'Letters J-R', upper(['JKL', 'MNO', 'PQR'])),
  w('write-upper-s-z', 'Letters S-Z', upper(['STU', 'VWX', 'YZ'])),
  w('write-lower-a-i', 'Letters a-i', lower(['abc', 'def', 'ghi'])),
  w('write-lower-j-r', 'Letters j-r', lower(['jkl', 'mno', 'pqr'])),
  w('write-lower-s-z', 'Letters s-z', lower(['stu', 'vwx', 'yz'])),
  w('write-lines', 'Writing lines', lines()),
];
