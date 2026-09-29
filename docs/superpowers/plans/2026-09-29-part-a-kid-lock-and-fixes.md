# Part A: Kid Lock and Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coloring book safe for unsupervised use by a 3-year-old on iPad and Android: canvas locked, parent-gated settings, sticky fullscreen, autosave, safe picture switching, and the correctness fixes from the review.

**Architecture:** Pure logic (pointer ownership, hold-gate timing, autosave scheduling, dirty-rect diffing, history byte cap, fill queue, alpha compositing) is extracted into small modules with Vitest unit tests. Existing classes (`PointerInput`, `App`, `History`, `fillClient`, `KidUI`, `main.ts`) delegate to them. DOM/canvas glue is verified with `npm run build` plus a manual check in Chrome at tablet size.

**Tech Stack:** Vite 7, TypeScript 6 strict, plain DOM, `idb`, `vite-plugin-pwa`, Vitest (new, dev only, node environment).

**Spec:** `docs/superpowers/specs/2026-09-29-kid-lock-icons-templates-design.md` (Part A sections A1 to A13)

## Global Constraints

- No UI framework; plain DOM and TypeScript, matching the surrounding code style (explanatory comments above non-obvious blocks).
- `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters`; `npm run build` (`tsc && vite build`) must pass after every task.
- Tests live next to the code as `src/**/*.test.ts`, run with `npm test` (`vitest run`), node environment (no jsdom, no canvas): tests only touch pure modules.
- Parent gate hold duration: 2000 ms.
- Autosave debounce: 3000 ms after the last committed change.
- History: 50 steps and about 60 MB (`60 * 1024 * 1024` bytes) cap.
- Zoom lock default: locked (`true`), persisted in `localStorage` key `cb.zoomLocked` as `'1'` / `'0'`.
- Never use em dashes in user-facing copy.
- Commit after every task with a message ending in:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

- A palm resting on the screen while the child draws with the other hand: the drawing hand must keep drawing (next stroke too), the palm must never zoom, pan or draw. Covered in Task 1 tests (`palm resting, new finger still draws`).
- App swiped away mid-stroke (pointercancel arrives, then `visibilitychange` hidden): the partial stroke becomes an undo step and is included in the autosave. Covered in Task 1 (`cancel ends stroke`) and Task 9 (`flushNow`).
- Two fill taps in quick succession, or a stroke right after a fill tap: neither is lost. Covered in Task 8 (`SerialQueue` order test) and by ignoring strokes while a fill is pending.
- Opening the app offline after install: Pictures and the blank page load. Covered in Task 12 (build output check for `manifest.json` in the precache list).
- Restoring an autosave written by an older build or a corrupted record: boot must fall back to a blank page, not crash. Covered in Task 9 (`isValidAutosave` test).

---

### Task 1: Vitest setup and PointerTracker (who owns a touch)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/engine/PointerTracker.ts`
- Test: `src/engine/PointerTracker.test.ts`

**Interfaces:**
- Produces: `class PointerTracker(isZoomLocked: () => boolean)` with
  `down(id: number, x: number, y: number): DownResult`,
  `move(id: number, x: number, y: number): 'stroke' | 'gesture' | 'ignore'`,
  `up(id: number): { endStroke: boolean }`,
  `has(id: number): boolean`,
  `gesturePair(): [{x:number;y:number},{x:number;y:number}] | null`.
  `type DownResult = { kind: 'ignore' } | { kind: 'stroke-start' } | { kind: 'gesture-start'; endStroke: boolean }`.

- [ ] **Step 1: Install dependencies and Vitest**

Run: `npm install && npm install -D vitest@^3`
Expected: `vitest` appears in `devDependencies`.

Add to `package.json` `scripts`: `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Unit tests cover pure modules only (no DOM, no canvas), so the plain node
// environment is enough and keeps the test run fast.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test**

`src/engine/PointerTracker.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/PointerTracker.test.ts`
Expected: FAIL, cannot resolve `./PointerTracker`.

- [ ] **Step 4: Write minimal implementation**

`src/engine/PointerTracker.ts`:

```ts
// Pure bookkeeping for "which pointer is doing what" on the canvas. Kept
// free of DOM types so the rules can be unit tested.
//
// Zoom locked (default, kid mode): the first pointer that lands while no
// stroke is running owns the stroke. Every other pointer (a resting palm, a
// second finger) is ignored. There is never a gesture.
//
// Zoom unlocked (parent mode): a second pointer turns the interaction into a
// two-finger pinch/pan. Any in-flight stroke is ended (committed), extra
// pointers beyond two are ignored, and fingers left over after a gesture do
// not start drawing until they lift.

export type DownResult =
  | { kind: 'ignore' }
  | { kind: 'stroke-start' }
  | { kind: 'gesture-start'; endStroke: boolean };

type Pos = { x: number; y: number };

export class PointerTracker {
  private active = new Map<number, Pos>();
  private strokeId: number | null = null;
  private gestureIds: number[] = [];

  constructor(private isZoomLocked: () => boolean) {}

  has(id: number): boolean {
    return this.active.has(id);
  }

  down(id: number, x: number, y: number): DownResult {
    this.active.set(id, { x, y });
    if (this.isZoomLocked()) {
      if (this.strokeId !== null) return { kind: 'ignore' };
      this.strokeId = id;
      return { kind: 'stroke-start' };
    }
    if (this.gestureIds.length === 2) return { kind: 'ignore' };
    if (this.active.size >= 2) {
      const endStroke = this.strokeId !== null;
      this.strokeId = null;
      this.gestureIds = [...this.active.keys()].slice(-2);
      return { kind: 'gesture-start', endStroke };
    }
    this.strokeId = id;
    return { kind: 'stroke-start' };
  }

  move(id: number, x: number, y: number): 'stroke' | 'gesture' | 'ignore' {
    const p = this.active.get(id);
    if (!p) return 'ignore';
    p.x = x;
    p.y = y;
    if (this.gestureIds.includes(id)) return 'gesture';
    if (id === this.strokeId) return 'stroke';
    return 'ignore';
  }

  up(id: number): { endStroke: boolean } {
    this.active.delete(id);
    if (this.gestureIds.includes(id)) this.gestureIds = [];
    if (id === this.strokeId) {
      this.strokeId = null;
      return { endStroke: true };
    }
    return { endStroke: false };
  }

  gesturePair(): [Pos, Pos] | null {
    if (this.gestureIds.length !== 2) return null;
    const a = this.active.get(this.gestureIds[0]);
    const b = this.active.get(this.gestureIds[1]);
    return a && b ? [{ ...a }, { ...b }] : null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/engine/PointerTracker.ts src/engine/PointerTracker.test.ts
git commit -m "Add Vitest and PointerTracker for touch ownership rules"
```

---

### Task 2: Canvas zoom lock wired into input, App and preferences

**Files:**
- Create: `src/storage/prefs.ts`
- Test: `src/storage/prefs.test.ts`
- Modify: `src/engine/PointerInput.ts` (whole file body, lines 19-153)
- Modify: `src/engine/Viewport.ts:1-38`
- Modify: `src/engine/App.ts:91-113` (state), `:150-157` (handlers), `:199-202` (setState), `:575-582` (gesture)
- Modify: `src/main.ts:45-51`

**Interfaces:**
- Consumes: `PointerTracker` from Task 1.
- Produces: `AppState.zoomLocked: boolean`; `PointerInputHandlers.isZoomLocked: () => boolean`; `Viewport.fitScale: number`; `readBoolPref(key, fallback, storage?)`, `writeBoolPref(key, value, storage?)`, `PREF_ZOOM_LOCKED = 'cb.zoomLocked'`.

- [ ] **Step 1: Write the failing prefs test**

`src/storage/prefs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/storage/prefs.test.ts`
Expected: FAIL, cannot resolve `./prefs`.

- [ ] **Step 3: Implement prefs**

`src/storage/prefs.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/storage/prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite PointerInput to delegate to PointerTracker**

Replace `src/engine/PointerInput.ts` from `export type PointerInputHandlers` to the end of the file with:

```ts
export type PointerInputHandlers = {
  onStrokeStart: StrokeStartHandler;
  onStrokeMove: StrokeMoveHandler;
  onStrokeEnd: StrokeEndHandler;
  onTap?: TapHandler;
  onGesture?: GestureHandler;
  toDoc: (sx: number, sy: number) => { x: number; y: number };
  isPenOnly: () => boolean; // palm-rejection: when true, ignore touch
  // Kid mode: when true, extra fingers never zoom/pan and never interrupt
  // the stroke in progress. See PointerTracker for the rules.
  isZoomLocked: () => boolean;
};

export class PointerInput {
  private tracker: PointerTracker;
  private gestureStartDist = 0;
  private gestureLastCenter = { x: 0, y: 0 };

  constructor(private el: HTMLElement, private h: PointerInputHandlers) {
    this.tracker = new PointerTracker(h.isZoomLocked);
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onUp);
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('pointerleave', this.onUp);
  }

  private toPoint(e: PointerEvent): Point {
    const rect = this.el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const d = this.h.toDoc(sx, sy);
    // Mouse always reports pressure 0.5 when a button is held; treat that as
    // "no pressure data" so it doesn't contaminate the pen sensitivity curve.
    const pressure =
      e.pointerType === 'pen'
        ? (e.pressure > 0 ? e.pressure : 0.5)
        : 0.5;
    return { x: d.x, y: d.y, pressure, t: e.timeStamp };
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);

    // Palm rejection: when pen-only mode is on and we see a touch, drop it.
    if (this.h.isPenOnly() && e.pointerType === 'touch') return;

    const r = this.tracker.down(e.pointerId, e.clientX, e.clientY);
    if (r.kind === 'stroke-start') {
      this.h.onStrokeStart(this.toPoint(e), e);
    } else if (r.kind === 'gesture-start') {
      // Commit whatever was drawn so far instead of leaving a half stroke
      // with a running spray loop and no undo entry.
      if (r.endStroke) this.h.onStrokeEnd(e);
      this.beginGesture();
    }
  };

  private onMove = (e: PointerEvent) => {
    const r = this.tracker.move(e.pointerId, e.clientX, e.clientY);
    if (r === 'gesture') {
      this.updateGesture();
      return;
    }
    if (r !== 'stroke') return;
    e.preventDefault();

    // getCoalescedEvents returns the high-frequency samples the OS batched
    // into this single rAF-aligned pointermove. Without it you get visible
    // angles between samples on 120Hz displays / styluses.
    const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const events = raw.length ? raw : [e];
    this.h.onStrokeMove(events.map((ev) => this.toPoint(ev)), e);
  };

  private onUp = (e: PointerEvent) => {
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    // pointerleave follows pointerup for the same pointer; only the first
    // one counts.
    if (!this.tracker.has(e.pointerId)) return;
    if (this.tracker.up(e.pointerId).endStroke) this.h.onStrokeEnd(e);
  };

  private beginGesture() {
    const pair = this.tracker.gesturePair();
    if (!pair) return;
    const [a, b] = pair;
    this.gestureStartDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.gestureLastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private updateGesture() {
    const pair = this.tracker.gesturePair();
    if (!pair) return;
    const [a, b] = pair;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const dscale = this.gestureStartDist > 0 ? dist / this.gestureStartDist : 1;
    const dx = center.x - this.gestureLastCenter.x;
    const dy = center.y - this.gestureLastCenter.y;

    this.h.onGesture?.({ dx, dy, dscale, cx: center.x, cy: center.y });

    this.gestureStartDist = dist;
    this.gestureLastCenter = center;
  }
}
```

Add at the top of the file: `import { PointerTracker } from './PointerTracker';`. Delete the now-unused `ActivePointer` type.

- [ ] **Step 6: Viewport remembers the fit scale**

In `src/engine/Viewport.ts`, add a field after `ty = 0;`:

```ts
  // Scale chosen by the last fit(). Zooming never goes below it, so the
  // picture can't shrink into a corner and get lost.
  fitScale = 1;
```

At the end of `fit()`, after `this.ty = ...`, add `this.fitScale = this.scale;`.

- [ ] **Step 7: App state and gesture handling**

In `src/engine/App.ts`:
- `AppState`: add `zoomLocked: boolean;` after `penOnly: boolean;`.
- Initial `state`: add `zoomLocked: true,` after `penOnly: false,`.
- `new PointerInput(...)` handlers: add `isZoomLocked: () => this.state.zoomLocked,` after `isPenOnly`.
- Replace `setState` with:

```ts
  setState(patch: Partial<AppState>) {
    const wasLocked = this.state.zoomLocked;
    this.state = { ...this.state, ...patch };
    // Re-locking snaps the picture back to fit so a parent's zoom-in never
    // leaves the child with a cropped page.
    if (!wasLocked && this.state.zoomLocked) this.fitToWindow();
    this.listeners.forEach((l) => l(this.state));
  }
```

- Replace `handleGesture` body:

```ts
  private handleGesture(g: { dx: number; dy: number; dscale: number; cx: number; cy: number }) {
    if (this.state.zoomLocked) return;
    const rect = this.displayCanvas.getBoundingClientRect();
    const sx = g.cx - rect.left;
    const sy = g.cy - rect.top;
    this.viewport.pan(g.dx, g.dy);
    this.viewport.zoomAt(sx, sy, g.dscale, this.viewport.fitScale);
    this.scheduleRender();
  }
```

- [ ] **Step 8: Load the saved preference at boot**

In `src/main.ts`, add `import { PREF_ZOOM_LOCKED, readBoolPref } from './storage/prefs';` and add `zoomLocked: readBoolPref(PREF_ZOOM_LOCKED, true),` to the boot `app.setState({...})` call.

- [ ] **Step 9: Verify**

Run: `npm test && npm run build`
Expected: all tests PASS; build completes with no type errors.

Manual: `npm run dev`, open Chrome DevTools device mode (iPad, touch). With two simulated touches (or on a touch laptop) the picture must not zoom. Drawing still works.

- [ ] **Step 10: Commit**

```bash
git add src/storage/prefs.ts src/storage/prefs.test.ts src/engine/PointerInput.ts src/engine/Viewport.ts src/engine/App.ts src/main.ts
git commit -m "Lock canvas zoom by default and ignore extra fingers while drawing"
```

---

### Task 3: Block whole-page zoom on iPad and respect safe areas

**Files:**
- Modify: `src/ui/styles.css:2-21` (html/body), `.kid-topbar` (line 55), `.kid-palette` (188), `.kid-dock` (235), the `@media (max-width: 600px)` block (around line 807)
- Modify: `src/main.ts:19`

- [ ] **Step 1: CSS touch-action and safe areas**

In `src/ui/styles.css`, add inside the `html, body { ... }` rule:

```css
  /* No double-tap zoom or pinch zoom on the chrome around the canvas.
     iOS ignores user-scalable=no, so this (plus the gesture* handlers in
     main.ts) is what actually keeps the page at 100%. */
  touch-action: manipulation;
```

Add a new rule after `#app { ... }`:

```css
/* Everything that is not the canvas: pan-free, zoom-free taps only. */
.kid-topbar, .kid-palette, .kid-dock, .modal-overlay {
  touch-action: manipulation;
}
```

Change positions to include safe-area insets:
- `.kid-topbar`: `top: calc(16px + env(safe-area-inset-top, 0px)); left: calc(16px + env(safe-area-inset-left, 0px)); right: calc(16px + env(safe-area-inset-right, 0px));`
- `.kid-palette`: `left: calc(16px + env(safe-area-inset-left, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));`
- `.kid-dock`: `right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));`
- In `@media (max-width: 600px)`: replace the `8px` values for `.kid-topbar` top/left/right, `.kid-palette` left, `.kid-dock` right with the same `calc(8px + env(safe-area-inset-*, 0px))` form.

(`top: 100px` of palette and dock stays; `App.fitToWindow` measures the real panel rectangles, so the canvas insets follow automatically.)

- [ ] **Step 2: Block Safari pinch gestures**

In `src/main.ts`, below the `contextmenu` listener (line 19), add:

```ts
// iPad Safari fires its own gesture* events for pinch zoom on the page,
// even with user-scalable=no. Cancelling them keeps the whole app at 100%
// when a child pinches the toolbar or a dialog.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: PASS.
Manual: in Chrome device mode (iPad Pro), layout is unchanged; double-clicking a toolbar button does not zoom.

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles.css src/main.ts
git commit -m "Block page zoom gestures on iPad and respect safe-area insets"
```

---

### Task 4: Modal dismiss always resolves dialogs

**Files:**
- Modify: `src/ui/Modal.ts:1-33`, `:77-97`, `:135-146`

**Interfaces:**
- Produces: `showModal(title, body, opts?: { narrow?: boolean; onDismiss?: () => void }): () => void`. `onDismiss` runs when the user closes via the × button or the backdrop (not when the returned destroy function is called by code).

- [ ] **Step 1: Add onDismiss to showModal**

Replace the top of `src/ui/Modal.ts` through the end of `showModal` with:

```ts
export type ModalOptions = {
  narrow?: boolean;
  // Called when the user closes the modal with the × button or by tapping
  // the backdrop. Dialog helpers use it to settle their promise, so callers
  // never wait forever on a dismissed dialog.
  onDismiss?: () => void;
};

export function showModal(title: string, body: HTMLElement, opts: ModalOptions = {}): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal' + (opts.narrow ? ' is-narrow' : '');

  const head = document.createElement('div');
  head.className = 'modal-head';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  const close = document.createElement('button');
  close.className = 'tool';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => dismiss());
  head.append(titleEl, close);

  card.append(head, body);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.body.appendChild(overlay);

  let removed = false;
  function destroy() {
    if (removed) return;
    removed = true;
    overlay.remove();
  }
  function dismiss() {
    if (removed) return;
    destroy();
    opts.onDismiss?.();
  }
  return destroy;
}
```

- [ ] **Step 2: Wire dialogs**

In `promptDialog`, change `const destroy = showModal(opts.title, body, { narrow: true });` to:

```ts
    const destroy = showModal(opts.title, body, { narrow: true, onDismiss: () => finish(null) });
```

In `confirmDialog`, change the same line to:

```ts
    const destroy = showModal(opts.title, body, { narrow: true, onDismiss: () => finish(false) });
```

(`finish` calls `destroy()` again; the `removed` guard makes that a no-op.)

- [ ] **Step 3: Fix the AI save toast after a cancelled name prompt**

In `src/main.ts` `offerSaveToGallery`, replace the `if (name === null) { ... return; }` block with:

```ts
    if (name === null) {
      // Cancelled: give the toast a fresh few seconds, then let it go.
      autoTimer = window.setTimeout(dismiss, 4000);
      return;
    }
```

and change `const autoTimer = window.setTimeout(dismiss, 8000);` to `let autoTimer = window.setTimeout(dismiss, 8000);` (move the declaration above `dismiss` so the closure reads the current timer):

```ts
  let dismissed = false;
  // Auto-dismiss after 8s: long enough to read and decide, short enough
  // not to clutter once the kid is back to coloring.
  let autoTimer = 0;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoTimer);
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 250);
  };
  autoTimer = window.setTimeout(dismiss, 8000);
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: PASS.
Manual: Settings → Save → tap backdrop of the name prompt; the dialog closes and no stuck state remains (Save can be tapped again).

- [ ] **Step 5: Commit**

```bash
git add src/ui/Modal.ts src/main.ts
git commit -m "Resolve dialogs when dismissed via close button or backdrop"
```

---

### Task 5: Parent gate (hold to open) and Settings additions

**Files:**
- Create: `src/ui/holdGate.ts`
- Test: `src/ui/holdGate.test.ts`
- Modify: `src/ui/KidUI.ts:141-148` (AI button), `:188-208` (gear, fullscreen), `:326-369` (settings)
- Modify: `src/ui/styles.css` (append hold-ring styles)

**Interfaces:**
- Consumes: `showModal` (Task 4), `writeBoolPref`, `PREF_ZOOM_LOCKED` (Task 2), `AppState.zoomLocked` (Task 2).
- Produces: `class HoldTimer(ms: number, onFire: () => void, clock?: HoldClock)` with `press(): void`, `release(): 'fired' | 'short'`, `progress(now?: number): number`; `holdToActivate(btn: HTMLElement, onActivate: () => void, ms?: number, shouldGate?: () => boolean): void`; `HOLD_MS = 2000`.

- [ ] **Step 1: Write the failing test**

`src/ui/holdGate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/holdGate.test.ts`
Expected: FAIL, cannot resolve `./holdGate`.

- [ ] **Step 3: Implement holdGate**

`src/ui/holdGate.ts`:

```ts
// Parent gate: a button that only acts after a 2-second press-and-hold.
// Toddlers tap; grown-ups can hold. A ring fills around the button while
// held, and a quick tap shows a short hint so parents learn the gesture.

export const HOLD_MS = 2000;

export type HoldClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

const realClock: HoldClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export class HoldTimer {
  private startedAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;

  constructor(private ms: number, private onFire: () => void, private clock: HoldClock = realClock) {}

  press() {
    this.cancelTimer();
    this.fired = false;
    this.startedAt = this.clock.now();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.fired = true;
      this.onFire();
    }, this.ms);
  }

  release(): 'fired' | 'short' {
    this.cancelTimer();
    this.startedAt = null;
    return this.fired ? 'fired' : 'short';
  }

  progress(now = this.clock.now()): number {
    if (this.startedAt === null) return 0;
    return Math.min(1, Math.max(0, (now - this.startedAt) / this.ms));
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// Wire a button as a hold-to-activate control. The button's normal click is
// swallowed; only a completed hold calls onActivate.
// `shouldGate` lets a button gate only some of the time (fullscreen: entering
// is a plain tap, leaving needs the hold); the hint shows only while gated.
export function holdToActivate(
  btn: HTMLElement,
  onActivate: () => void,
  ms = HOLD_MS,
  shouldGate: () => boolean = () => true,
): void {
  btn.classList.add('kid-hold');
  const ring = document.createElement('span');
  ring.className = 'kid-hold-ring';
  btn.appendChild(ring);

  let raf = 0;
  const timer = new HoldTimer(ms, () => {
    ring.style.setProperty('--p', '1');
    onActivate();
  });
  const tick = () => {
    ring.style.setProperty('--p', String(timer.progress()));
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    ring.style.setProperty('--p', '0');
    btn.classList.remove('is-holding');
    if (timer.release() === 'short' && shouldGate()) showHint(btn);
  };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('is-holding');
    timer.press();
    raf = requestAnimationFrame(tick);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  // Keyboard users (parents on a laptop) can still activate with Enter/Space.
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
  btn.addEventListener('click', (e) => e.preventDefault());
}

function showHint(anchor: HTMLElement) {
  document.querySelector('.kid-hold-hint')?.remove();
  const hint = document.createElement('div');
  hint.className = 'kid-hold-hint';
  hint.textContent = 'Grown-ups: press and hold';
  const r = anchor.getBoundingClientRect();
  hint.style.top = `${Math.round(r.bottom + 8)}px`;
  hint.style.left = `${Math.round(r.left + r.width / 2)}px`;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 1800);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/holdGate.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Hold-ring styles**

Append to `src/ui/styles.css`:

```css
/* ---------- Parent gate (press and hold) ---------- */
.kid-hold { position: relative; }
.kid-hold-ring {
  --p: 0;
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  pointer-events: none;
  background: conic-gradient(#ff6b9d calc(var(--p) * 360deg), transparent 0);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
}
.kid-hold-hint {
  position: fixed;
  transform: translateX(-50%);
  z-index: 1000;
  background: #2a2a3a;
  color: #fff;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
}
.kid-guide { display: grid; gap: 8px; font-size: 14px; line-height: 1.45; }
.kid-guide h3 { margin: 4px 0 0; font-size: 15px; }
.kid-guide p { margin: 0; }
```

- [ ] **Step 6: Gate the gear, AI and fullscreen buttons**

In `src/ui/KidUI.ts`, add `import { holdToActivate } from './holdGate';` and `import { PREF_ZOOM_LOCKED, writeBoolPref } from '../storage/prefs';`.

- AI button: replace `aiBtn.addEventListener('click', () => actions.onAiGenerate());` with `holdToActivate(aiBtn, () => actions.onAiGenerate());`.
- Gear: replace `gear.addEventListener('click', () => openSettings(app, actions));` with `holdToActivate(gear, () => openSettings(app, actions));`.
- Fullscreen: leave as-is in this task; Task 6 replaces it.

- [ ] **Step 7: Settings gains "Allow zoom" and "Lock this tablet"**

In `openSettings`, after the `Stylus only` toggle row, add:

```ts
  body.appendChild(
    toggleRow('Allow zoom', !app.state.zoomLocked, (v) => {
      app.setState({ zoomLocked: !v });
      writeBoolPref(PREF_ZOOM_LOCKED, !v);
    }),
  );
```

After `body.appendChild(actionsRow);` add:

```ts
  const guideSep = document.createElement('div');
  guideSep.className = 'kid-sep';
  body.append(guideSep, lockGuide());
```

Add this function below `openSettings`:

```ts
// Parent guide for the swipes a web page cannot block. Menu names differ
// between OS versions, so the text says where to look instead of promising
// an exact path.
function lockGuide(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'kid-guide';
  el.innerHTML = `
    <strong>Lock this tablet</strong>
    <p>The swipes that leave the app belong to the tablet, so the app can't block them. These tablet settings can:</p>
    <h3>iPad</h3>
    <p><b>Guided Access</b> keeps the iPad in this app until you enter your code. Turn it on in Settings, Accessibility, Guided Access. Then open Coloring and triple-click the top button (or the Home button) and tap Start.</p>
    <p>Or turn off the four- and five-finger swipes: in Settings, open Multitasking &amp; Gestures (older iPads: Home Screen &amp; Dock, Multitasking) and switch off Gestures.</p>
    <h3>Android</h3>
    <p><b>App pinning</b> keeps the tablet in this app. Turn it on in Settings, Security (sometimes under More security settings), App pinning. Then open the recent-apps view, tap the Coloring icon at the top of its card and choose Pin.</p>
    <p>Tip: install Coloring to the home screen first (Share, Add to Home Screen on iPad; menu, Install app on Android). It then opens full screen.</p>`;
  return el;
}
```

- [ ] **Step 8: Check the guide wording against current vendor help**

Use WebSearch for "Apple support Guided Access iPad" and "Android help pin screen app pinning". If a menu name above differs from the current official wording, update the text to the official wording. If it cannot be verified, keep the general phrasing and note it in the task report.

- [ ] **Step 9: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual: tapping the gear shows "Grown-ups: press and hold" and does not open Settings; holding 2 s opens it. The ring fills while holding. "Allow zoom" on → two-finger pinch zooms; off → picture snaps back to fit. Reload keeps the choice.

- [ ] **Step 10: Commit**

```bash
git add src/ui/holdGate.ts src/ui/holdGate.test.ts src/ui/KidUI.ts src/ui/styles.css
git commit -m "Add press-and-hold parent gate, Allow zoom switch and tablet lock guide"
```

---

### Task 6: Sticky fullscreen, installed-app detection, screen wake lock

**Files:**
- Create: `src/ui/fullscreen.ts`
- Test: `src/ui/fullscreen.test.ts`
- Modify: `src/ui/KidUI.ts:195-208` (fullscreen button) and `:802-823` (remove old `toggleFullscreen`)
- Modify: `src/main.ts` (boot: `initStickyFullscreen`, `keepScreenAwake`)

**Interfaces:**
- Consumes: `holdToActivate` (Task 5).
- Produces: `isFullscreen(): boolean`, `enterFullscreen(): void`, `exitFullscreen(): void`, `onFullscreenChange(fn: () => void): void`, `isInstalledApp(): boolean`, `class StickyFullscreen` with `entered()`, `exitedByParent()`, `lost()`, `shouldReenter(): boolean`, `reentered()`; `initStickyFullscreen(): void`; `keepScreenAwake(): void`.

- [ ] **Step 1: Write the failing test**

`src/ui/fullscreen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { StickyFullscreen } from './fullscreen';

describe('StickyFullscreen', () => {
  it('does nothing until fullscreen was entered once', () => {
    const s = new StickyFullscreen();
    s.lost();
    expect(s.shouldReenter()).toBe(false);
  });

  it('re-enters after an accidental exit, once', () => {
    const s = new StickyFullscreen();
    s.entered();
    s.lost();
    expect(s.shouldReenter()).toBe(true);
    s.reentered();
    expect(s.shouldReenter()).toBe(false);
  });

  it('does not re-enter after the parent exits on purpose', () => {
    const s = new StickyFullscreen();
    s.entered();
    s.exitedByParent();
    s.lost();
    expect(s.shouldReenter()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/fullscreen.test.ts`
Expected: FAIL, cannot resolve `./fullscreen`.

- [ ] **Step 3: Implement fullscreen helpers**

`src/ui/fullscreen.ts`:

```ts
// Fullscreen helpers with the webkit-prefixed fallbacks iPad Safari needs,
// plus "sticky" fullscreen: if fullscreen drops by accident (a swipe, the
// OS), the next tap on the page goes back in. Browsers only allow entering
// fullscreen inside a user gesture, so it can't happen without that tap.

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function enterFullscreen(): void {
  const el = document.documentElement as FsEl;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) void el.webkitRequestFullscreen();
}

export function exitFullscreen(): void {
  const d = document as FsDoc;
  if (d.exitFullscreen && d.fullscreenElement) d.exitFullscreen().catch(() => {});
  else if (d.webkitExitFullscreen) void d.webkitExitFullscreen();
}

export function onFullscreenChange(fn: () => void): void {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}

// Installed to the home screen: the OS already gives a chromeless window
// and the Fullscreen API does nothing useful there.
export function isInstalledApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches
  );
}

export class StickyFullscreen {
  private wanted = false;
  private pending = false;

  entered() { this.wanted = true; this.pending = false; }
  exitedByParent() { this.wanted = false; this.pending = false; }
  lost() { if (this.wanted) this.pending = true; }
  shouldReenter(): boolean { return this.wanted && this.pending; }
  reentered() { this.pending = false; }
}

export const sticky = new StickyFullscreen();

export function initStickyFullscreen(): void {
  onFullscreenChange(() => {
    if (isFullscreen()) sticky.entered();
    else sticky.lost();
  });
  // Capture phase so the re-entry request runs inside the same user gesture
  // even if the canvas handler calls preventDefault.
  document.addEventListener(
    'pointerdown',
    () => {
      if (!sticky.shouldReenter()) return;
      sticky.reentered();
      enterFullscreen();
    },
    { capture: true },
  );
}

// Keep the screen on while the app is visible. Not all browsers support it
// and it can be refused (battery saver); both cases are fine.
export function keepScreenAwake(): void {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<unknown> } };
  if (!nav.wakeLock) return;
  const request = () => { nav.wakeLock!.request('screen').catch(() => {}); };
  request();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') request();
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/fullscreen.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Fullscreen button in KidUI**

In `src/ui/KidUI.ts`, add `import { enterFullscreen, exitFullscreen, isFullscreen, isInstalledApp, onFullscreenChange, sticky } from './fullscreen';`. Replace the fullscreen block (from `const fullscreenBtn = ...` to `rightGroup.appendChild(fullscreenBtn);`) with:

```ts
  // Hidden when installed to the home screen: the app is already
  // chromeless there and the Fullscreen API does nothing.
  if (!isInstalledApp()) {
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'kid-iconbtn kid-fullscreen';
    attachTooltip(fullscreenBtn, 'Fullscreen');
    // Entering is one tap (the child can't get stuck). Leaving needs the
    // parent hold, and a deliberate exit turns sticky fullscreen off.
    fullscreenBtn.addEventListener('click', () => {
      if (!isFullscreen()) enterFullscreen();
    });
    holdToActivateWhen(fullscreenBtn, isFullscreen, () => {
      sticky.exitedByParent();
      exitFullscreen();
    });
    const updateFullscreenIcon = () => {
      const isFs = isFullscreen();
      fullscreenBtn.querySelector('svg')?.remove();
      fullscreenBtn.insertAdjacentHTML('afterbegin', isFs ? fullscreenExitSvg() : fullscreenEnterSvg());
      fullscreenBtn.setAttribute('aria-label', isFs ? 'Exit fullscreen (hold)' : 'Fullscreen');
    };
    updateFullscreenIcon();
    onFullscreenChange(updateFullscreenIcon);
    rightGroup.appendChild(fullscreenBtn);
  }
```

Delete the old `toggleFullscreen` function (lines around 802-823).

`holdToActivate` calls `preventDefault` on `click`, which does not stop other click listeners, so the plain-tap enter handler still runs.

Add a helper below `lockGuide` and import `HOLD_MS` from `./holdGate`:

```ts
// Gate only while `active()` is true. Used by the fullscreen button:
// entering is a plain tap, leaving is a parent hold.
function holdToActivateWhen(btn: HTMLElement, active: () => boolean, onActivate: () => void) {
  holdToActivate(btn, () => { if (active()) onActivate(); }, HOLD_MS, active);
}
```

- [ ] **Step 6: Boot wiring**

In `src/main.ts`, add `import { initStickyFullscreen, keepScreenAwake } from './ui/fullscreen';` and after `root.append(...)` call:

```ts
initStickyFullscreen();
keepScreenAwake();
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual (Chrome desktop): tap Fullscreen → fullscreen. Press Esc → exits; the next click on the canvas re-enters. Hold the fullscreen button 2 s → exits and stays out after further clicks.

- [ ] **Step 8: Commit**

```bash
git add src/ui/fullscreen.ts src/ui/fullscreen.test.ts src/ui/KidUI.ts src/main.ts
git commit -m "Sticky fullscreen with parent-gated exit, hide button in installed app, wake lock"
```

---

### Task 7: Undo memory (dirty-rect commands, byte cap) and Redo button

**Files:**
- Create: `src/engine/dirtyRect.ts`
- Test: `src/engine/dirtyRect.test.ts`
- Test: `src/engine/commands.test.ts`
- Modify: `src/engine/commands.ts` (whole file)
- Modify: `src/engine/App.ts:518-550` (`handleStrokeEnd`)
- Modify: `src/engine/fillClient.ts:93-97`
- Modify: `src/main.ts:55-86` (Clear)
- Modify: `src/ui/KidUI.ts:78-86` (actions type), `:157-164` (Redo button), `:757-771` (redo icon)

**Interfaces:**
- Produces:
  - `type Box = { x: number; y: number; w: number; h: number }`
  - `diffBox(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Box | null`
  - `cropPixels(src: Uint8ClampedArray, width: number, box: Box): Uint8ClampedArray`
  - `interface Command { apply; invert; redo?; bytes?: number }`
  - `class PatchCommand implements Command` constructed as `new PatchCommand(layerId: string, box: Box, before: ImageData, after: ImageData)`, `bytes = before.data.length + after.data.length`
  - `patchFromSnapshots(layerId: string, before: ImageData, after: ImageData): PatchCommand | null` (null when nothing changed)
  - `class History(capacity = 50, maxBytes = 60 * 1024 * 1024)` with existing methods plus `onChange: (() => void) | null`
  - `KidUIActions.onRedo: () => void`

- [ ] **Step 1: Write the failing dirty-rect test**

`src/engine/dirtyRect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cropPixels, diffBox } from './dirtyRect';

const img = (w: number, h: number) => new Uint8ClampedArray(w * h * 4);

describe('diffBox', () => {
  it('returns null for identical buffers', () => {
    expect(diffBox(img(4, 3), img(4, 3), 4, 3)).toBeNull();
  });

  it('finds the tight box around changed pixels', () => {
    const a = img(5, 4);
    const b = img(5, 4);
    b[(1 * 5 + 1) * 4 + 3] = 255; // (1,1) alpha
    b[(2 * 5 + 3) * 4 + 0] = 10; // (3,2) red
    expect(diffBox(a, b, 5, 4)).toEqual({ x: 1, y: 1, w: 3, h: 2 });
  });
});

describe('cropPixels', () => {
  it('copies the rows of the box', () => {
    const src = img(3, 2);
    for (let i = 0; i < src.length; i++) src[i] = i;
    const out = cropPixels(src, 3, { x: 1, y: 0, w: 2, h: 2 });
    expect(Array.from(out)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11,
      16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engine/dirtyRect.test.ts`
Expected: FAIL, cannot resolve `./dirtyRect`.

- [ ] **Step 3: Implement dirtyRect**

`src/engine/dirtyRect.ts`:

```ts
// Find and cut out the rectangle of pixels a stroke or fill actually
// changed. Undo entries keep only that rectangle instead of two full-canvas
// copies (7.7 MB per step at 1200x800), which is what used to push iPad
// Safari over its memory limit after a few dozen strokes.
//
// Diffing the before/after buffers instead of tracking each tool's reach
// keeps this correct for every tool (spray clouds, stamps, blur) at the
// cost of one linear scan (~1M pixels, a few ms) per stroke.

export type Box = { x: number; y: number; w: number; h: number };

export function diffBox(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Box | null {
  const a32 = new Uint32Array(a.buffer, a.byteOffset, width * height);
  const b32 = new Uint32Array(b.buffer, b.byteOffset, width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (a32[row + x] !== b32[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function cropPixels(src: Uint8ClampedArray, width: number, box: Box): Uint8ClampedArray {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let row = 0; row < box.h; row++) {
    const start = ((box.y + row) * width + box.x) * 4;
    out.set(src.subarray(start, start + box.w * 4), row * box.w * 4);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engine/dirtyRect.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing History test**

`src/engine/commands.test.ts`:

```ts
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
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/engine/commands.test.ts`
Expected: FAIL (`History` constructor ignores arguments / no `onChange`, first test fails).

- [ ] **Step 7: Rewrite commands.ts**

Replace `src/engine/commands.ts` with:

```ts
import type { Document } from './Document';
import { cropPixels, diffBox, type Box } from './dirtyRect';

export interface Command {
  apply(doc: Document): void;
  invert(doc: Document): void;
  redo?(doc: Document): void;
  // Approximate memory held by this entry; History uses it for its cap.
  bytes?: number;
}

// Undo entry for any pixel change on one layer (stroke, fill, clear): the
// before/after pixels of just the changed rectangle.
export class PatchCommand implements Command {
  readonly bytes: number;

  constructor(
    public layerId: string,
    public box: Box,
    private before: ImageData,
    private after: ImageData,
  ) {
    this.bytes = before.data.length + after.data.length;
  }

  apply(doc: Document) {
    doc.getLayer(this.layerId)?.ctx.putImageData(this.after, this.box.x, this.box.y);
  }

  invert(doc: Document) {
    doc.getLayer(this.layerId)?.ctx.putImageData(this.before, this.box.x, this.box.y);
  }
}

// Build a PatchCommand from two full-layer snapshots. Returns null when the
// action changed nothing (a tap outside the picture, a fill on the same
// colour), so no empty undo steps pile up.
export function patchFromSnapshots(layerId: string, before: ImageData, after: ImageData): PatchCommand | null {
  const box = diffBox(before.data, after.data, before.width, before.height);
  if (!box) return null;
  const crop = (img: ImageData) =>
    new ImageData(cropPixels(img.data, img.width, box), box.w, box.h);
  return new PatchCommand(layerId, box, crop(before), crop(after));
}

export class History {
  private stack: Command[] = [];
  private redoStack: Command[] = [];
  onChange: (() => void) | null = null;

  constructor(private capacity = 50, private maxBytes = 60 * 1024 * 1024) {}

  push(cmd: Command) {
    this.stack.push(cmd);
    this.redoStack = [];
    while (this.stack.length > this.capacity) this.stack.shift();
    // Drop oldest entries until under the memory cap, but never the newest:
    // the child must always be able to undo the last thing they did.
    while (this.stack.length > 1 && this.totalBytes() > this.maxBytes) this.stack.shift();
    this.onChange?.();
  }

  undo(doc: Document) {
    const cmd = this.stack.pop();
    if (!cmd) return false;
    cmd.invert(doc);
    this.redoStack.push(cmd);
    this.onChange?.();
    return true;
  }

  redo(doc: Document) {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    if (cmd.redo) cmd.redo(doc);
    else cmd.apply(doc);
    this.stack.push(cmd);
    this.onChange?.();
    return true;
  }

  clear() {
    this.stack = [];
    this.redoStack = [];
    this.onChange?.();
  }

  canUndo() { return this.stack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  private totalBytes() {
    let n = 0;
    for (const c of this.stack) n += c.bytes ?? 0;
    for (const c of this.redoStack) n += c.bytes ?? 0;
    return n;
  }
}
```

(`StrokeCommand` and `FillCommand` are removed; their replay path was unused. `renderStroke` import goes away.)

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/engine/commands.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Use PatchCommand at every call site**

`src/engine/App.ts`:
- Import: change `import { History, StrokeCommand } from './commands';` to `import { History, patchFromSnapshots } from './commands';`.
- In `handleStrokeEnd`, replace everything from `const after = ...` through `this.history.push(cmd);` with:

```ts
    const after = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    const cmd = patchFromSnapshots(this.strokeLayerId, this.strokeBefore, after);
    if (cmd) this.history.push(cmd);
```

`src/engine/fillClient.ts`:
- Change import to `import { patchFromSnapshots, type PatchCommand } from './commands';`.
- Change return type to `Promise<PatchCommand | null>` and replace the last four lines of `runFill` with:

```ts
  const cmd = patchFromSnapshots(layerId, before, result);
  // Paint the fill result onto the layer.
  layer.ctx.putImageData(result, 0, 0);
  return cmd;
```

- Remove the now-unused `x, y, color, tolerance` passing to the command (they are still sent to the worker).

`src/engine/App.ts` `runFillAt`: change `this.history.push(cmd);` to `if (cmd) this.history.push(cmd);`.

`src/main.ts` `onClear`: replace the whole handler body with:

```ts
  onClear: () => {
    // Wipe every non-locked layer (the bg and template layers are locked,
    // so the line art stays). No confirmation: a stray tap is recoverable
    // by Undo, which is right next to it.
    for (const layer of app.doc.layers) {
      if (layer.locked) continue;
      const before = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
      layer.clear();
      const after = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
      const cmd = patchFromSnapshots(layer.id, before, after);
      if (cmd) app.history.push(cmd);
    }
    app.scheduleRender();
  },
```

and add `import { patchFromSnapshots } from './engine/commands';`. (There is one paint layer, so this is still a single undo step.)

- [ ] **Step 10: Redo button**

`src/ui/KidUI.ts`:
- `KidUIActions`: add `onRedo: () => void;` after `onUndo`.
- After the Undo button block, add:

```ts
  const redoBtn = document.createElement('button');
  redoBtn.className = 'kid-iconbtn kid-redo-top';
  redoBtn.innerHTML = redoSvg();
  redoBtn.addEventListener('click', () => actions.onRedo());
  attachTooltip(redoBtn, 'Redo');
  leftGroup.appendChild(redoBtn);
```

- Add below `undoSvg()`:

```ts
function redoSvg() {
  // The undo arrow, mirrored.
  return undoSvg().replace('<svg ', '<svg style="transform: scaleX(-1)" ');
}
```

`src/main.ts`: add to the `buildKidUI` actions: `onRedo: () => { if (app.history.redo(app.doc)) app.scheduleRender(); },`.

- [ ] **Step 11: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual: draw 3 strokes, fill 1 area, Clear; Undo 5 times restores step by step; Redo re-applies. In Chrome DevTools → Memory, heap after 50 small strokes stays well under 100 MB.

- [ ] **Step 12: Commit**

```bash
git add src/engine/dirtyRect.ts src/engine/dirtyRect.test.ts src/engine/commands.ts src/engine/commands.test.ts src/engine/App.ts src/engine/fillClient.ts src/main.ts src/ui/KidUI.ts
git commit -m "Store undo steps as changed rectangles with a memory cap; add Redo button"
```

---

### Task 8: Fill correctness (queue, worker errors, alpha compositing)

**Files:**
- Create: `src/engine/SerialQueue.ts`
- Test: `src/engine/SerialQueue.test.ts`
- Create: `src/workers/composite.ts`
- Test: `src/workers/composite.test.ts`
- Modify: `src/workers/floodFill.worker.ts:241-252`
- Modify: `src/engine/fillClient.ts:4-21`, `:56-97`
- Modify: `src/engine/App.ts:292-297`, `:561-573`

**Interfaces:**
- Consumes: `patchFromSnapshots`, `PatchCommand` (Task 7).
- Produces: `class SerialQueue` with `run<T>(task: () => Promise<T>): Promise<T>` and `get pending(): number`; `compositeCoverage(dst: Uint8ClampedArray, coverage: Uint8Array, color: {r,g,b,a}): void`.

- [ ] **Step 1: Write failing tests**

`src/engine/SerialQueue.test.ts`:

```ts
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
```

`src/workers/composite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compositeCoverage } from './composite';

describe('compositeCoverage (straight alpha "over")', () => {
  it('full coverage writes the fill colour', () => {
    const dst = new Uint8ClampedArray([0, 0, 0, 0]);
    compositeCoverage(dst, new Uint8Array([255]), { r: 200, g: 100, b: 50, a: 255 });
    expect(Array.from(dst)).toEqual([200, 100, 50, 255]);
  });

  it('half coverage on a transparent pixel keeps the colour, halves alpha', () => {
    const dst = new Uint8ClampedArray([0, 0, 0, 0]);
    compositeCoverage(dst, new Uint8Array([128]), { r: 200, g: 100, b: 50, a: 255 });
    expect(Array.from(dst)).toEqual([200, 100, 50, 128]);
  });

  it('half coverage over an opaque pixel blends the colours', () => {
    const dst = new Uint8ClampedArray([0, 0, 255, 255]);
    compositeCoverage(dst, new Uint8Array([128]), { r: 255, g: 0, b: 0, a: 255 });
    expect(Array.from(dst)).toEqual([128, 0, 127, 255]);
  });

  it('zero coverage leaves the pixel alone', () => {
    const dst = new Uint8ClampedArray([1, 2, 3, 4]);
    compositeCoverage(dst, new Uint8Array([0]), { r: 255, g: 0, b: 0, a: 255 });
    expect(Array.from(dst)).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/engine/SerialQueue.test.ts src/workers/composite.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement SerialQueue and compositeCoverage**

`src/engine/SerialQueue.ts`:

```ts
// Runs async tasks strictly one after another. Fills go through this so
// each fill starts from the pixels the previous fill produced; two quick
// taps used to race and the second erased the first.
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private count = 0;

  get pending(): number {
    return this.count;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.count++;
    const result = this.tail.then(task);
    this.tail = result.catch(() => {}).finally(() => { this.count--; });
    return result;
  }
}
```

`src/workers/composite.ts`:

```ts
// Composite a fill's coverage mask onto straight-alpha RGBA pixels with the
// Porter-Duff "over" operator. The old inline version mixed colour channels
// as if they were premultiplied, so partly covered pixels on a transparent
// layer came out darkened (visible dark fringes along strokes).
export function compositeCoverage(
  dst: Uint8ClampedArray,
  coverage: Uint8Array,
  color: { r: number; g: number; b: number; a: number },
): void {
  for (let i = 0, p = 0; i < coverage.length; i++, p += 4) {
    const cov = coverage[i];
    if (cov === 0) continue;
    const sa = (cov / 255) * (color.a / 255);
    const da = dst[p + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) continue;
    const k = (da * (1 - sa)) / outA;
    const s = sa / outA;
    dst[p] = Math.round(color.r * s + dst[p] * k);
    dst[p + 1] = Math.round(color.g * s + dst[p + 1] * k);
    dst[p + 2] = Math.round(color.b * s + dst[p + 2] * k);
    dst[p + 3] = Math.round(outA * 255);
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/engine/SerialQueue.test.ts src/workers/composite.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Use compositeCoverage in the worker**

In `src/workers/floodFill.worker.ts`, add `import { compositeCoverage } from './composite';` at the top, and replace the final compositing loop (the `for (let i = 0, p = 0; i < visited.length; ...)` block, lines ~243-252) with:

```ts
  compositeCoverage(dst, visited, color);
```

Before editing, confirm `visited` is a `Uint8Array` (search for `const visited`). If it is a different typed array, change the `coverage` parameter type in `composite.ts` to `ArrayLike<number>`.

- [ ] **Step 6: Queue fills and handle worker errors in fillClient**

In `src/engine/fillClient.ts`, replace lines 4-21 (worker + pending map) with:

```ts
let worker: Worker | null = null;
const pending = new Map<string, { resolve: (img: ImageData) => void; reject: (e: unknown) => void }>();
const queue = new SerialQueue();

// Fills in flight or waiting. The App ignores new strokes while > 0 so a
// stroke can't be overwritten by a fill result computed before it.
export const fillsPending = () => queue.pending;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/floodFill.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<{ id: string; result: ImageData }>) => {
      const p = pending.get(e.data.id);
      if (p) {
        pending.delete(e.data.id);
        p.resolve(e.data.result);
      }
    };
    // A crashed worker would otherwise leave the fill promise pending
    // forever and the fill tool dead. Fail the waiting fills and start a
    // fresh worker on the next tap.
    const fail = (err: unknown) => {
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    worker.onerror = (e) => fail(e);
    worker.onmessageerror = (e) => fail(e);
  }
  return worker;
}
```

Add `import { SerialQueue } from './SerialQueue';`. Rename the existing `runFill` to `runFillNow` (not exported), change its promise to register `{ resolve, reject }`:

```ts
  const result = await new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(/* unchanged payload */);
  });
```

and add the exported wrapper:

```ts
export function runFill(
  doc: Document,
  layerId: string,
  x: number,
  y: number,
  color: string,
  tolerance = 28,
): Promise<PatchCommand | null> {
  // `before` is read inside the queued task, after earlier fills landed.
  return queue.run(() => runFillNow(doc, layerId, x, y, color, tolerance));
}
```

- [ ] **Step 7: App ignores strokes while a fill is pending, survives fill errors**

In `src/engine/App.ts`, import `fillsPending` alongside `runFill`. At the start of `handleStrokeStart`, after the `fill` branch:

```ts
    // A fill result is computed from a snapshot; a stroke drawn before it
    // lands would be overwritten. Fills take well under a second.
    if (fillsPending() > 0) return;
```

Replace `runFillAt`'s try/finally with:

```ts
    this.setState({ busy: true });
    try {
      const cmd = await runFill(this.doc, layer.id, p.x, p.y, this.state.color, 28);
      if (cmd) this.history.push(cmd);
      this.scheduleRender();
    } catch (e) {
      console.error('Fill failed', e);
    } finally {
      this.setState({ busy: fillsPending() > 0 });
    }
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual: with the Fill tool, tap 5 different regions rapidly; all 5 stay coloured and Undo removes them one by one. Brush a circle, fill inside: no dark ring along the inner edge.

- [ ] **Step 9: Commit**

```bash
git add src/engine/SerialQueue.ts src/engine/SerialQueue.test.ts src/workers/composite.ts src/workers/composite.test.ts src/workers/floodFill.worker.ts src/engine/fillClient.ts src/engine/App.ts
git commit -m "Serialize fills, recover from worker errors, fix fill edge compositing"
```

---

### Task 9: Autosave and restore

**Files:**
- Create: `src/storage/autosave.ts`
- Test: `src/storage/autosave.test.ts`
- Modify: `src/storage/db.ts:11-14` (schema), `:47-65` (DB v3), plus new functions at the end
- Modify: `src/main.ts:117-135` (boot + beforeunload)

**Interfaces:**
- Consumes: `History.onChange` (Task 7).
- Produces:
  - `class AutosaveScheduler(save: () => Promise<void>, delayMs = 3000, clock?)` with `markDirty(): void`, `flushNow(): Promise<void>`
  - `isValidAutosave(x: unknown): x is StoredDocument`
  - `saveAutosave(doc: Document): Promise<void>`, `loadAutosave(): Promise<StoredDocument | undefined>` in `db.ts`

- [ ] **Step 1: Write the failing test**

`src/storage/autosave.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/storage/autosave.test.ts`
Expected: FAIL, cannot resolve `./autosave`.

- [ ] **Step 3: Implement autosave.ts**

`src/storage/autosave.ts`:

```ts
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
  return r.layers.every((l) => l && typeof l.id === 'string' && 'blob' in l);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/storage/autosave.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Autosave store in IndexedDB**

In `src/storage/db.ts`:
- Schema: add `autosave: { key: string; value: StoredDocument };`.
- `openDB('coloring-book', 2, ...)` → version `3`; in `upgrade` add:

```ts
        // v3: single-record store for the always-on autosave. Kept apart
        // from `documents` so it never shows up in "My projects".
        if (!db.objectStoreNames.contains('autosave')) {
          db.createObjectStore('autosave');
        }
```

- Refactor: extract the layer-serialising body of `saveDocument` into `async function toStored(doc: Document): Promise<StoredDocument>` and use it from `saveDocument`.
- Append:

```ts
// ---------- Autosave (current drawing) ----------

const AUTOSAVE_KEY = 'current';

export async function saveAutosave(doc: Document): Promise<void> {
  const db = await getDb();
  await db.put('autosave', (await toStored(doc)) as never, AUTOSAVE_KEY);
}

export async function loadAutosave(): Promise<StoredDocument | undefined> {
  const db = await getDb();
  return (await db.get('autosave', AUTOSAVE_KEY)) as StoredDocument | undefined;
}

// Ask the browser not to evict our data under storage pressure (Safari
// clears site data for sites it considers unused). Best effort only.
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {});
}
```

- [ ] **Step 6: Boot restores the autosave; changes schedule saves**

In `src/main.ts`:
- Imports: add `saveAutosave, loadAutosave, requestPersistentStorage` from `./storage/db`, and `AutosaveScheduler, isValidAutosave` from `./storage/autosave`.
- Replace the boot block from `// Boot with a blank canvas` through the `beforeunload` listener with:

```ts
// ----- Autosave -----

const autosave = new AutosaveScheduler(() => saveAutosave(app.doc));
app.history.onChange = () => autosave.markDirty();
const flush = () => { void autosave.flushNow(); };
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', flush);
requestPersistentStorage();

// Boot: bring back the last drawing if there is one, otherwise a blank page.
// The blank template only loads if the child hasn't started drawing in the
// meantime (history still empty), so an early stroke is never wiped.
void (async () => {
  try {
    const saved = await loadAutosave();
    if (isValidAutosave(saved)) {
      await applyStoredDocument(app.doc, saved);
      app.history.clear();
      app.scheduleRender();
      return;
    }
  } catch (e) {
    console.error('Could not restore autosave', e);
  }
  try {
    const tpls = await loadManifest();
    const blank = tpls.find((t) => t.id === 'blank') ?? tpls[0];
    if (blank && !app.history.canUndo()) await loadTemplate(blank);
  } catch (e) {
    console.error(e);
  }
})();
```

(`app.history.clear()` fires `onChange` and marks dirty; the resulting save rewrites the same drawing, which is harmless. Named projects are still saved only via Save.)

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual: draw something, wait 4 s, reload → drawing is back. Draw, then immediately switch tabs and reload → drawing is back. In DevTools → Application → IndexedDB, `coloring-book` v3 has an `autosave` store with key `current`.

- [ ] **Step 8: Commit**

```bash
git add src/storage/autosave.ts src/storage/autosave.test.ts src/storage/db.ts src/main.ts
git commit -m "Autosave the current drawing and restore it at launch"
```

---

### Task 10: Safe picture switching (fresh project, undoable)

**Files:**
- Create: `src/engine/SwitchPictureCommand.ts`
- Test: `src/engine/SwitchPictureCommand.test.ts`
- Modify: `src/main.ts` `loadTemplate` (150-169), `loadAiTemplate` (175-184), `loadGeneratedImage` (192-221)

**Interfaces:**
- Consumes: `History`, `Command` (Task 7), `autosave` (Task 9), `newId` from `./engine/Document`.
- Produces: `captureLayers(doc: Document, ids: string[]): Map<string, ImageData>`; `class SwitchPictureCommand(before: Map<string, ImageData>, after: Map<string, ImageData>, beforeTemplateId?: string, afterTemplateId?: string)`; `freshMeta(meta: DocumentMeta, now: number): DocumentMeta`; in `main.ts`: `switchPicture(draw: () => Promise<void>, templateId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`src/engine/SwitchPictureCommand.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SwitchPictureCommand, freshMeta } from './SwitchPictureCommand';
import type { Document } from './Document';

// Minimal fake: layers whose ctx records the last putImageData argument.
const fakeDoc = () => {
  const put: Record<string, unknown> = {};
  const layer = (id: string) => ({ id, ctx: { putImageData: (img: unknown) => { put[id] = img; } } });
  const doc = { layers: [layer('paint'), layer('art')], getLayer(id: string) { return this.layers.find((l) => l.id === id); }, meta: { templateId: 'dog' } };
  return { doc: doc as unknown as Document, put };
};

describe('SwitchPictureCommand', () => {
  it('invert restores the before pixels and template id; redo re-applies', () => {
    const { doc, put } = fakeDoc();
    const before = new Map([['paint', 'P0' as unknown as ImageData], ['art', 'A0' as unknown as ImageData]]);
    const after = new Map([['paint', 'P1' as unknown as ImageData], ['art', 'A1' as unknown as ImageData]]);
    const cmd = new SwitchPictureCommand(before, after, 'cat', 'dog');
    cmd.invert(doc);
    expect(put).toEqual({ paint: 'P0', art: 'A0' });
    expect(doc.meta.templateId).toBe('cat');
    cmd.apply(doc);
    expect(put).toEqual({ paint: 'P1', art: 'A1' });
    expect(doc.meta.templateId).toBe('dog');
  });
});

describe('freshMeta', () => {
  it('gives a new id and the Untitled name, keeps the size', () => {
    const m = freshMeta({ id: 'doc_old', name: 'Cat 9/28', width: 1200, height: 800, createdAt: 1, updatedAt: 2 }, 50);
    expect(m.id).not.toBe('doc_old');
    expect(m.name).toBe('Untitled');
    expect(m).toMatchObject({ width: 1200, height: 800, createdAt: 50, updatedAt: 50 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engine/SwitchPictureCommand.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/engine/SwitchPictureCommand.ts`:

```ts
import type { Command } from './commands';
import type { Document } from './Document';
import { newId } from './Document';
import type { DocumentMeta } from '../types/document';

// Picking a new picture replaces both the line art and the paint. This
// command makes that one undo step, so a child who taps a thumbnail by
// accident can get their drawing back with Undo.
//
// It restores pixels and the template id only; the document keeps the new
// id and name, so an undo can never cause a Save to overwrite the old
// project either.
export class SwitchPictureCommand implements Command {
  readonly bytes: number;

  constructor(
    private before: Map<string, ImageData>,
    private after: Map<string, ImageData>,
    private beforeTemplateId?: string,
    private afterTemplateId?: string,
  ) {
    let n = 0;
    for (const m of [before, after]) for (const img of m.values()) n += img.data?.length ?? 0;
    this.bytes = n;
  }

  apply(doc: Document) {
    this.put(doc, this.after);
    doc.meta.templateId = this.afterTemplateId;
  }

  invert(doc: Document) {
    this.put(doc, this.before);
    doc.meta.templateId = this.beforeTemplateId;
  }

  private put(doc: Document, pixels: Map<string, ImageData>) {
    for (const [id, img] of pixels) doc.getLayer(id)?.ctx.putImageData(img, 0, 0);
  }
}

export function captureLayers(doc: Document, ids: string[]): Map<string, ImageData> {
  const out = new Map<string, ImageData>();
  for (const id of ids) {
    const l = doc.getLayer(id);
    if (l) out.set(id, l.ctx.getImageData(0, 0, l.canvas.width, l.canvas.height));
  }
  return out;
}

export function freshMeta(meta: DocumentMeta, now: number): DocumentMeta {
  return { ...meta, id: newId('doc'), name: 'Untitled', createdAt: now, updatedAt: now };
}
```

Check `src/types/document.ts` for the exact `DocumentMeta` fields (`templateId` optional). If `templateId` is typed `string | undefined`, the constructor types above already match.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engine/SwitchPictureCommand.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Route all three picture loaders through switchPicture**

In `src/main.ts`, add imports `import { SwitchPictureCommand, captureLayers, freshMeta } from './engine/SwitchPictureCommand';` and add this helper above `loadTemplate`:

```ts
// Shared path for every "new picture" action (template, saved AI picture,
// fresh AI picture):
// 1. autosave the current drawing first,
// 2. draw the new line art and clear the paint,
// 3. make it a new untitled project, so Save can't overwrite the old one,
// 4. record one undo step that restores the previous pixels.
async function switchPicture(draw: () => Promise<void>, templateId: string) {
  await autosave.flushNow();
  const paint = app.doc.layers.find((l) => !l.locked && l.id !== app.doc.templateLayerId);
  const ids = [app.doc.templateLayerId, ...(paint ? [paint.id] : [])];
  const before = captureLayers(app.doc, ids);
  const beforeTemplateId = app.doc.meta.templateId;

  await draw();
  paint?.clear();
  app.doc.meta = { ...freshMeta(app.doc.meta, Date.now()), templateId };

  const after = captureLayers(app.doc, ids);
  app.history.push(new SwitchPictureCommand(before, after, beforeTemplateId, templateId));
  app.scheduleRender();
}
```

Rewrite the loaders:

```ts
async function loadTemplate(tpl: Template) {
  const w = app.doc.meta.width;
  const h = app.doc.meta.height;
  const layer = app.doc.getLayer(app.doc.templateLayerId);
  if (!layer) return;
  // Rasterize before touching the canvas so a slow or failed load never
  // leaves a half-switched picture.
  const bmp = tpl.file ? await rasterizeTemplate(tpl, w, h) : null;
  await switchPicture(async () => {
    layer.clear();
    if (bmp) {
      layer.ctx.drawImage(bmp, 0, 0);
      bmp.close();
    }
  }, tpl.id);
}

async function loadAiTemplate(ai: AiTemplateRecord) {
  const layer = app.doc.getLayer(app.doc.templateLayerId);
  if (!layer) return;
  await switchPicture(() => layer.loadFromBlob(ai.blob), `ai:${ai.id}`);
}
```

In `loadGeneratedImage`, replace from `layer.clear();` through `app.scheduleRender();` with:

```ts
  await switchPicture(async () => {
    layer.clear();
    layer.ctx.drawImage(processed!, 0, 0);
    processed!.close();
  }, `ai:${Date.now()}`);
  // Snapshot the just-drawn line-art layer as a PNG blob. This is what we
  // persist if the user taps "Save to my pictures": saving the processed
  // bytes means a re-load doesn't re-process or re-call the API.
  const processedBlob = await layer.toBlob();
```

(Keep the `offerSaveToGallery(processedBlob, prompt);` call after it.)

The boot blank-template load (Task 9) also goes through `loadTemplate`; that adds one undo step on a blank page, which is harmless (undo returns the same blank page). To keep the boot history clean, call `app.history.clear()` right after `await loadTemplate(blank);` in the boot block.

Opening a saved project (`openProjects` → Open) keeps its own id; that is correct (it is the same project), no change.

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual: Save a drawing as "Cat test". Pick another picture from Pictures, Undo → the cat drawing is back. Pick Dog again, Save → a name prompt appears (new project), and "Cat test" in My projects is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/engine/SwitchPictureCommand.ts src/engine/SwitchPictureCommand.test.ts src/main.ts
git commit -m "Make picture switching undoable and start a new untitled project"
```

---

### Task 11: AI dialog cancels on close, no autofocus

**Files:**
- Modify: `src/ui/AiPromptDialog.ts:91`, `:185-203`, `:226-228`

**Interfaces:**
- Consumes: `showModal(..., { onDismiss })` (Task 4); `generateColoringImage(prompt, signal?)` (existing, `src/ai/generate.ts`).

- [ ] **Step 1: Abort on dismiss**

In `openAiPromptDialog`:
- Replace `const destroy = showModal('Make a picture', body, { narrow: true });` with:

```ts
  // Closing the dialog cancels everything: a late picture must never
  // replace what the child has started colouring in the meantime.
  let aborter: AbortController | null = null;
  let closed = false;
  const destroy = showModal('Make a picture', body, {
    narrow: true,
    onDismiss: () => {
      closed = true;
      aborter?.abort();
      recognition?.abort();
    },
  });
```

  Move the `let recognition: SpeechRecognitionLike | null = null;` declaration above this block (it is currently declared later at line 112; TypeScript requires declaration before the closure runs, which it is at dismiss time, but moving it keeps it readable and avoids a TDZ error if dismiss fires during setup).

- Replace `submit()` with:

```ts
  async function submit() {
    if (inFlight) return;
    const prompt = input.value.trim();
    if (!prompt) return;
    inFlight = true;
    setLoading(true);
    aborter = new AbortController();
    try {
      const bitmap = await generateColoringImage(prompt, aborter.signal);
      if (closed) {
        bitmap.close();
        return;
      }
      await opts.onGenerated(bitmap, prompt);
      destroy();
    } catch (e) {
      if (closed) return;
      const msg = e instanceof GenerateError ? e.message : 'Something went wrong. Try again.';
      showError(msg);
    } finally {
      aborter = null;
      inFlight = false;
      if (!closed) setLoading(false);
    }
  }
```

- [ ] **Step 2: Remove autofocus**

Delete the last block of `openAiPromptDialog` (`// Focus the input so the kid...` and `setTimeout(() => input.focus(), 0);`). Also remove `input.focus();` inside `recognition.onresult` so a spoken prompt doesn't raise the keyboard.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: PASS.
Manual (with `npm run dev`, the `/api/generate` call fails locally, which is fine): open AI dialog (hold 2 s), type "cat", tap Make it, immediately tap ×. No error toast appears later and the canvas is unchanged. In DevTools Network the request shows as cancelled.

- [ ] **Step 4: Commit**

```bash
git add src/ui/AiPromptDialog.ts
git commit -m "Cancel AI request and speech when the dialog closes; drop autofocus"
```

---

### Task 12: Service worker updates at launch only; offline pictures

**Files:**
- Modify: `vite.config.ts:8-31`
- Modify: `src/main.ts:9-11`

- [ ] **Step 1: Configure the PWA plugin**

In `vite.config.ts`:
- `registerType: 'autoUpdate'` → `registerType: 'prompt'`.
- `workbox` block becomes:

```ts
      workbox: {
        // json: the template manifest, so Pictures works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Old preview renders, not referenced by the app.
        globIgnores: ['**/templates/_uni_preview/**'],
      },
```

- [ ] **Step 2: Never reload mid-drawing**

In `src/main.ts`, replace `registerSW({ immediate: true });` with:

```ts
// Updates install in the background but never reload the page on their
// own: an automatic reload would throw away the drawing in progress. The
// new version takes over the next time the app is opened fresh.
registerSW({ immediate: true, onNeedRefresh() { /* apply on next launch */ } });
```

- [ ] **Step 3: Verify the build output**

Run: `npm run build && grep -o 'templates/manifest.json' dist/sw.js | head -1 && ! grep -q '_uni_preview' dist/sw.js && echo OK`
Expected: prints `templates/manifest.json` and `OK`.

Manual: `npm run preview`, load once, DevTools → Network → Offline, reload: the app opens, Pictures lists templates and a template loads.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts src/main.ts
git commit -m "Apply app updates on next launch only and precache template manifest"
```

---

### Task 13: Docs and device checklist

**Files:**
- Modify: `README.md` (Features, Keyboard, Run sections)
- Modify: `PROJECT.md` (Architecture tree, Decisions log, Known issues)
- Create: `docs/device-checklist-part-a.md`

- [ ] **Step 1: README**

In Features, add bullets:
- `**Kid lock**: canvas zoom locked by default (parents can allow it in Settings), extra fingers and resting palms ignored while drawing, Settings / AI / fullscreen exit behind a 2-second press-and-hold`
- `**Autosave**: the current drawing is saved automatically and restored when the app reopens`
- `**Redo button** next to Undo`

In Run, add `npm test` (Vitest unit tests).

- [ ] **Step 2: PROJECT.md**

Architecture tree: add `PointerTracker.ts`, `dirtyRect.ts`, `SerialQueue.ts`, `SwitchPictureCommand.ts` (engine), `composite.ts` (workers), `autosave.ts`, `prefs.ts` (storage), `holdGate.ts`, `fullscreen.ts` (ui). Decisions log: add one line each for zoom lock rules, dirty-rect undo with 60 MB cap, serialized fills, autosave store, `registerType: 'prompt'`. Known issues: replace the "bbox field is wired but the implementation uses the full canvas" note with "undo stores changed rectangles only"; add "OS gestures (iPad 4/5-finger, Android edge swipes) cannot be blocked by a web app; parents use Guided Access / App pinning (guide in Settings)" and "AI prompt/image moderation and rate limiting not yet implemented".

- [ ] **Step 3: Device checklist**

`docs/device-checklist-part-a.md`:

```markdown
# Part A device checklist (iPad and Android)

Install the app to the home screen first, then check each item.

- [ ] Pinch with two fingers on the picture: nothing zooms or moves.
- [ ] Pinch on the toolbar or a dialog: the page does not zoom.
- [ ] Draw with one finger while the other hand rests on the screen: the line continues, nothing else is drawn.
- [ ] Put three or four fingers down while drawing: the stroke is not cut, nothing zooms.
- [ ] Tap the gear once: a "Grown-ups: press and hold" hint shows, Settings stays closed. Hold 2 s: Settings opens.
- [ ] Same for the Make a picture button.
- [ ] Settings, Allow zoom on: pinch zooms and cannot shrink the picture below the page. Off: the picture snaps back.
- [ ] Draw, swipe home, reopen: the drawing is still there. Also after closing the app from the app switcher.
- [ ] Pick a new picture, then Undo: the previous drawing comes back.
- [ ] Save a drawing with a name, pick another picture, Save: a name prompt appears and the first project is unchanged.
- [ ] Tap five areas quickly with Fill: all five stay coloured.
- [ ] Draw 60 strokes, then Undo repeatedly: the app stays responsive and does not reload.
- [ ] Airplane mode, open the app: Pictures lists and opens pictures.
- [ ] Browser (not installed): Fullscreen button enters fullscreen; after an accidental exit, the next tap goes back in; holding the button 2 s leaves fullscreen for good.
- [ ] iPad: Guided Access on, try the four-finger swipe: the app stays. Android: App pinning on, try the home swipe: the app stays.
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md PROJECT.md docs/device-checklist-part-a.md
git commit -m "Document kid lock, autosave and Part A device checklist"
```
