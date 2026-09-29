import type { StoredDocument } from './db';

// Keeps the current drawing safe without the child ever pressing Save. The
// OS can kill a backgrounded tab at any time (an accidental swipe to the
// home screen is enough), and beforeunload is not reliable on iOS, so we
// save a few seconds after each change and immediately when the page hides.

export class AutosaveScheduler {
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private save: () => Promise<void>, private delayMs = 3000) {}

  markDirty() {
    this.dirty = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flushNow(); }, this.delayMs);
  }

  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await this.save();
    } catch (e) {
      // Stay dirty so the next change or page hide retries.
      this.dirty = true;
      console.error('Autosave failed', e);
    }
  }
}

// Guard against records from older builds or partial writes. A bad record
// means "start blank", never a crash at boot.
export function isValidAutosave(x: unknown): x is StoredDocument {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<StoredDocument>;
  const m = r.meta;
  if (!m || typeof m.id !== 'string' || !(m.width > 0) || !(m.height > 0)) return false;
  if (!Array.isArray(r.layers) || r.layers.length === 0) return false;
  if (typeof r.activeLayerId !== 'string') return false;
  if (!r.layers.every((l) => l && typeof l.id === 'string' && typeof Blob !== 'undefined' && l.blob instanceof Blob)) {
    return false;
  }
  return r.layers.some((l) => l.id === r.activeLayerId);
}
