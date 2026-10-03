import { solidPage, circle, ellipse, rect, line, path, poly, dot } from '../svg.mjs';

// Building-brick toys, redrawn: the old hand-authored Lego pages were small,
// thin-lined and full of tiny stud areas.

const draw = (id, name, parts) => ({ id, name, category: 'Toys', svg: solidPage(parts.flat().join('\n')) });

// One stud seen from above at an angle: a short cylinder with an oval top.
const stud = (cx, cy, r, h = r * 0.6) => {
  const ry = r * 0.4;
  return [
    path(`M${cx - r} ${cy} L ${cx - r} ${cy - h} A ${r} ${ry} 0 0 1 ${cx + r} ${cy - h} L ${cx + r} ${cy} A ${r} ${ry} 0 0 1 ${cx - r} ${cy} Z`),
    ellipse(cx, cy - h, r, ry),
  ];
};

// Brick in an oblique view: front face at (x, y, w, h), receding up and to
// the right by `d`. Studs sit on the top face, back row first so the front
// row covers it. The first `hidden` columns get no studs: a brick stacked
// on top covers them.
const brick = (x, y, w, h, cols, rows, d, hidden = 0) => {
  const dx = d * 0.5, dy = -d * 0.4;
  const studs = [];
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = hidden; c < cols; c++) {
      const t = (r + 0.5) / rows;
      studs.push(stud(x + ((c + 0.5) * w) / cols + dx * t, y + dy * t, Math.min(w / cols, d / rows) * 0.3));
    }
  }
  return [
    poly([[x, y], [x + w, y], [x + w + dx, y + dy], [x + dx, y + dy]]),
    poly([[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]]),
    rect(x, y, w, h),
    studs,
  ];
};

// Flat studs for front-view pictures: drawn before the brick under them so
// the brick hides their bottom edge.
const flatStuds = (x, y, w, n, sw = 64) =>
  Array.from({ length: n }, (_, i) => rect(x + ((i + 0.5) * w) / n - sw / 2, y - 30, sw, 40, 8));

const legoBrick = draw('lego-brick', 'Lego brick', [brick(250, 380, 600, 260, 4, 2, 300)]);

const legoStack = draw('lego-stack', 'Lego tower', [
  // Staircase: each brick sits on the left of the one below, so the
  // uncovered right column keeps whole studs.
  brick(300, 570, 540, 160, 3, 1, 200, 2),
  brick(300, 410, 360, 160, 2, 1, 200, 1),
  brick(300, 250, 180, 160, 1, 1, 200),
]);

const courses = [
  [[300, 120], [420, 180], [600, 180], [780, 120]],
  [[300, 180], [480, 180], [660, 240]],
  [[300, 120], [420, 180], [600, 180], [780, 120]],
];
const legoHouse = draw('lego-house', 'Lego house', [
  poly([[260, 380], [600, 185], [940, 380]]),
  courses.map((row, i) => row.map(([x, w]) => rect(x, 380 + i * 120, w, 120))),
  rect(540, 520, 120, 220, 10), dot(635, 630, 10),
  rect(345, 420, 130, 100, 8), line(410, 420, 410, 520),
  rect(725, 420, 130, 100, 8), line(790, 420, 790, 520),
]);

const legoMinifig = draw('lego-minifig', 'Lego minifigure', [
  rect(565, 75, 70, 40, 10),
  // Arms behind the torso, C-shaped hands below them.
  poly([[490, 300], [430, 320], [385, 490], [445, 505]]),
  poly([[710, 300], [770, 320], [815, 490], [755, 505]]),
  circle(410, 545, 45), circle(410, 545, 20),
  circle(790, 545, 45), circle(790, 545, 20),
  rect(510, 105, 180, 165, 45),
  dot(560, 175, 14), dot(640, 175, 14),
  path('M555 215 Q 600 255 645 215'),
  rect(560, 265, 80, 30),
  poly([[490, 290], [710, 290], [770, 540], [430, 540]]),
  path('M600 360 L 625 410 L 680 415 L 640 450 L 652 505 L 600 478 L 548 505 L 560 450 L 520 415 L 575 410 Z'),
  rect(430, 540, 340, 55, 8),
  rect(430, 595, 165, 175, 10),
  rect(605, 595, 165, 175, 10),
  line(430, 720, 595, 720), line(605, 720, 770, 720),
]);

const legoCar = draw('lego-wheel', 'Lego car', [
  flatStuds(250, 440, 200, 2), flatStuds(800, 440, 150, 2),
  flatStuds(470, 250, 300, 3),
  rect(470, 250, 300, 190, 10),
  poly([[770, 280], [830, 440], [770, 440]]),
  rect(505, 290, 110, 90, 10), rect(640, 290, 100, 90, 10),
  rect(250, 440, 700, 140, 12),
  rect(905, 470, 45, 45, 8),
  circle(400, 590, 100), circle(400, 590, 45),
  circle(800, 590, 100), circle(800, 590, 45),
]);

export const TOYS = [legoBrick, legoStack, legoHouse, legoMinifig, legoCar];
