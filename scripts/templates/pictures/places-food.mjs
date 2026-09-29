import { page, circle, rect, line, path, poly, dot, group } from '../svg.mjs';

// Redrawn house, fruit and mushroom: the old clipart versions were hatched,
// dot-shaded or hair-thin.

const draw = (id, name, category, parts) => ({ id, name, category, svg: page(parts.flat().join('\n')) });

const house = draw('house', 'House', 'Places', [
  rect(730, 170, 62, 135),
  poly([[280, 372], [600, 120], [920, 372]]),
  rect(330, 362, 540, 360),
  rect(540, 540, 120, 182, 18), dot(640, 640, 10),
  rect(385, 430, 115, 95), line(442, 430, 442, 525), line(385, 477, 500, 477),
  rect(700, 430, 115, 95), line(757, 430, 757, 525), line(700, 477, 815, 477),
]);

const apple = draw('apple', 'Apple', 'Food', [
  group('rotate(15 605 195)', rect(592, 140, 26, 110, 10)),
  path('M620 192 Q 700 120 782 150 Q 722 232 620 192 Z'),
  path('M600 262 Q 420 170 330 330 Q 260 520 420 690 Q 520 760 600 712 Q 680 760 780 690 Q 940 520 870 330 Q 780 170 600 262 Z'),
  path('M420 380 Q 395 460 440 525 Q 432 452 452 392 Z'),
]);

const cherry = draw('cherry', 'Cherries', 'Food', [
  path('M460 432 Q 480 282 650 172'),
  path('M760 462 Q 722 302 650 172'),
  path('M650 172 Q 760 92 870 142 Q 780 232 650 172 Z'),
  circle(460, 562, 130),
  circle(760, 592, 130),
]);

const mushroom = draw('mushroom', 'Mushroom', 'Nature', [
  path('M500 432 Q 480 602 470 702 L 730 702 Q 720 602 700 432 Z'),
  path('M300 422 Q 320 180 600 170 Q 880 180 900 422 Q 600 472 300 422 Z'),
  circle(450, 305, 42), circle(600, 245, 46), circle(750, 305, 42), circle(525, 380, 30), circle(685, 382, 30),
  rect(885, 600, 70, 102, 15),
  path('M800 602 Q 820 500 920 495 Q 1020 500 1040 602 Q 920 622 800 602 Z'),
]);

export const PLACES_FOOD = [house, apple, cherry, mushroom];
