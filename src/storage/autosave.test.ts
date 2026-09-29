import { describe, expect, it, vi } from 'vitest';
import { AutosaveScheduler, isValidAutosave } from './autosave';

describe('AutosaveScheduler', () => {
  it('saves once, 3 s after the last change', async () => {
    vi.useFakeTimers();
    const save = vi.fn(() => Promise.resolve());
    const s = new AutosaveScheduler(save, 3000);
    s.markDirty();
    vi.advanceTimersByTime(2000);
    s.markDirty();
    vi.advanceTimersByTime(2999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('flushNow saves immediately only when dirty', async () => {
    vi.useFakeTimers();
    const save = vi.fn(() => Promise.resolve());
    const s = new AutosaveScheduler(save, 3000);
    await s.flushNow();
    expect(save).not.toHaveBeenCalled();
    s.markDirty();
    await s.flushNow();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1); // pending timer was cancelled
    vi.useRealTimers();
  });

  it('a failed save keeps the scheduler dirty for the next attempt', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const s = new AutosaveScheduler(save, 3000);
    s.markDirty();
    await s.flushNow();
    await s.flushNow();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('isValidAutosave', () => {
  it('accepts a well-formed record and rejects junk', () => {
    const ok = {
      meta: { id: 'doc_1', name: 'Untitled', width: 1200, height: 800, createdAt: 1, updatedAt: 1 },
      activeLayerId: 'l2',
      layers: [{ id: 'l2', name: 'Paint', visible: true, opacity: 1, locked: false, blob: {}, isTemplate: false }],
    };
    expect(isValidAutosave(ok)).toBe(true);
    expect(isValidAutosave(undefined)).toBe(false);
    expect(isValidAutosave({ meta: {} })).toBe(false);
    expect(isValidAutosave({ ...ok, layers: [] })).toBe(false);
    expect(isValidAutosave({ ...ok, meta: { ...ok.meta, width: 0 } })).toBe(false);
  });
});
