import { describe, expect, it } from 'vitest';
import { isLineArt, lineArtStats } from './lineArtCheck';

// Build an RGBA buffer of w*h pixels from a per-pixel colour function.
const img = (w: number, h: number, px: (x: number, y: number) => [number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = px(x, y);
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
};

describe('isLineArt', () => {
  it('accepts black outlines on white', () => {
    // A ring of 4 px black lines with a 1 px grey anti-aliased edge.
    const d = img(100, 100, (x, y) => {
      const r = Math.hypot(x - 50, y - 50);
      if (Math.abs(r - 30) < 2) return [0, 0, 0];
      if (Math.abs(r - 30) < 3) return [128, 128, 128];
      return [255, 255, 255];
    });
    expect(isLineArt(lineArtStats(d))).toBe(true);
  });

  it('rejects a painted picture with large colour areas', () => {
    // Pink blob behind the subject, like the "sana" fallback images.
    const d = img(100, 100, (x, y) => (Math.hypot(x - 50, y - 50) < 35 ? [230, 140, 170] : [255, 255, 255]));
    expect(isLineArt(lineArtStats(d))).toBe(false);
  });

  it('rejects soft grey shading', () => {
    const d = img(100, 100, (x) => {
      const v = 60 + Math.round((x / 100) * 180);
      return [v, v, v];
    });
    expect(isLineArt(lineArtStats(d))).toBe(false);
  });

  it('rejects mostly black (filled silhouettes, dark fur)', () => {
    const d = img(100, 100, (x, y) => (x > 15 && x < 85 && y > 15 && y < 85 ? [10, 10, 10] : [255, 255, 255]));
    expect(isLineArt(lineArtStats(d))).toBe(false);
  });

  it('rejects a black-and-white painting with dark fur (about 30 % dark)', () => {
    // Measured on a real fallback image: dark 0.33, mid 0.10 (plus colour).
    expect(isLineArt({ colourful: 0, mid: 0.1, dark: 0.3 })).toBe(false);
  });

  it('rejects a little colour tint over a large area', () => {
    expect(isLineArt({ colourful: 0.06, mid: 0.05, dark: 0.1 })).toBe(false);
  });

  it('accepts the busiest real line art measured (cat: 22.5 % dark, owl: 12.5 % grey)', () => {
    expect(isLineArt({ colourful: 0, mid: 0.018, dark: 0.225 })).toBe(true);
    expect(isLineArt({ colourful: 0, mid: 0.125, dark: 0.135 })).toBe(true);
  });

  it('rejects an empty white page', () => {
    expect(isLineArt(lineArtStats(img(50, 50, () => [255, 255, 255])))).toBe(false);
  });
});
