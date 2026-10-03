import { solidPage, circle, ellipse, rect, line, path, poly, dot, group } from '../svg.mjs';

// Baby things: bottle, rattle, teddy and friends. Same bold closed shapes
// as the animals, few small parts so a toddler can fill every area.

const draw = (id, name, parts) => ({ id, name, category: 'Baby', svg: solidPage(parts.flat().join('\n')) });
const eyes = (x1, x2, y, r = 14) => dot(x1, y, r) + dot(x2, y, r);
const smile = (cx, cy, w = 40, d = 30) => path(`M${cx - w} ${cy} Q ${cx} ${cy + d} ${cx + w} ${cy}`);
const rot = (deg, cx, cy, ...parts) => group(`rotate(${deg} ${cx} ${cy})`, ...parts);
const heart = (cx, cy, s) =>
  path(`M${cx} ${cy + s * 0.9} C ${cx - s * 1.5} ${cy}, ${cx - s * 0.7} ${cy - s * 1.1}, ${cx} ${cy - s * 0.35} C ${cx + s * 0.7} ${cy - s * 1.1}, ${cx + s * 1.5} ${cy}, ${cx} ${cy + s * 0.9} Z`);
const star = (cx, cy, r) =>
  poly(Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  }));
// Closed wavy ring: n bumps around a circle (bonnet frill).
const scallop = (cx, cy, r, n, bump) => {
  const pt = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  let d = `M${pt(0, r)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    d += ` Q ${pt((a0 + a1) / 2, r + bump)} ${pt(a1, r)}`;
  }
  return path(d + ' Z');
};

const bottle = draw('baby-bottle', 'Baby bottle', [
  path('M545 215 Q 545 160 578 140 Q 600 70 622 140 Q 655 160 655 215 Z'),
  rect(470, 205, 260, 85, 28),
  rect(495, 285, 210, 445, 70),
  [380, 450, 520, 590].map((y) => line(515, y, 565, y)),
  heart(625, 520, 50),
]);

const rattle = draw('rattle', 'Rattle', [
  circle(600, 685, 70),
  circle(600, 685, 32),
  rect(570, 420, 60, 210, 28),
  circle(600, 425, 40),
  circle(600, 260, 165),
  path('M445 215 Q 600 290 755 215'),
  path('M445 305 Q 600 380 755 305'),
  star(600, 165, 45),
]);

const pacifier = draw('pacifier', 'Pacifier', [
  circle(600, 610, 125),
  circle(600, 610, 80),
  ellipse(600, 245, 72, 115),
  path('M600 360 Q 470 270 370 340 Q 300 420 370 500 Q 470 560 600 470 Q 730 560 830 500 Q 900 420 830 340 Q 730 270 600 360 Z'),
  circle(600, 415, 62),
  heart(600, 418, 28),
]);

const teddy = draw('teddy-bear', 'Teddy bear', [
  circle(475, 165, 62), circle(725, 165, 62),
  circle(475, 165, 30), circle(725, 165, 30),
  rot(35, 405, 470, ellipse(405, 470, 55, 115)),
  rot(-35, 795, 470, ellipse(795, 470, 55, 115)),
  ellipse(600, 525, 185, 195),
  ellipse(600, 545, 110, 125),
  ellipse(470, 700, 85, 60), ellipse(730, 700, 85, 60),
  ellipse(470, 710, 45, 30), ellipse(730, 710, 45, 30),
  circle(600, 270, 150),
  ellipse(600, 320, 72, 55),
  eyes(545, 655, 245),
  ellipse(600, 302, 24, 16),
  smile(600, 335, 26, 18),
]);

const duck = draw('rubber-duck', 'Rubber duck', [
  path('M260 470 Q 230 690 600 700 Q 900 690 920 520 Q 930 420 820 450 Q 700 480 620 430 Q 420 380 330 420 Z'),
  path('M480 520 Q 600 450 740 520 Q 680 620 520 600 Z'),
  circle(410, 300, 135),
  path('M285 300 Q 180 300 165 340 Q 210 375 300 352 Z'),
  dot(420, 270, 16),
  path('M140 760 Q 220 720 300 760 Q 380 800 460 760 Q 540 720 620 760 Q 700 800 780 760 Q 860 720 940 760 Q 1000 790 1050 760'),
]);

const onesie = draw('onesie', 'Baby bodysuit', [
  path('M520 160 Q 600 250 680 160 L 770 180 L 900 270 L 845 380 L 770 340 L 770 560 Q 750 650 660 680 L 645 730 L 555 730 L 540 680 Q 450 650 430 560 L 430 340 L 355 380 L 300 270 L 430 180 Z'),
  path('M555 690 Q 600 700 645 690'),
  heart(600, 430, 70),
  dot(570, 712, 9), dot(630, 712, 9),
]);

const pram = draw('pram', 'Pram', [
  circle(420, 670, 90), circle(420, 670, 35),
  circle(740, 670, 90), circle(740, 670, 35),
  line(830, 400, 960, 250),
  rect(925, 215, 110, 46, 20),
  path('M290 390 L 840 390 Q 840 610 565 610 Q 290 610 290 390 Z'),
  path('M290 390 Q 290 165 570 150 L 570 390 Z'),
  path('M350 390 Q 360 230 570 200'),
  path('M440 390 Q 450 280 570 260'),
  heart(700, 490, 45),
]);

const rings = [190, 165, 140, 115, 92];
const stacker = draw('ring-stacker', 'Stacking rings', [
  rect(570, 190, 60, 480, 25),
  rect(370, 665, 460, 70, 28),
  rings.map((rx, i) => ellipse(600, 615 - i * 88, rx, 52)),
  circle(600, 175, 62),
]);

// Cube in an oblique view: front square, top and side faces.
const cube = (x, y, s, front, top, side) => {
  const dx = s * 0.45, dy = -s * 0.35;
  return [
    poly([[x, y], [x + s, y], [x + s + dx, y + dy], [x + dx, y + dy]]),
    poly([[x + s, y], [x + s + dx, y + dy], [x + s + dx, y + s + dy], [x + s, y + s]]),
    rect(x, y, s, s, 10),
    front(x + s / 2, y + s / 2, s),
    top ?? [],
    side ?? [],
  ];
};
const blocks = draw('baby-blocks', 'Toy blocks', [
  cube(280, 470, 250, (cx, cy, s) => heart(cx, cy, s * 0.28)),
  cube(560, 470, 250, (cx, cy, s) => star(cx, cy, s * 0.34)),
  cube(430, 200, 250, (cx, cy, s) => circle(cx, cy, s * 0.26)),
]);

const baby = draw('baby-face', 'Baby', [
  poly([[520, 640], [440, 720], [470, 760], [600, 680]]),
  poly([[680, 640], [760, 720], [730, 760], [600, 680]]),
  scallop(600, 400, 255, 18, 34),
  circle(600, 430, 195),
  circle(600, 680, 30),
  path('M600 245 Q 650 225 640 270 Q 630 295 605 280'),
  path('M500 410 Q 530 440 560 410'),
  path('M640 410 Q 670 440 700 410'),
  circle(480, 490, 34), circle(720, 490, 34),
  smile(600, 520, 30, 22),
]);

export const BABY = [bottle, rattle, pacifier, teddy, duck, onesie, pram, stacker, blocks, baby];
