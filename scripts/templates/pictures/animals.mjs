import { page, circle, ellipse, rect, line, path, poly, dot, group } from '../svg.mjs';

// Animals: bold, closed, friendly shapes on a 1200x800 page. Each picture
// is a list of primitives; overlaps are intentional (they make more areas
// to colour).

const eyes = (x1, x2, y, r = 14) => dot(x1, y, r) + dot(x2, y, r);
const smile = (cx, cy, w = 40, d = 30) => path(`M${cx - w} ${cy} Q ${cx} ${cy + d} ${cx + w} ${cy}`);
const tri = (a, b, c) => poly([a, b, c]);
const rot = (deg, cx, cy, ...parts) => group(`rotate(${deg} ${cx} ${cy})`, ...parts);
// Point on an ellipse at angle a (radians, 0 = right, clockwise in SVG).
const onEllipse = (cx, cy, rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
const leg = (x, y, w, h) => rect(x, y, w, h, Math.min(18, w / 2));
// Closed wavy ring: n bumps around a circle (lion mane, clouds, puffs).
const scallop = (cx, cy, r, n, bump) => {
  const pt = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  let d = `M${pt(0, r)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    d += ` Q ${pt((a0 + a1) / 2, r + bump)} ${pt(a1, r)}`;
  }
  return path(d + ' Z');
};
// Closed strip with bumps along one side of the line A->B (manes).
const bumpyStrip = ([ax, ay], [bx, by], n, off) => {
  const nx = -(by - ay), ny = bx - ax, len = Math.hypot(nx, ny);
  const ux = (nx / len) * off, uy = (ny / len) * off;
  let d = `M${ax} ${ay}`;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const mx = ax + (bx - ax) * tm + ux * 2, my = ay + (by - ay) * tm + uy * 2;
    d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${(ax + (bx - ax) * t1).toFixed(1)} ${(ay + (by - ay) * t1).toFixed(1)}`;
  }
  return path(d + ' Z');
};
// Four-legged side view facing left: shared by horse and zebra.
const quadruped = ({ mane, extra = [] }) => [
  leg(470, 500, 44, 225), leg(552, 512, 44, 213), leg(742, 512, 44, 213), leg(824, 500, 44, 225),
  path('M872 400 Q 988 452 962 628 Q 912 560 884 470 Z'),
  ellipse(645, 430, 245, 122),
  path('M500 380 Q 445 285 425 200 L 505 168 L 605 350 Z'),
  // Negative offset puts the bumps on the outside (back) of the neck.
  bumpyStrip([505, 168], [605, 350], mane, -30),
  rot(-40, 380, 212, ellipse(380, 212, 108, 56)),
  tri([425, 170], [440, 100], [470, 162]),
  dot(395, 190, 12), dot(298, 262, 9),
  extra,
];
const draw = (id, name, parts) => ({ id, name, category: 'Animals', svg: page(parts.flat().join('\n')) });

const lion = draw('lion', 'Lion', [
  ellipse(620, 600, 230, 130),
  scallop(600, 330, 215, 14, 55),
  circle(600, 330, 150),
  circle(500, 215, 36), circle(700, 215, 36),
  eyes(545, 655, 310),
  poly([[575, 360], [625, 360], [600, 390]]),
  smile(600, 412, 40, 30),
  path('M850 600 Q 960 540 950 450'), circle(952, 430, 28),
  ellipse(500, 712, 55, 30), ellipse(740, 712, 55, 30),
]);

const giraffe = draw('giraffe', 'Giraffe', [
  leg(400, 560, 44, 200), leg(475, 575, 44, 185), leg(640, 575, 44, 185), leg(715, 560, 44, 200),
  ellipse(570, 520, 230, 110),
  path('M690 470 L765 445 L900 205 L830 185 Z'),
  ellipse(900, 170, 88, 52),
  line(875, 125, 862, 80), line(915, 125, 925, 80), dot(862, 76, 14), dot(925, 76, 14),
  ellipse(835, 132, 28, 13),
  dot(915, 158, 11), dot(972, 180, 6),
  circle(480, 505, 38), circle(575, 470, 30), circle(630, 555, 36), circle(525, 575, 26), circle(690, 495, 28),
  path('M345 500 Q 300 560 312 630'), ellipse(312, 648, 15, 24),
]);

const zebra = draw('zebra', 'Zebra', quadruped({
  mane: 5,
  // Kept inside the body so they don't cut slivers against the legs.
  extra: [600, 690, 780].map((x) => path(`M${x} 352 Q ${x + 30} 425 ${x} 498 L ${x + 42} 498 Q ${x + 72} 425 ${x + 42} 352 Z`)),
}));

const penguin = draw('penguin', 'Penguin', [
  ellipse(540, 730, 65, 24), ellipse(660, 730, 65, 24),
  path('M420 360 Q 320 480 385 600 Q 430 480 445 380 Z'),
  path('M780 360 Q 880 480 815 600 Q 770 480 755 380 Z'),
  ellipse(600, 430, 190, 290),
  ellipse(600, 480, 125, 215),
  eyes(555, 645, 250),
  poly([[570, 290], [630, 290], [600, 335]]),
]);

// Spiky back as one closed zigzag outline along an arc.
const hedgehogBack = (() => {
  const pts = [[300, 610]];
  const n = 9;
  for (let i = 0; i <= n * 2; i++) {
    const a = Math.PI * (1.0 + (i / (n * 2)) * 0.72);
    const r = i % 2 ? 1.22 : 1;
    pts.push([600 + Math.cos(a) * 300 * r, 610 + Math.sin(a) * 320 * r]);
  }
  pts.push([880, 610]);
  return poly(pts);
})();
const hedgehog = draw('hedgehog', 'Hedgehog', [
  hedgehogBack,
  ellipse(430, 628, 45, 22), ellipse(760, 628, 45, 22),
  ellipse(905, 555, 125, 80),
  dot(935, 525, 12), dot(1025, 560, 18),
  smile(960, 585, 25, 18),
]);

const fox = draw('fox', 'Fox', [
  path('M740 650 Q 990 630 955 420 Q 905 330 860 425 Q 880 560 740 600 Z'),
  path('M860 425 Q 905 330 955 420 Q 905 450 860 425 Z'),
  ellipse(600, 545, 165, 190),
  path('M525 445 Q 600 590 675 445 Z'),
  tri([465, 255], [500, 115], [565, 215]), tri([735, 255], [700, 115], [635, 215]),
  ellipse(600, 300, 155, 112),
  poly([[535, 320], [665, 320], [600, 405]]),
  dot(600, 398, 15),
  eyes(545, 655, 282),
  ellipse(535, 728, 55, 26), ellipse(665, 728, 55, 26),
]);

const whale = draw('whale', 'Whale', [
  path('M235 430 L115 320 Q 165 420 110 525 L235 475 Z'),
  path('M210 450 Q 250 255 600 262 Q 910 272 960 452 Q 910 605 600 612 Q 300 612 210 450 Z'),
  path('M300 522 Q 600 652 905 502 Q 600 565 300 522 Z'),
  path('M560 545 Q 610 630 680 565 Z'),
  dot(820, 400, 15),
  smile(895, 462, 38, 16),
  [[520, 130], [600, 85], [680, 130]].map(([x, y]) => path(`M${x} ${y} Q ${x + 34} ${y + 58} ${x} ${y + 88} Q ${x - 34} ${y + 58} ${x} ${y} Z`)),
]);

const octopusLegs = Array.from({ length: 6 }, (_, i) => {
  const x0 = 380 + i * 88;
  const left = [], right = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const cx = x0 + Math.sin(t * Math.PI * 1.6 + i) * 30 + (i - 2.5) * t * 45;
    const cy = 390 + t * 330;
    const w = 30 * (1 - t * 0.55);
    left.push([cx - w, cy]);
    right.push([cx + w, cy]);
  }
  return poly([...left, ...right.reverse()]);
});
const octopus = draw('octopus', 'Octopus', [
  octopusLegs,
  ellipse(600, 300, 205, 175),
  eyes(530, 670, 290, 18),
  smile(600, 355, 45, 28),
]);

const chick = draw('chick', 'Chick', [
  circle(600, 500, 200),
  path('M430 480 Q 375 565 470 605 Q 448 540 470 480 Z'),
  circle(600, 295, 130),
  path('M572 172 Q 592 105 612 172 Z'),
  eyes(560, 640, 280),
  poly([[572, 315], [628, 315], [600, 358]]),
  path('M380 725 L420 640 L470 692 L520 632 L570 692 L620 632 L670 692 L720 632 L770 692 L820 640 L855 725 Z'),
]);

const ladybug = draw('ladybug', 'Ladybug', [
  [-1, 1].flatMap((s) => [
    line(600 + s * 230, 360, 600 + s * 320, 320),
    line(600 + s * 250, 470, 600 + s * 345, 470),
    line(600 + s * 225, 580, 600 + s * 315, 630),
  ]),
  path('M560 140 Q 530 80 495 70'), dot(495, 70, 15),
  path('M640 140 Q 670 80 705 70'), dot(705, 70, 15),
  ellipse(600, 195, 125, 72),
  circle(600, 450, 250),
  line(600, 200, 600, 700),
  [[480, 360], [720, 360], [460, 510], [740, 510], [530, 615], [670, 615]].map(([x, y]) => circle(x, y, 36)),
  eyes(560, 640, 185, 11),
]);

// Redraws of rejected clipart subjects.

const horse = draw('horse', 'Horse', quadruped({ mane: 4 }));

const cow = draw('cow', 'Cow', [
  leg(430, 520, 50, 210), leg(505, 530, 50, 200), leg(710, 530, 50, 200), leg(785, 520, 50, 210),
  path('M840 380 Q 900 440 885 540'), ellipse(885, 560, 16, 26),
  rect(380, 330, 470, 235, 95),
  ellipse(525, 410, 62, 46), ellipse(685, 385, 56, 40), ellipse(750, 480, 45, 35), ellipse(600, 500, 42, 30),
  ellipse(640, 585, 44, 26),
  path('M245 245 Q 215 185 250 160 Q 245 205 275 235 Z'),
  path('M375 245 Q 405 185 370 160 Q 375 205 345 235 Z'),
  ellipse(200, 310, 40, 17), ellipse(420, 310, 40, 17),
  ellipse(310, 325, 95, 112),
  ellipse(310, 402, 78, 46),
  dot(282, 402, 9), dot(338, 402, 9),
  eyes(275, 345, 300, 12),
]);

const frog = draw('frog', 'Frog', [
  ellipse(360, 610, 115, 72), ellipse(840, 610, 115, 72),
  ellipse(600, 505, 262, 182),
  ellipse(600, 545, 152, 110),
  ellipse(470, 640, 48, 88), ellipse(730, 640, 48, 88),
  ellipse(600, 330, 212, 122),
  circle(480, 232, 72), circle(720, 232, 72),
  dot(480, 232, 24), dot(720, 232, 24),
  path('M470 362 Q 600 442 730 362'),
]);

const elephant = draw('elephant', 'Elephant', [
  leg(450, 560, 72, 180), leg(560, 570, 72, 170), leg(740, 570, 72, 170), leg(840, 560, 72, 180),
  path('M912 420 Q 962 470 952 525'), dot(952, 535, 14),
  ellipse(662, 440, 262, 172),
  circle(390, 372, 152),
  path('M270 402 Q 218 522 250 652 Q 267 692 302 662 Q 290 562 332 462 Z'),
  path('M432 258 Q 568 238 575 382 Q 565 505 440 472 Z'),
  path('M330 472 Q 298 522 330 545 Q 346 512 352 478 Z'),
  dot(350, 342, 14),
]);

const snail = draw('snail', 'Snail', [
  path('M260 690 L 880 690 Q 1000 690 992 600 Q 982 522 902 540 L 862 612 L 300 640 Z'),
  line(935, 542, 902, 420), line(965, 548, 1005, 430), dot(902, 416, 17), dot(1005, 426, 17),
  smile(950, 610, 22, 14),
  circle(560, 420, 212),
  circle(578, 432, 142),
  circle(594, 444, 74),
]);

const monkey = draw('monkey', 'Monkey', [
  path('M760 640 Q 905 662 902 540 Q 900 460 832 470 Q 782 480 802 532'),
  ellipse(600, 562, 172, 172),
  ellipse(600, 590, 100, 110),
  ellipse(500, 735, 62, 28), ellipse(700, 735, 62, 28),
  rot(25, 450, 540, ellipse(450, 540, 40, 100)),
  rot(-25, 750, 540, ellipse(750, 540, 40, 100)),
  path('M700 505 Q 800 465 842 385 Q 832 475 712 535 Z'),
  circle(430, 300, 56), circle(770, 300, 56),
  circle(600, 300, 152),
  ellipse(600, 345, 115, 95),
  eyes(555, 645, 312),
  dot(585, 362, 7), dot(615, 362, 7),
  smile(600, 392, 38, 22),
]);

const plates = [430, 490, 550, 610, 670].map((x) => {
  const top = (px) => 500 - 150 * Math.sqrt(Math.max(0, 1 - ((px - 540) / 250) ** 2));
  return tri([x - 28, top(x - 28) + 6], [x, top(x) - 62], [x + 28, top(x + 28) + 6]);
});
const dinosaur = draw('dinosaur', 'Dinosaur', [
  leg(380, 580, 72, 165), leg(460, 592, 72, 153), leg(600, 592, 72, 153), leg(690, 580, 72, 165),
  plates,
  path('M300 480 Q 150 520 90 622 Q 202 592 322 562 Z'),
  ellipse(540, 500, 252, 152),
  path('M700 430 Q 802 250 862 170 L 932 190 Q 862 300 782 480 Z'),
  ellipse(932, 165, 82, 52),
  dot(952, 150, 12),
  smile(965, 180, 26, 14),
]);

export const ANIMALS = [lion, giraffe, zebra, penguin, hedgehog, fox, whale, octopus, chick, ladybug, horse, cow, frog, elephant, snail, monkey, dinosaur];
