import { describe, expect, it } from 'vitest';
import { compositeCoverage } from './composite';

describe('compositeCoverage (straight alpha "over")', () => {
  it('full coverage writes the fill colour', () => {
    const dst = new Uint8ClampedArray([0, 0, 0, 0]);
    compositeCoverage(dst, new Uint8Array([255]), { r: 200, g: 100, b: 50, a: 255 });
    expect(Array.from(dst)).toEqual([200, 100, 50, 255]);
  });

  it('half coverage on a transparent pixel keeps the colour, halves alpha', () => {
    const dst = new Uint8ClampedArray([0, 0, 0, 0]);
    compositeCoverage(dst, new Uint8Array([128]), { r: 200, g: 100, b: 50, a: 255 });
    expect(Array.from(dst)).toEqual([200, 100, 50, 128]);
  });

  it('half coverage over an opaque pixel blends the colours', () => {
    const dst = new Uint8ClampedArray([0, 0, 255, 255]);
    compositeCoverage(dst, new Uint8Array([128]), { r: 255, g: 0, b: 0, a: 255 });
    expect(Array.from(dst)).toEqual([128, 0, 127, 255]);
  });

  it('zero coverage leaves the pixel alone', () => {
    const dst = new Uint8ClampedArray([1, 2, 3, 4]);
    compositeCoverage(dst, new Uint8Array([0]), { r: 255, g: 0, b: 0, a: 255 });
    expect(Array.from(dst)).toEqual([1, 2, 3, 4]);
  });
});
