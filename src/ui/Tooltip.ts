// Lightweight singleton tooltip. One DOM node shared across every attached
// control — cheaper than per-element nodes and means we never have stale
// tooltips left behind when the user moves quickly between controls.
//
// Behavior:
//  - shows after a short hover delay
//  - hides immediately on pointerleave, pointerdown (click), or wheel
//  - hides if the pointer enters a different attached control before the
//    show timer fires (no flicker, no overlap)
//  - disabled when the device has no hover capability (touch-only) — there's
//    no point firing tooltips when there's no real "hover" gesture

const SHOW_DELAY_MS = 700;

let tip: HTMLDivElement | null = null;
let showTimer: number | null = null;
let currentTarget: Element | null = null;

function ensureTip(): HTMLDivElement {
  if (tip) return tip;
  const el = document.createElement('div');
  el.className = 'kid-tooltip';
  el.setAttribute('role', 'tooltip');
  document.body.appendChild(el);
  tip = el;
  return el;
}

function hasHover(): boolean {
  return window.matchMedia('(hover: hover)').matches;
}

function hide() {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  currentTarget = null;
  if (tip) tip.classList.remove('is-visible');
}

function position(el: Element) {
  const t = ensureTip();
  const r = el.getBoundingClientRect();
  // Default: place above the control, horizontally centered.
  // Keep it on-screen by clamping x to viewport.
  t.classList.remove('is-below');
  // Render first to measure.
  t.style.visibility = 'hidden';
  t.classList.add('is-visible');
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.top - th - 10;
  if (y < 8) {
    // Not enough space above — flip below the control.
    y = r.bottom + 10;
    t.classList.add('is-below');
  }
  x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  t.style.left = `${Math.round(x)}px`;
  t.style.top = `${Math.round(y)}px`;
  t.style.visibility = '';
}

export function attachTooltip(el: HTMLElement, text: string) {
  if (!hasHover()) return;
  el.setAttribute('aria-label', text);

  el.addEventListener('pointerenter', (e) => {
    // Only hover from a mouse should trigger this. Pen/touch shouldn't pop a
    // tooltip — kids tapping with a stylus expect immediate action.
    if (e.pointerType !== 'mouse') return;
    if (currentTarget === el) return;
    currentTarget = el;
    if (showTimer !== null) clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      showTimer = null;
      if (currentTarget !== el) return;
      const t = ensureTip();
      t.textContent = text;
      position(el);
    }, SHOW_DELAY_MS);
  });

  el.addEventListener('pointerleave', () => {
    if (currentTarget === el) hide();
  });
  el.addEventListener('pointerdown', () => hide());
}

// Hide on global events that should always dismiss a tooltip — e.g. the
// user starts scrolling, opens a dialog, or presses any key.
window.addEventListener('keydown', hide);
window.addEventListener('wheel', hide, { passive: true });
window.addEventListener('blur', hide);
