import { describe, expect, it } from 'vitest';
import { GAMES, makeMaze, solveMaze } from './games.mjs';

describe('makeMaze', () => {
  it('is deterministic for a seed', () => {
    expect(makeMaze(5, 4, 7)).toEqual(makeMaze(5, 4, 7));
    expect(makeMaze(5, 4, 7)).not.toEqual(makeMaze(5, 4, 8));
  });

  it('every maze is solvable', () => {
    for (let seed = 1; seed <= 50; seed++) expect(solveMaze(makeMaze(6, 4, seed))).toBe(true);
  });

  it('is a perfect maze (cells - 1 openings)', () => {
    const m = makeMaze(6, 4, 3);
    let open = 0;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (x < m.cols - 1 && !m.walls.right[y][x]) open++;
      if (y < m.rows - 1 && !m.walls.down[y][x]) open++;
    }
    expect(open).toBe(6 * 4 - 1);
  });
});

describe('GAMES', () => {
  it('has 16 pages with unique ids in the Games category', () => {
    expect(GAMES).toHaveLength(16);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(16);
    for (const g of GAMES) {
      expect(g.category).toBe('Games');
      expect(g.svg).toContain('viewBox="0 0 1200 800"');
    }
  });

  it('connect-the-dots pages number every dot', () => {
    const d10 = GAMES.filter((g) => g.id.startsWith('dots-')).map((g) => (g.svg.match(/<text /g) ?? []).length);
    expect(d10.sort((a, b) => a - b)).toEqual([10, 10, 20, 20]);
  });
});
