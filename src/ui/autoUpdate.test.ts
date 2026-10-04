import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { shouldApplyUpdate } from './autoUpdate';

describe('shouldApplyUpdate', () => {
  const base = { waiting: true, applying: false, hidden: true, busy: false };

  it('applies a waiting update when the app is hidden and idle', () => {
    expect(shouldApplyUpdate(base)).toBe(true);
  });

  it('never while visible, busy (timer running), already applying or with nothing waiting', () => {
    expect(shouldApplyUpdate({ ...base, hidden: false })).toBe(false);
    expect(shouldApplyUpdate({ ...base, busy: true })).toBe(false);
    expect(shouldApplyUpdate({ ...base, applying: true })).toBe(false);
    expect(shouldApplyUpdate({ ...base, waiting: false })).toBe(false);
  });
});
