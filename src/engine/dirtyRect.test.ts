import { describe, expect, it } from 'vitest';
import { cropPixels, diffBox } from './dirtyRect';

const img = (w: number, h: number) => new Uint8ClampedArray(w * h * 4);

describe('diffBox', () => {
  it('returns null for identical buffers', () => {
    expect(diffBox(img(4, 3), img(4, 3), 4, 3)).toBeNull();
  });

  it('finds the tight box around changed pixels', () => {
    const a = img(5, 4);
    const b = img(5, 4);
    b[(1 * 5 + 1) * 4 + 3] = 255; // (1,1) alpha
    b[(2 * 5 + 3) * 4 + 0] = 10; // (3,2) red
    expect(diffBox(a, b, 5, 4)).toEqual({ x: 1, y: 1, w: 3, h: 2 });
  });
});

describe('cropPixels', () => {
  it('copies the rows of the box', () => {
    const src = img(3, 2);
    for (let i = 0; i < src.length; i++) src[i] = i;
    const out = cropPixels(src, 3, { x: 1, y: 0, w: 2, h: 2 });
    expect(Array.from(out)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11,
      16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });
});
