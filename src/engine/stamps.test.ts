import { describe, expect, it } from 'vitest';
import { STAMPS, SURPRISE, StampPicker, shade } from './stamps';

describe('STAMPS', () => {
  it('has the 12 stamps in picker order, each with a name', () => {
    expect(STAMPS.map((s) => s.id)).toEqual([
      'star', 'heart', 'flower', 'sparkle', 'unicorn', 'mushroom', 'dog', 'cat', 'pig', 'poop', 'apple', 'pear',
    ]);
    for (const s of STAMPS) expect(s.name.length).toBeGreaterThan(0);
  });
});

describe('StampPicker', () => {
  it('surprise cycles through every stamp and keeps going across strokes (no reset to star)', () => {
    const p = new StampPicker();
    expect(p.selected).toBe(SURPRISE);
    const first13 = Array.from({ length: 13 }, () => p.next());
    expect(first13.slice(0, 12)).toEqual(STAMPS.map((s) => s.id));
    expect(first13[12]).toBe('star');
  });

  it('a chosen stamp comes out every time', () => {
    const p = new StampPicker();
    p.select('poop');
    expect([p.next(), p.next(), p.next()]).toEqual(['poop', 'poop', 'poop']);
  });

  it('going back to surprise continues the cycle', () => {
    const p = new StampPicker();
    p.next(); p.next();
    p.select('dog'); p.next();
    p.select(SURPRISE);
    expect(p.next()).toBe('flower');
  });
});

describe('shade', () => {
  it('darkens and lightens hex colours', () => {
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(shade('#000000', 0.5)).toBe('#808080');
    expect(shade('#ffffff', 0.3)).toBe('#ffffff');
  });
});
