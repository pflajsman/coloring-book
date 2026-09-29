import { page, circle, ellipse, rect, line, path, poly, dot, group } from '../svg.mjs';

// Fairy-tale pictures: classic public-domain characters and places in the
// same bold closed style as the animals.

const eyes = (x1, x2, y, r = 13) => dot(x1, y, r) + dot(x2, y, r);
const smile = (cx, cy, w = 34, d = 24) => path(`M${cx - w} ${cy} Q ${cx} ${cy + d} ${cx + w} ${cy}`);
const tri = (a, b, c) => poly([a, b, c]);
const rot = (deg, cx, cy, ...parts) => group(`rotate(${deg} ${cx} ${cy})`, ...parts);
const leg = (x, y, w, h) => rect(x, y, w, h, Math.min(18, w / 2));
const scallop = (cx, cy, r, n, bump) => {
  const pt = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  let d = `M${pt(0, r)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    d += ` Q ${pt((a0 + a1) / 2, r + bump)} ${pt(a1, r)}`;
  }
  return path(d + ' Z');
};
const crown = (cx, base, w, h) => poly([
  [cx - w / 2, base], [cx - w / 2, base - h], [cx - w / 4, base - h * 0.55], [cx, base - h * 1.15],
  [cx + w / 4, base - h * 0.55], [cx + w / 2, base - h], [cx + w / 2, base],
]);
const draw = (id, name, parts) => ({ id, name, category: 'Fairy tales', svg: page(parts.flat().join('\n')) });

const redRidingHood = draw('red-riding-hood', 'Red Riding Hood', [
  leg(548, 640, 40, 110), leg(612, 640, 40, 110),
  ellipse(560, 752, 45, 20), ellipse(640, 752, 45, 20),
  path('M470 300 L 380 660 Q 600 710 820 660 L 730 300 Z'),
  path('M470 300 Q 480 130 600 118 Q 720 130 730 300 Q 700 382 600 392 Q 500 382 470 300 Z'),
  circle(600, 268, 88),
  eyes(568, 632, 255),
  smile(600, 298, 30, 20),
  rect(690, 520, 140, 85, 14),
  path('M700 520 Q 760 440 820 520'),
]);

const wolf = draw('wolf', 'Wolf', [
  path('M740 650 Q 960 640 940 460 Q 900 390 862 460 Q 880 580 740 610 Z'),
  ellipse(600, 560, 160, 180),
  poly([[520, 420], [560, 500], [600, 440], [640, 500], [680, 420]]),
  tri([485, 245], [500, 110], [575, 205]), tri([715, 245], [700, 110], [625, 205]),
  circle(600, 300, 132),
  ellipse(600, 355, 72, 52),
  dot(600, 330, 17),
  eyes(550, 650, 268),
  smile(600, 378, 26, 16),
  ellipse(535, 732, 55, 25), ellipse(665, 732, 55, 25),
]);

const threePigsHouse = draw('three-pigs-house', "Three little pigs' house", [
  rect(720, 160, 64, 130),
  tri([285, 345], [600, 108], [915, 345]),
  rect(330, 340, 540, 385),
  rect(540, 540, 120, 185, 20),
  dot(640, 640, 10),
  rect(385, 420, 115, 95), line(442, 420, 442, 515), line(385, 467, 500, 467),
  rect(700, 420, 115, 95), line(757, 420, 757, 515), line(700, 467, 815, 467),
  rect(360, 575, 85, 42, 4), rect(410, 650, 85, 42, 4), rect(735, 575, 85, 42, 4), rect(700, 650, 85, 42, 4),
]);

const castle = draw('castle', 'Castle', [
  tri([285, 255], [365, 105], [445, 255]), tri([755, 255], [835, 105], [915, 255]),
  line(835, 105, 835, 45), tri([835, 45], [895, 62], [835, 80]),
  rect(300, 250, 130, 460), rect(770, 250, 130, 460),
  poly([[430, 710], [430, 300], [470, 300], [470, 262], [520, 262], [520, 300], [575, 300], [575, 262], [625, 262], [625, 300], [680, 300], [680, 262], [730, 262], [730, 300], [770, 300], [770, 710]]),
  path('M535 710 L 535 560 Q 600 480 665 560 L 665 710 Z'),
  rect(340, 330, 50, 80, 25), rect(810, 330, 50, 80, 25),
  rect(505, 370, 60, 80, 30), rect(635, 370, 60, 80, 30),
]);

const knight = draw('knight', 'Knight', [
  leg(505, 585, 80, 135), leg(615, 585, 80, 135),
  ellipse(535, 735, 58, 24), ellipse(665, 735, 58, 24),
  rect(362, 250, 30, 300, 10), rect(322, 540, 110, 24, 10), rect(364, 564, 26, 62, 10),
  rect(470, 330, 260, 270, 34),
  path('M565 150 Q 600 60 640 150 Z'),
  path('M470 335 Q 470 150 600 150 Q 730 150 730 335 Z'),
  rect(512, 228, 176, 44, 18),
  path('M760 380 L 910 380 L 910 505 Q 910 605 835 648 Q 760 605 760 505 Z'),
  poly([[815, 410], [855, 410], [855, 470], [890, 470], [890, 510], [855, 510], [855, 590], [815, 590], [815, 510], [780, 510], [780, 470], [815, 470]]),
]);

const mermaid = draw('mermaid', 'Mermaid', [
  path('M520 195 Q 495 60 600 88 Q 705 60 680 195 Q 722 332 662 382 L 538 382 Q 478 332 520 195 Z'),
  path('M548 400 Q 515 565 622 655 Q 700 705 765 645 L 705 600 Q 640 560 652 400 Z'),
  path('M765 645 L 885 560 Q 865 650 905 725 Z'),
  path('M542 262 L 658 262 L 652 402 L 548 402 Z'),
  ellipse(575, 302, 30, 21), ellipse(625, 302, 30, 21),
  rot(25, 500, 330, ellipse(500, 330, 24, 70)),
  rot(-25, 700, 330, ellipse(700, 330, 24, 70)),
  circle(600, 190, 76),
  eyes(572, 628, 180, 11),
  smile(600, 212, 26, 16),
]);

const gnome = draw('gnome', 'Gnome', [
  ellipse(540, 712, 58, 28), ellipse(660, 712, 58, 28),
  rect(500, 520, 200, 170, 44),
  path('M480 360 Q 470 562 600 602 Q 730 562 720 360 Q 660 442 600 422 Q 540 442 480 360 Z'),
  circle(600, 370, 72),
  circle(600, 392, 32),
  eyes(566, 634, 345, 11),
  tri([478, 332], [600, 58], [722, 332]),
  ellipse(600, 335, 135, 26),
]);

const frogPrince = draw('frog-prince', 'Frog prince', [
  ellipse(360, 610, 115, 72), ellipse(840, 610, 115, 72),
  ellipse(600, 505, 262, 182),
  ellipse(600, 545, 152, 110),
  ellipse(470, 640, 48, 88), ellipse(730, 640, 48, 88),
  ellipse(600, 330, 212, 122),
  circle(470, 238, 72), circle(730, 238, 72),
  dot(470, 238, 24), dot(730, 238, 24),
  crown(600, 228, 96, 80),
  path('M470 362 Q 600 442 730 362'),
]);

const gingerbreadHouse = draw('gingerbread-house', 'Gingerbread house', [
  rect(340, 350, 520, 375),
  path(`M285 360 L 600 110 L 915 360 ${Array.from({ length: 8 }, (_, i) => {
    const x0 = 915 - i * 78.75, x1 = 915 - (i + 1) * 78.75;
    return `Q ${(x0 + x1) / 2} 420 ${x1} 360`;
  }).join(' ')} Z`),
  path('M540 725 L 540 590 Q 600 520 660 590 L 660 725 Z'),
  circle(430, 480, 50), line(380, 480, 480, 480), line(430, 430, 430, 530),
  circle(770, 480, 50), line(720, 480, 820, 480), line(770, 430, 770, 530),
  circle(600, 250, 38),
  circle(420, 640, 28), circle(780, 640, 28), circle(600, 440, 26),
]);

const pumpkinCarriage = draw('pumpkin-carriage', 'Pumpkin carriage', [
  rect(585, 168, 30, 58, 10), path('M615 190 Q 670 150 700 190'),
  ellipse(600, 420, 282, 200),
  ellipse(600, 420, 172, 200),
  ellipse(600, 420, 62, 200),
  circle(380, 640, 86), circle(380, 640, 26), line(380, 554, 380, 614), line(380, 666, 380, 726), line(294, 640, 354, 640), line(406, 640, 466, 640),
  circle(820, 640, 86), circle(820, 640, 26), line(820, 554, 820, 614), line(820, 666, 820, 726), line(734, 640, 794, 640), line(846, 640, 906, 640),
]);

// Redraws of rejected clipart subjects.

const dragon = draw('dragon', 'Dragon', [
  leg(380, 580, 70, 150), leg(460, 592, 70, 138), leg(590, 592, 70, 138), leg(670, 580, 70, 150),
  path('M320 520 Q 150 560 140 690 Q 205 625 332 580 Z'),
  tri([140, 690], [92, 632], [190, 645]),
  // Bat wing growing out of the back.
  path('M430 400 L 330 180 Q 400 230 440 215 Q 470 270 520 250 Q 540 300 590 290 L 600 385 Z'),
  ellipse(520, 500, 222, 142),
  path('M680 430 Q 760 380 770 300 L 860 305 Q 850 420 735 505 Z'),
  circle(815, 285, 92),
  ellipse(905, 318, 72, 46),
  dot(930, 305, 8),
  tri([770, 205], [772, 140], [808, 198]), tri([832, 196], [862, 140], [872, 212]),
  dot(830, 262, 13),
  smile(895, 345, 28, 14),
]);

const witch = draw('witch', 'Witch', [
  path('M880 530 L 1020 495 L 1020 625 L 880 590 Z'),
  // Broomstick stops short of the dress on both sides (no slivers).
  rect(260, 548, 195, 26, 12), rect(745, 548, 140, 26, 12),
  poly([[520, 420], [680, 420], [765, 682], [435, 682]]),
  path('M528 330 L 475 455 L 545 405 Z'), path('M672 330 L 725 455 L 655 405 Z'),
  circle(600, 345, 80),
  tri([592, 345], [550, 373], [602, 377]),
  eyes(572, 632, 325, 11),
  smile(605, 395, 24, 14),
  path('M505 258 Q 560 144 640 84 Q 652 174 695 258 Z'),
  ellipse(600, 263, 170, 18),
]);

const princess = draw('princess', 'Princess', [
  path('M470 562 L 400 720 Q 600 772 800 720 L 730 562 Q 600 602 470 562 Z'),
  path('M560 400 L 470 562 Q 600 602 730 562 L 640 400 Z'),
  path('M520 210 Q 505 380 560 400 L 640 400 Q 695 380 680 210 Z'),
  path('M545 292 L 655 292 L 640 402 L 560 402 Z'),
  rot(20, 505, 400, ellipse(505, 400, 24, 75)),
  rot(-20, 695, 400, ellipse(695, 400, 24, 75)),
  circle(600, 212, 80),
  eyes(572, 628, 202, 11),
  smile(600, 236, 26, 16),
  crown(600, 150, 120, 70),
]);

export const FAIRY = [redRidingHood, wolf, threePigsHouse, castle, knight, mermaid, gnome, frogPrince, gingerbreadHouse, pumpkinCarriage, dragon, witch, princess];
