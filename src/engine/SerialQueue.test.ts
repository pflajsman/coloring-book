import { describe, expect, it } from 'vitest';
import { SerialQueue } from './SerialQueue';

describe('SerialQueue', () => {
  it('runs tasks one at a time in order', async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((r) => setTimeout(() => { log.push(name); r(name); }, ms));
    const results = await Promise.all([q.run(task('a', 30)), q.run(task('b', 1))]);
    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['a', 'b']);
    expect(q.pending).toBe(0);
  });

  it('a failed task does not block the next one', async () => {
    const q = new SerialQueue();
    const failed = q.run(() => Promise.reject(new Error('boom')));
    const ok = q.run(() => Promise.resolve(2));
    await expect(failed).rejects.toThrow('boom');
    await expect(ok).resolves.toBe(2);
  });
});
