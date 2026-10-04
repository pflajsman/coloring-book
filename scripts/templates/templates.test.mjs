import { describe, expect, it } from 'vitest';
import { page, solidPage, circle, poly, path, line, dashed, dot, digit } from './svg.mjs';
import { mergeManifest } from './manifest.mjs';
import { checkEntry } from './checkRules.mjs';

describe('svg toolkit', () => {
  it('wraps content in the fixed line style', () => {
    const s = page(circle(10, 10, 5));
    expect(s).toContain('viewBox="0 0 1200 800"');
    expect(s).toContain('stroke-width="9"');
    expect(s).toContain('fill="none"');
    expect(s).toContain('<circle cx="10" cy="10" r="5"/>');
  });

  it('closes polygons unless asked not to', () => {
    expect(poly([[0, 0], [10, 0], [10, 10]])).toContain('Z');
    expect(poly([[0, 0], [10, 0]], false)).not.toContain('Z');
  });

  it('dots are filled black, dashes are dashed, digits are text', () => {
    expect(dot(1, 2, 3)).toContain('fill="#000"');
    expect(dashed('M0 0 L10 0')).toContain('stroke-dasharray');
    expect(digit(5, 5, '12')).toContain('>12</text>');
  });
});

describe('mergeManifest', () => {
  const blank = { id: 'blank', name: 'Blank page', file: null, category: 'Other' };
  const cat = { id: 'cat', name: 'Kitty cat', file: 'cat.svg', category: 'Animals' };
  const horseOld = { id: 'horse', name: 'Horse', file: 'horse.svg', category: 'Animals' };

  it('removes, upserts and keeps blank first, grouped by category order', () => {
    const out = mergeManifest([blank, cat, horseOld, { id: 'santa', name: 'Santa', file: 'santa.svg', category: 'Fantasy' }], {
      remove: ['santa'],
      upsert: [
        { id: 'horse', name: 'Pony', file: 'horse.svg', category: 'Animals' },
        { id: 'maze-bunny', name: 'Bunny maze', file: 'maze-bunny.svg', category: 'Games' },
        { id: 'castle', name: 'Castle', file: 'castle.svg', category: 'Fairy tales' },
      ],
    });
    expect(out.map((e) => e.id)).toEqual(['blank', 'cat', 'horse', 'castle', 'maze-bunny']);
    expect(out.find((e) => e.id === 'horse').name).toBe('Pony');
  });

  it('rejects duplicate ids in the upsert list', () => {
    expect(() => mergeManifest([blank], { remove: [], upsert: [cat, cat] })).toThrow(/duplicate/);
  });
});

describe('checkEntry', () => {
  it('passes a clean picture', () => {
    expect(checkEntry({ id: 'lion', ink: 6, big: 9, small: 4, tiny: 0 }, false)).toEqual([]);
  });

  it('flags an open outline (too few fillable areas)', () => {
    expect(checkEntry({ id: 'x', ink: 5, big: 2, small: 0, tiny: 0 }, false).join()).toMatch(/fillable/);
  });

  it('flags specks and faint or heavy ink', () => {
    const p = checkEntry({ id: 'x', ink: 1, big: 9, small: 30, tiny: 9 }, false).join(' | ');
    expect(p).toMatch(/specks/);
    expect(p).toMatch(/small areas/);
    expect(p).toMatch(/ink/);
  });

  it('writing sheets allow specks where dashes cross guide lines', () => {
    expect(checkEntry({ id: 'write-upper-a-i', ink: 5, big: 1, small: 9, tiny: 15 }, 'writing')).toEqual([]);
    expect(checkEntry({ id: 'trace-x', ink: 5, big: 1, small: 9, tiny: 15 }, true).join()).toMatch(/specks/);
  });

  it('games may have many small areas (digit counters)', () => {
    expect(checkEntry({ id: 'dots-star', ink: 3, big: 1, small: 40, tiny: 2 }, true)).toEqual([]);
  });
});

describe('solidPage', () => {
  it('paints closed shapes white so later shapes hide the lines behind them', () => {
    const s = solidPage([circle(1, 1, 1), poly([[0, 0], [1, 0], [1, 1]]), path('M0 0 L1 1 Z')].join(''));
    expect(s.match(/fill="#fff"/g)).toHaveLength(3);
  });

  it('leaves open paths, lines and black dots alone', () => {
    const s = solidPage([path('M0 0 Q 1 1 2 0'), line(0, 0, 1, 1), dot(1, 1, 2)].join(''));
    expect(s).not.toContain('fill="#fff"');
    expect(s).toContain('fill="#000"');
  });
});
