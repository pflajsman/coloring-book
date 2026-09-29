import { describe, expect, it } from 'vitest';
import { RAINBOW_CYCLE_PX, hslToHex, rainbowColorAt } from './rainbow';

describe('hslToHex', () => {
  it('converts known colors', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });
});

describe('rainbowColorAt', () => {
  it('always returns #rrggbb (brush heads append hex alpha)', () => {
    for (let d = 0; d < 2000; d += 37) expect(rainbowColorAt(d, 123)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('starts at the start hue and is half way round at half a cycle', () => {
    expect(rainbowColorAt(0, 0)).toBe(hslToHex(0, 90, 55));
    expect(rainbowColorAt(RAINBOW_CYCLE_PX / 2, 0)).toBe(hslToHex(180, 90, 55));
    expect(rainbowColorAt(RAINBOW_CYCLE_PX, 0)).toBe(hslToHex(0, 90, 55));
  });

  it('quantizes to 36 steps so brush heads can be cached', () => {
    const colors = new Set<string>();
    for (let d = 0; d < RAINBOW_CYCLE_PX * 3; d += 1) colors.add(rainbowColorAt(d, 77));
    expect(colors.size).toBe(36);
  });
});
