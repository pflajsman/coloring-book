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
  private swallowClick = false;

  constructor(private ms: number, private onFire: () => void, private clock: HoldClock = realClock) {}

  press() {
    this.cancelTimer();
    this.fired = false;
    this.swallowClick = false;
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
    if (this.fired) this.swallowClick = true;
    return this.fired ? 'fired' : 'short';
  }

  // The browser fires a click when a completed hold is released. That click
  // is part of the hold, so other click handlers on the button (fullscreen:
  // "tap to enter") must not see it. Returns true once per completed hold.
  takeClickAfterFire(): boolean {
    const v = this.swallowClick;
    this.swallowClick = false;
    return v;
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
    // Capture can throw if the pointer is already gone (very fast tap);
    // the gate must still work without it.
    try { btn.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
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
  // Capture phase so this runs before any other click listener on the
  // button, whichever was registered first.
  btn.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      if (timer.takeClickAfterFire()) e.stopImmediatePropagation();
    },
    { capture: true },
  );
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
