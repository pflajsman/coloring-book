import { describe, expect, it } from 'vitest';
import { page, circle, poly, dashed, dot, digit } from './svg.mjs';
import { mergeManifest } from './manifest.mjs';

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
