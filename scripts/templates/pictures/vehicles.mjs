import { page, solidPage, circle, rect, line, path, poly, dot, group } from '../svg.mjs';

// Vehicles in side view, facing right, bold closed shapes. Wheels have a
// hub so each wheel gives two areas to colour.

const wheel = (cx, cy, r) => circle(cx, cy, r) + circle(cx, cy, r * 0.36);
const draw = (id, name, parts) => ({ id, name, category: 'Vehicles', svg: solidPage(parts.flat().join('\n')) });

const raceCar = draw('race-car', 'Race car', [
  poly([[180, 430], [262, 430], [262, 470], [232, 470]]),
  path('M200 560 L 260 470 L 520 450 L 600 380 L 760 380 L 820 450 L 1000 480 L 1010 560 Z'),
  poly([[620, 398], [745, 398], [788, 450], [604, 450]]),
  circle(430, 508, 40),
  wheel(330, 590, 76), wheel(850, 590, 76),
]);

const fireTruck = draw('fire-truck', 'Fire truck', [
  rect(300, 370, 22, 52, 6), rect(700, 370, 22, 52, 6),
  rect(270, 330, 480, 42, 8),
  [340, 410, 480, 550, 620, 690].map((x) => line(x, 330, x, 372)),
  rect(840, 330, 52, 32, 12),
  path('M780 360 L 930 360 L 990 450 L 990 602 L 780 602 Z'),
  poly([[800, 385], [915, 385], [960, 455], [800, 455]]),
  rect(250, 420, 530, 182, 10),
  circle(480, 510, 46),
  wheel(360, 622, 70), wheel(565, 622, 70), wheel(880, 622, 70),
]);

const policeCar = draw('police-car', 'Police car', [
  rect(560, 310, 92, 42, 14),
  path('M220 560 L 220 470 Q 230 440 280 440 L 380 440 L 460 350 L 760 350 L 850 440 L 950 450 Q 990 460 990 500 L 990 560 Z'),
  poly([[480, 370], [598, 370], [598, 440], [412, 440]]),
  poly([[622, 370], [745, 370], [815, 440], [622, 440]]),
  line(610, 440, 610, 558),
  wheel(340, 582, 70), wheel(850, 582, 70),
]);

const bus = draw('bus', 'Bus', [
  rect(180, 300, 840, 300, 40),
  [220, 360, 500, 640].map((x) => rect(x, 340, 110, 100, 12)),
  rect(870, 340, 105, 225, 12), line(922, 340, 922, 565),
  dot(1000, 545, 16),
  wheel(340, 622, 72), wheel(830, 622, 72),
]);

const tractor = draw('tractor', 'Tractor', [
  rect(700, 320, 28, 100, 10),
  rect(450, 420, 330, 142, 20),
  rect(250, 260, 222, 302, 20),
  rect(290, 300, 142, 120, 15),
  wheel(360, 582, 150),
  wheel(760, 622, 90),
]);

const excavator = draw('excavator', 'Excavator', [
  // Two thick arm sections (boom and stick) as rotated rounded bars.
  group('rotate(-42 660 452)', rect(640, 430, 320, 46, 22)),
  group('rotate(62 872 262)', rect(852, 240, 215, 46, 22)),
  path('M930 430 L 1030 430 L 1000 540 Q 960 562 920 520 Z'),
  rect(300, 430, 380, 152, 20),
  rect(330, 280, 172, 152, 15),
  rect(360, 305, 112, 92, 10),
  rect(250, 580, 520, 112, 56),
  [345, 510, 675].map((x) => circle(x, 636, 36)),
]);

const ambulance = draw('ambulance', 'Ambulance', [
  rect(450, 305, 80, 37, 12),
  rect(220, 340, 560, 262, 30),
  path('M780 400 L 900 400 L 980 480 L 980 602 L 780 602 Z'),
  poly([[800, 420], [890, 420], [945, 480], [800, 480]]),
  poly([[450, 400], [510, 400], [510, 440], [550, 440], [550, 500], [510, 500], [510, 540], [450, 540], [450, 500], [410, 500], [410, 440], [450, 440]]),
  wheel(360, 622, 72), wheel(820, 622, 72),
]);

const monsterTruck = draw('monster-truck', 'Monster truck', [
  path('M320 420 L 320 330 Q 330 300 370 300 L 560 300 L 640 222 L 830 222 L 900 300 L 950 310 Q 980 320 980 360 L 980 420 Z'),
  poly([[660, 242], [810, 242], [868, 300], [642, 300]]),
  path('M390 420 L 410 440 L 390 460 L 410 480'), path('M850 420 L 870 440 L 850 460 L 870 480'),
  wheel(400, 585, 150), wheel(860, 585, 150),
]);

// Redraws of rejected clipart subjects.

const car = draw('car', 'Car', [
  path('M200 580 Q 190 480 280 470 L 380 460 Q 450 330 600 330 Q 760 330 830 460 L 930 475 Q 1010 490 1000 580 Z'),
  path('M420 460 Q 470 372 590 366 L 590 460 Z'),
  path('M620 366 Q 740 372 790 460 L 620 460 Z'),
  circle(940, 528, 24),
  wheel(340, 602, 78), wheel(860, 602, 78),
]);

const train = draw('train', 'Train', [
  line(30, 702, 1170, 702),
  circle(900, 250, 38), circle(965, 188, 48),
  path('M880 420 L 860 322 L 940 322 L 920 420 Z'),
  rect(60, 430, 190, 172, 14), rect(290, 430, 190, 172, 14),
  line(250, 560, 290, 560), line(480, 560, 520, 560),
  rect(520, 300, 192, 302, 15),
  rect(555, 340, 122, 100, 12),
  rect(710, 420, 262, 182, 20),
  wheel(110, 640, 45), wheel(200, 640, 45), wheel(340, 640, 45), wheel(430, 640, 45),
  wheel(600, 636, 62), wheel(760, 636, 62), wheel(905, 642, 55),
]);

export const VEHICLES = [raceCar, fireTruck, policeCar, bus, tractor, excavator, ambulance, monsterTruck, car, train];
