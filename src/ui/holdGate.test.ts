import { describe, expect, it, vi } from 'vitest';
import { HoldTimer } from './holdGate';

describe('HoldTimer', () => {
  it('fires after the full hold and reports fired on release', () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const t = new HoldTimer(2000, onFire);
    t.press();
    vi.advanceTimersByTime(1999);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(t.release()).toBe('fired');
    vi.useRealTimers();
  });

  it('a short press does not fire', () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const t = new HoldTimer(2000, onFire);
    t.press();
    vi.advanceTimersByTime(500);
    expect(t.release()).toBe('short');
    vi.advanceTimersByTime(5000);
    expect(onFire).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('progress goes from 0 to 1', () => {
    let now = 1000;
    const t = new HoldTimer(2000, () => {}, { now: () => now, setTimeout, clearTimeout });
    expect(t.progress()).toBe(0);
    t.press();
    now = 2000;
    expect(t.progress()).toBeCloseTo(0.5);
    now = 9000;
    expect(t.progress()).toBe(1);
    t.release();
  });
});
