import { describe, expect, it } from 'vitest';
import { readBoolPref, writeBoolPref } from './prefs';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('bool prefs', () => {
  it('round-trips true and false', () => {
    const s = memory();
    writeBoolPref('k', false, s);
    expect(readBoolPref('k', true, s)).toBe(false);
    writeBoolPref('k', true, s);
    expect(readBoolPref('k', false, s)).toBe(true);
  });

  it('falls back when missing, unreadable or storage is null', () => {
    expect(readBoolPref('k', true, memory())).toBe(true);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readBoolPref('k', true, throwing)).toBe(true);
    expect(() => writeBoolPref('k', false, throwing)).not.toThrow();
    expect(readBoolPref('k', false, null)).toBe(false);
  });
});
