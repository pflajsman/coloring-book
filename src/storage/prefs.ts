// Tiny per-device preferences in localStorage. Storage can be missing or
// throw (private mode, blocked site data), so every access is guarded and a
// failure falls back to the default. Kid-safety defaults (zoom locked) must
// hold even when nothing can be stored.

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const PREF_ZOOM_LOCKED = 'cb.zoomLocked';

function defaultStorage(): PrefStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readBoolPref(key: string, fallback: boolean, storage: PrefStorage | null = defaultStorage()): boolean {
  try {
    const v = storage?.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* unreadable: use fallback */
  }
  return fallback;
}

export function writeBoolPref(key: string, value: boolean, storage: PrefStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(key, value ? '1' : '0');
  } catch {
    /* not persisted: fine, default applies next launch */
  }
}
