import { describe, expect, it } from 'vitest';
import { Countdown, formatRemaining, stepMinutes } from './countdown';

describe('Countdown', () => {
  it('finishes once at the end time and then stops', () => {
    let now = 0;
    const c = new Countdown(() => now);
    c.start(2);
    expect(c.running).toBe(true);
    now = 119_999;
    expect(c.finished()).toBe(false);
    expect(c.remaining()).toBe(1);
    now = 120_000;
    expect(c.finished()).toBe(true);
    expect(c.running).toBe(false);
    expect(c.finished()).toBe(false);
  });

  it('fires late rather than never when ticks were missed', () => {
    let now = 0;
    const c = new Countdown(() => now);
    c.start(1);
    now = 10 * 60_000;
    expect(c.finished()).toBe(true);
  });

  it('clear stops it without finishing', () => {
    let now = 0;
    const c = new Countdown(() => now);
    c.start(1);
    c.clear();
    now = 120_000;
    expect(c.finished()).toBe(false);
    expect(c.remaining()).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('shows m:ss rounded up', () => {
    expect(formatRemaining(600_000)).toBe('10:00');
    expect(formatRemaining(59_001)).toBe('1:00');
    expect(formatRemaining(1)).toBe('0:01');
    expect(formatRemaining(0)).toBe('0:00');
  });
});

describe('stepMinutes', () => {
  it('walks the step list and stops at the ends', () => {
    expect(stepMinutes(5, 1)).toBe(10);
    expect(stepMinutes(5, -1)).toBe(3);
    expect(stepMinutes(1, -1)).toBe(1);
    expect(stepMinutes(60, 1)).toBe(60);
  });
});
