import { describe, expect, it } from 'vitest';
import { History, type Command } from './commands';
import type { Document } from './Document';

const doc = {} as Document;
const cmd = (bytes: number, log: string[] = [], name = ''): Command => ({
  bytes,
  apply: () => log.push(`apply ${name}`),
  invert: () => log.push(`invert ${name}`),
});

describe('History', () => {
  it('drops the oldest entries when over the byte cap', () => {
    const h = new History(50, 100);
    const log: string[] = [];
    h.push(cmd(40, log, 'a'));
    h.push(cmd(40, log, 'b'));
    h.push(cmd(40, log, 'c')); // total 120 > 100, 'a' dropped
    expect(h.undo(doc)).toBe(true);
    expect(h.undo(doc)).toBe(true);
    expect(h.undo(doc)).toBe(false);
    expect(log).toEqual(['invert c', 'invert b']);
  });

  it('keeps at least the newest entry even if it alone exceeds the cap', () => {
    const h = new History(50, 10);
    h.push(cmd(500));
    expect(h.canUndo()).toBe(true);
  });

  it('still enforces the step capacity', () => {
    const h = new History(2, Infinity);
    h.push(cmd(1)); h.push(cmd(1)); h.push(cmd(1));
    h.undo(doc); h.undo(doc);
    expect(h.canUndo()).toBe(false);
  });

  it('notifies onChange on push, undo, redo and clear', () => {
    const h = new History();
    let n = 0;
    h.onChange = () => n++;
    h.push(cmd(1));
    h.undo(doc);
    h.redo(doc);
    h.clear();
    expect(n).toBe(4);
  });
});
