import { describe, expect, it } from 'vitest';
import { PointerTracker } from './PointerTracker';

describe('PointerTracker, zoom locked', () => {
  const locked = () => new PointerTracker(() => true);

  it('first pointer starts a stroke, extra pointers are ignored', () => {
    const t = locked();
    expect(t.down(1, 0, 0)).toEqual({ kind: 'stroke-start' });
    expect(t.down(2, 50, 50)).toEqual({ kind: 'ignore' });
    expect(t.move(2, 60, 60)).toBe('ignore');
    expect(t.move(1, 5, 5)).toBe('stroke');
    expect(t.up(2)).toEqual({ endStroke: false });
    expect(t.up(1)).toEqual({ endStroke: true });
  });

  it('never starts a gesture, even with five fingers', () => {
    const t = locked();
    const kinds = [1, 2, 3, 4, 5].map((id) => t.down(id, id * 10, 0).kind);
    expect(kinds).toEqual(['stroke-start', 'ignore', 'ignore', 'ignore', 'ignore']);
    expect(t.gesturePair()).toBeNull();
  });

  it('palm resting, new finger still draws after the first stroke ends', () => {
    const t = locked();
    t.down(1, 0, 0); // drawing finger
    t.down(9, 300, 300); // palm lands and stays
    t.up(1);
    expect(t.down(2, 10, 10)).toEqual({ kind: 'stroke-start' });
  });

  it('a pointer whose press was only a tap (fill) is released so the next pointer can draw', () => {
    const t = locked();
    expect(t.down(9, 300, 300)).toEqual({ kind: 'stroke-start' }); // palm lands first, fill tool taps
    t.release(9); // App consumed it as a tap
    expect(t.down(1, 10, 10)).toEqual({ kind: 'stroke-start' }); // drawing hand still works
    expect(t.up(9)).toEqual({ endStroke: false }); // palm lifting later ends nothing
    expect(t.up(1)).toEqual({ endStroke: true });
  });

  it('cancel ends stroke (pointercancel is reported as up)', () => {
    const t = locked();
    t.down(1, 0, 0);
    expect(t.up(1)).toEqual({ endStroke: true });
    expect(t.has(1)).toBe(false);
  });
});

describe('PointerTracker, zoom unlocked', () => {
  const unlocked = () => new PointerTracker(() => false);

  it('second pointer turns the stroke into a gesture and ends the stroke', () => {
    const t = unlocked();
    t.down(1, 0, 0);
    expect(t.down(2, 100, 0)).toEqual({ kind: 'gesture-start', endStroke: true });
    expect(t.move(1, 1, 1)).toBe('gesture');
    expect(t.move(2, 99, 1)).toBe('gesture');
    expect(t.gesturePair()).toEqual([{ x: 1, y: 1 }, { x: 99, y: 1 }]);
  });

  it('third pointer during a gesture is ignored', () => {
    const t = unlocked();
    t.down(1, 0, 0);
    t.down(2, 100, 0);
    expect(t.down(3, 50, 50)).toEqual({ kind: 'ignore' });
  });

  it('lifting one gesture finger ends the gesture; the other finger does not draw', () => {
    const t = unlocked();
    t.down(1, 0, 0);
    t.down(2, 100, 0);
    expect(t.up(2)).toEqual({ endStroke: false });
    expect(t.gesturePair()).toBeNull();
    expect(t.move(1, 5, 5)).toBe('ignore');
    t.up(1);
    expect(t.down(4, 0, 0)).toEqual({ kind: 'stroke-start' });
  });
});
