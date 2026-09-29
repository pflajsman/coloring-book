import type { App, Tool } from '../engine/App';
import { showModal } from './Modal';
import { attachTooltip } from './Tooltip';
import { toolIconSvg, type DockTool } from './toolIcons';
import { toolAfterColorPick } from '../engine/inputPolicy';
import { HOLD_MS, holdToActivate } from './holdGate';
import { enterFullscreen, exitFullscreen, isFullscreen, isInstalledApp, onFullscreenChange, sticky } from './fullscreen';
import { PREF_ZOOM_LOCKED, writeBoolPref } from '../storage/prefs';

// Big, bright, uncluttered. The aim: a 3-year-old can use it without reading.
// Only four tools visible (brush, fill, eraser, undo). Everything else lives
// in a settings drawer behind a single gear button.

// Basic colors first so kids tap them without scrolling, then shades and
// extras grouped by hue family.
const KID_COLORS = [
  // basics (top of palette — most-used colors)
  '#e74c3c', // red
  '#e67e22', // orange
  '#f1c40f', // yellow
  '#2ecc71', // green
  '#3498db', // blue
  '#9b59b6', // purple
  '#e91e63', // pink
  '#795548', // brown
  '#000000', // black
  '#ffffff', // white
  // extra shades / accents below
  '#c0392b', // dark red
  '#ff8a80', // coral
  '#ffb366', // peach
  '#d4a373', // tan
  '#fff176', // pale yellow
  '#16a085', // dark teal
  '#1abc9c', // teal
  '#a8e6cf', // mint
  '#2c3e8f', // dark blue
  '#6dd5ed', // sky blue
  '#b8a4ff', // lavender
  '#ff6b9d', // hot pink
  '#ffc1cc', // baby pink
  '#95a5a6', // grey
];

type Tools = Extract<Tool, DockTool>;

// Order matters: this is the visual order in the dock (top to bottom).
// Basic tools first (pen, brush, rainbow, fill, eraser), then shape tools,
// then special/effect tools at the bottom.
const TOOL_LIST: Tools[] = ['pen', 'brush', 'rainbow', 'fill', 'eraser', 'line', 'circle', 'rect', 'spray', 'glitter', 'stamp', 'blur'];

const TOOL_NAMES: Record<Tools, string> = {
  pen: 'Pen',
  brush: 'Brush',
  rainbow: 'Rainbow',
  line: 'Ruler',
  circle: 'Circle',
  rect: 'Rectangle',
  spray: 'Spray',
  glitter: 'Glitter',
  stamp: 'Stamps',
  blur: 'Magic finger',
  fill: 'Fill',
  eraser: 'Eraser',
};

export type KidUIActions = {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSave: () => Promise<void> | void;
  onSavePng: () => Promise<void> | void;
  onLoadTemplate: () => void;
  onOpenProjects: () => void;
  onAiGenerate: () => void;
};

export function buildKidUI(app: App, actions: KidUIActions): {
  palette: HTMLElement;
  dock: HTMLElement;
  topBar: HTMLElement;
} {
  // ---- Color palette (left side) ----
  // Single column of swatches inside a scrollable area, with up/down chevron
  // buttons at the top + bottom so kids can scroll without needing to know
  // the wheel/touch gesture works.
  const palette = scrollPanel('kid-palette', 56);
  const swatches: HTMLButtonElement[] = [];
  for (const c of KID_COLORS) {
    const s = document.createElement('button');
    s.className = 'kid-swatch';
    s.style.setProperty('--c', c);
    s.dataset.color = c;
    s.setAttribute('aria-label', `Color ${c}`);
    s.addEventListener('click', () => {
      app.setState({ color: c });
      // Brush is the natural default after picking a color, but only if the
      // current tool is fill/eraser — let kids stay in fill mode if they want
      // to keep filling shapes one after another.
      const next = toolAfterColorPick(app.state.tool);
      if (next !== app.state.tool) app.setState({ tool: next });
    });
    swatches.push(s);
    palette.body.appendChild(s);
  }

  // ---- Tool dock (right side, vertical) ----
  const dock = scrollPanel('kid-dock', 76);
  const toolBtns: Partial<Record<Tools, HTMLButtonElement>> = {};
  TOOL_LIST.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'kid-tool';
    b.dataset.tool = t;
    b.innerHTML = toolIconSvg(t, app.state.color, t);
    b.addEventListener('click', () => app.setState({ tool: t }));
    attachTooltip(b, TOOL_NAMES[t]);
    toolBtns[t] = b;
    dock.body.appendChild(b);
  });
  // ---- Top bar: pictures + clear + undo (left) + sliders (center) + gear/fullscreen (right) ----
  const topBar = document.createElement('div');
  topBar.className = 'kid-topbar';

  // Left-side group: pictures + clear sit together at the top-left corner.
  const leftGroup = document.createElement('div');
  leftGroup.className = 'kid-topbar-left';

  const picturesBtn = document.createElement('button');
  picturesBtn.className = 'kid-iconbtn';
  picturesBtn.innerHTML = picturesSvg();
  picturesBtn.addEventListener('click', () => actions.onLoadTemplate());
  attachTooltip(picturesBtn, 'Pictures');
  leftGroup.appendChild(picturesBtn);

  // Magic-make button — opens the AI prompt dialog. Sits next to Pictures so
  // kids learn "this is the other place pictures come from."
  const aiBtn = document.createElement('button');
  aiBtn.className = 'kid-iconbtn kid-aibtn';
  aiBtn.innerHTML = aiSparkleSvg();
  holdToActivate(aiBtn, () => actions.onAiGenerate());
  attachTooltip(aiBtn, 'Make a picture');
  leftGroup.appendChild(aiBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'kid-iconbtn kid-clear-top';
  clearBtn.innerHTML = trashSvg();
  clearBtn.addEventListener('click', () => actions.onClear());
  attachTooltip(clearBtn, 'Clear all');
  leftGroup.appendChild(clearBtn);

  // Undo lives in the top bar next to clear so it's reachable when the
  // tool dock is scrolled.
  const undoBtn = document.createElement('button');
  undoBtn.className = 'kid-iconbtn kid-undo-top';
  undoBtn.innerHTML = undoSvg();
  undoBtn.addEventListener('click', () => actions.onUndo());
  attachTooltip(undoBtn, 'Undo');
  leftGroup.appendChild(undoBtn);

  const redoBtn = document.createElement('button');
  redoBtn.className = 'kid-iconbtn kid-redo-top';
  redoBtn.innerHTML = redoSvg();
  redoBtn.addEventListener('click', () => actions.onRedo());
  attachTooltip(redoBtn, 'Redo');
  leftGroup.appendChild(redoBtn);

  topBar.appendChild(leftGroup);

  // Right-side group: slider + settings + fullscreen, all on the same row.
  // Putting the slider here (instead of centered between left/right groups)
  // keeps it on row 1 at every viewport — no more wrapping to a second row
  // on narrow screens, and it's visible on phone too.
  // Pressure lives in the settings dialog only — too many sliders crowded
  // the bar and most kids never need to change pressure sensitivity.
  const rightGroup = document.createElement('div');
  rightGroup.className = 'kid-topbar-right';

  const sizeSlider = buildTopSlider({
    kind: 'size',
    label: 'Size',
    valueFormat: (v) => String(v),
    min: 4,
    max: 80,
    value: app.state.size,
    onInput: (v) => app.setState({ size: v }),
  });
  rightGroup.appendChild(sizeSlider.root);

  const gear = document.createElement('button');
  gear.className = 'kid-iconbtn kid-gear';
  gear.innerHTML = gearSvg();
  holdToActivate(gear, () => openSettings(app, actions));
  attachTooltip(gear, 'Settings');
  rightGroup.appendChild(gear);

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

  topBar.appendChild(rightGroup);

  // ---- React to state changes ----
  let iconColor = app.state.color;
  app.subscribe((s) => {
    // Redraw the dock icons in the new paint colour so each icon shows the
    // mark it will make.
    if (s.color !== iconColor) {
      iconColor = s.color;
      (Object.entries(toolBtns) as [Tools, HTMLButtonElement][]).forEach(([id, b]) => {
        b.innerHTML = toolIconSvg(id, s.color, id);
      });
    }
    swatches.forEach((sw) => sw.classList.toggle('active', sw.dataset.color === s.color));
    (Object.entries(toolBtns) as [Tools, HTMLButtonElement][]).forEach(([id, b]) => {
      b.classList.toggle('active', id === s.tool);
    });
    // Reflect the current state in the top-bar slider so it stays in sync
    // if anything else (settings dialog, keyboard, future code) updates the
    // app state.
    sizeSlider.setValue(s.size);
  });

  return { palette: palette.root, dock: dock.root, topBar };
}

// Vertical panel with up/down scroll chevrons. Single column always —
// when items overflow, the inner body scrolls and the chevrons paginate
// it. Buttons auto-disable at the scroll extremes.
function scrollPanel(rootClass: string, itemHeight: number): {
  root: HTMLElement;
  body: HTMLElement;
} {
  const root = document.createElement('aside');
  root.className = rootClass;

  const upBtn = document.createElement('button');
  upBtn.className = 'kid-scroll-btn kid-scroll-up';
  upBtn.setAttribute('aria-label', 'Scroll up');
  upBtn.innerHTML = chevronUpSvg();

  const body = document.createElement('div');
  body.className = 'kid-scroll-body';

  const downBtn = document.createElement('button');
  downBtn.className = 'kid-scroll-btn kid-scroll-down';
  downBtn.setAttribute('aria-label', 'Scroll down');
  downBtn.innerHTML = chevronDownSvg();

  root.append(upBtn, body, downBtn);

  // Scroll by roughly one item per tick. Step = item-height + the body's
  // gap (8 px) so each tick moves a clean number of items.
  const step = itemHeight + 8;

  // Press-and-hold auto-scroll. A single tap scrolls by 2 items (smooth);
  // holding the button keeps emitting steps every ~120 ms after a 350 ms
  // delay (giving room for a normal "click" gesture to be just one step).
  const HOLD_DELAY = 350;
  const REPEAT_INTERVAL = 120;
  let holdTimer: number | null = null;
  let repeatTimer: number | null = null;
  const stopHold = () => {
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
    if (repeatTimer !== null) { clearInterval(repeatTimer); repeatTimer = null; }
  };
  const startHold = (direction: -1 | 1) => {
    stopHold();
    // Initial nudge — same as a single click.
    body.scrollBy({ top: direction * step * 2, behavior: 'smooth' });
    holdTimer = window.setTimeout(() => {
      // Switch from "smooth" to "auto" once we're auto-repeating: smooth
      // queues up animations and feels laggy when the user holds.
      repeatTimer = window.setInterval(() => {
        body.scrollBy({ top: direction * step, behavior: 'auto' });
      }, REPEAT_INTERVAL);
    }, HOLD_DELAY);
  };

  const wireHold = (btn: HTMLElement, direction: -1 | 1) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startHold(direction);
    });
    btn.addEventListener('pointerup', stopHold);
    btn.addEventListener('pointercancel', stopHold);
    btn.addEventListener('pointerleave', stopHold);
  };
  wireHold(upBtn, -1);
  wireHold(downBtn, 1);

  // Disable chevrons when at the scroll extremes — visual hint that there
  // is or isn't more content. We update both on scroll AND on a
  // ResizeObserver so adding/removing items refreshes the state.
  const update = () => {
    const atTop = body.scrollTop <= 1;
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
    const overflows = body.scrollHeight > body.clientHeight + 1;
    upBtn.classList.toggle('is-disabled', !overflows || atTop);
    downBtn.classList.toggle('is-disabled', !overflows || atBottom);
    root.classList.toggle('has-overflow', overflows);
  };
  body.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(update).observe(body);
  }
  // Initial state once the panel is in the DOM.
  requestAnimationFrame(update);

  return { root, body };
}

function chevronUpSvg() {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="#2a2a3a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="8,20 16,12 24,20"/>
  </svg>`;
}
function chevronDownSvg() {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="#2a2a3a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="8,12 16,20 24,12"/>
  </svg>`;
}

// Settings drawer — flat, minimalistic. Just sliders, a toggle, and three
// action buttons. No section headers, no decorative cards.
function openSettings(app: App, actions: KidUIActions) {
  const body = document.createElement('div');
  body.className = 'kid-settings';

  // Brush size and pressure are primarily in the top bar, but we keep them
  // here too as a fallback for narrow viewports where the top sliders are
  // hidden. This mirrors the values both ways.
  body.appendChild(
    sliderRow('Brush size', 4, 80, app.state.size, (v) => app.setState({ size: v })),
  );
  body.appendChild(
    sliderRow(
      'Pressure',
      0,
      100,
      Math.round(app.state.pressureSensitivity * 100),
      (v) => app.setState({ pressureSensitivity: v / 100 }),
      '%',
    ),
  );
  body.appendChild(
    toggleRow('Stylus only', app.state.penOnly, (v) => app.setState({ penOnly: v })),
  );
  body.appendChild(
    toggleRow('Allow zoom', !app.state.zoomLocked, (v) => {
      app.setState({ zoomLocked: !v });
      writeBoolPref(PREF_ZOOM_LOCKED, !v);
    }),
  );

  const sep = document.createElement('div');
  sep.className = 'kid-sep';
  body.appendChild(sep);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'kid-settings-actions';
  actionsRow.appendChild(bigBtn('Save', () => {
    void actions.onSave();
  }));
  actionsRow.appendChild(bigBtn('Save as PNG', () => {
    void actions.onSavePng();
  }));
  actionsRow.appendChild(bigBtn('My projects', () => {
    destroy();
    actions.onOpenProjects();
  }));
  body.appendChild(actionsRow);

  const guideSep = document.createElement('div');
  guideSep.className = 'kid-sep';
  body.append(guideSep, lockGuide());

  const destroy = showModal('Settings', body, { narrow: true });
}

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
    <p>Or turn off the four- and five-finger swipes: in Settings, open Multitasking &amp; Gestures and look for the gestures switch (the exact name depends on the iPadOS version).</p>
    <h3>Android</h3>
    <p><b>App pinning</b> keeps the tablet in this app. Turn it on in Settings, Security (or Security &amp; privacy, sometimes under Advanced or More security settings), App pinning. The place differs between tablet makers. Then open the recent-apps view, tap the Coloring icon at the top of its card and choose Pin.</p>
    <p>Tip: install Coloring to the home screen first (Share, Add to Home Screen on iPad; menu, Install app on Android). It then opens full screen.</p>`;
  return el;
}

// Gate only while `active()` is true. Used by the fullscreen button:
// entering is a plain tap, leaving is a parent hold.
function holdToActivateWhen(btn: HTMLElement, active: () => boolean, onActivate: () => void) {
  holdToActivate(btn, () => { if (active()) onActivate(); }, HOLD_MS, active);
}

function toggleRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'kid-toggle-row';
  const lab = document.createElement('span');
  lab.className = 'kid-toggle-label';
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'kid-switch';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(lab, input);
  return row;
}

// Compact slider row used inside the settings dialog (fallback for narrow
// viewports where the always-on top-bar sliders are hidden).
function sliderRow(
  label: string,
  min: number,
  max: number,
  value: number,
  onInput: (v: number) => void,
  unit = '',
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'kid-slider-row';
  const head = document.createElement('div');
  head.className = 'kid-slider-head';
  const lab = document.createElement('span');
  lab.className = 'kid-slider-label';
  lab.textContent = label;
  const valEl = document.createElement('span');
  valEl.className = 'kid-slider-value';
  valEl.textContent = `${value}${unit}`;
  head.append(lab, valEl);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.addEventListener('input', () => {
    onInput(+input.value);
    valEl.textContent = `${input.value}${unit}`;
  });
  row.append(head, input);
  return row;
}

// Slider that floats above the canvas in the top band. Layout:
//   [ICON] [LABEL] [============●===========] [VALUE]
// The label and value are explicit text so it's obvious what each slider
// does even without colour cues. The icon adds a visual hint (small/big dot
// for size, light/heavy press for pressure).
function buildTopSlider(opts: {
  kind: 'pressure' | 'size';
  label: string;
  valueFormat: (v: number) => string;
  min: number;
  max: number;
  value: number;
  onInput: (v: number) => void;
}): { root: HTMLElement; setValue: (v: number) => void } {
  const root = document.createElement('div');
  root.className = `kid-slider kid-slider-${opts.kind}`;

  const icon = document.createElement('span');
  icon.className = 'kid-slider-icon';
  icon.innerHTML = opts.kind === 'pressure' ? pressureIconSvg() : sizeIconSvg();

  const label = document.createElement('span');
  label.className = 'kid-slider-name';
  label.textContent = opts.label;

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'kid-slider-track';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.value = String(opts.value);
  input.setAttribute('aria-label', opts.label);

  const valueEl = document.createElement('span');
  valueEl.className = 'kid-slider-readout';
  valueEl.textContent = opts.valueFormat(opts.value);

  input.addEventListener('input', () => {
    const v = +input.value;
    valueEl.textContent = opts.valueFormat(v);
    opts.onInput(v);
  });

  root.append(icon, label, input, valueEl);

  return {
    root,
    setValue(v: number) {
      // Avoid stomping the slider while the user is dragging it.
      if (document.activeElement === input) return;
      const s = String(v);
      if (input.value !== s) input.value = s;
      valueEl.textContent = opts.valueFormat(v);
    },
  };
}

// Pressure icon: a finger-press silhouette (a hand fingertip pushing down).
function pressureIconSvg() {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="#2a2a3a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <!-- fingertip -->
    <path d="M11 6 Q 16 4 21 6 L 21 18 L 26 22 L 26 28 L 6 28 L 6 22 L 11 18 Z" fill="#fff8dc"/>
    <!-- pressure waves below the finger -->
    <line x1="4" y1="30" x2="28" y2="30" stroke-width="2"/>
  </svg>`;
}

// Size icon: a thick paint stroke. Visualizes "thickness" directly.
function sizeIconSvg() {
  return `<svg viewBox="0 0 32 32">
    <path d="M4 22 L 28 10" stroke="#2a2a3a" stroke-width="8"
          stroke-linecap="round" fill="none"/>
  </svg>`;
}

function bigBtn(label: string, onClick: () => void) {
  const b = document.createElement('button');
  b.className = 'kid-bigbtn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ---- Inline icons (no external assets, scales crisply at any size) ----

// Top-bar and panel icons. Dock tool icons live in toolIcons.ts.

function undoSvg() {
  // U-turn arrow centered in the viewBox. A single horizontal arrow body
  // with a clear chevron arrowhead on the left — reads as "go back" at
  // any size without relying on tricky arc geometry.
  return `<svg viewBox="0 0 64 64">
    <!-- arrow body: horizontal shaft with a curl on the right -->
    <path d="M14 32 L48 32 Q 56 32 56 24 Q 56 16 48 16"
          fill="none" stroke="#2a2a3a" stroke-width="7"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- arrowhead chevron pointing left -->
    <polyline points="22,22 12,32 22,42"
              fill="none" stroke="#2a2a3a" stroke-width="7"
              stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function redoSvg() {
  // The undo arrow, mirrored.
  return undoSvg().replace('<svg ', '<svg style="transform: scaleX(-1)" ');
}

function trashSvg() {
  // Trash can with a lid, friendly + clearly destructive.
  return `<svg viewBox="0 0 64 64">
    <!-- lid -->
    <rect x="10" y="14" width="44" height="6" rx="2" fill="#ff6b9d" stroke="#7a2548" stroke-width="2"/>
    <!-- handle -->
    <rect x="26" y="8" width="12" height="6" rx="2" fill="#ff6b9d" stroke="#7a2548" stroke-width="2"/>
    <!-- bin body -->
    <path d="M14 22 L18 56 L46 56 L50 22 Z" fill="#ffb3c8" stroke="#7a2548" stroke-width="2" stroke-linejoin="round"/>
    <!-- bin stripes -->
    <line x1="26" y1="28" x2="26" y2="50" stroke="#7a2548" stroke-width="2"/>
    <line x1="32" y1="28" x2="32" y2="50" stroke="#7a2548" stroke-width="2"/>
    <line x1="38" y1="28" x2="38" y2="50" stroke="#7a2548" stroke-width="2"/>
  </svg>`;
}

function gearSvg() {
  // Three horizontal "settings sliders" — universally recognized, no fragile
  // gear geometry to get wrong.
  return `<svg viewBox="0 0 64 64" fill="none" stroke="#2a2a3a" stroke-width="5" stroke-linecap="round">
    <line x1="10" y1="20" x2="54" y2="20"/>
    <line x1="10" y1="32" x2="54" y2="32"/>
    <line x1="10" y1="44" x2="54" y2="44"/>
    <circle cx="40" cy="20" r="5" fill="#ffd166" stroke="#2a2a3a" stroke-width="3"/>
    <circle cx="22" cy="32" r="5" fill="#ff6b9d" stroke="#2a2a3a" stroke-width="3"/>
    <circle cx="44" cy="44" r="5" fill="#6dd5ed" stroke="#2a2a3a" stroke-width="3"/>
  </svg>`;
}

function fullscreenEnterSvg() {
  // Four corner brackets pointing outward — universal "enter fullscreen".
  return `<svg viewBox="0 0 64 64" fill="none" stroke="#2a2a3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="10,22 10,10 22,10"/>
    <polyline points="42,10 54,10 54,22"/>
    <polyline points="54,42 54,54 42,54"/>
    <polyline points="22,54 10,54 10,42"/>
  </svg>`;
}

function fullscreenExitSvg() {
  // Four corner brackets pointing inward — universal "exit fullscreen".
  return `<svg viewBox="0 0 64 64" fill="none" stroke="#2a2a3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="22,10 22,22 10,22"/>
    <polyline points="42,22 54,22 42,10"/>
    <polyline points="54,42 42,42 42,54"/>
    <polyline points="22,42 10,42 22,54"/>
  </svg>`;
}

function aiSparkleSvg() {
  // Magic 4-point sparkle with two satellite stars, gradient pink→purple.
  // Reads as "create with magic" — distinct silhouette from the picture-frame
  // Pictures button so kids can tell the two apart at a glance.
  return `<svg viewBox="0 0 64 64">
    <!-- Big central sparkle -->
    <path d="M32 8 L 36 26 L 54 32 L 36 38 L 32 56 L 28 38 L 10 32 L 28 26 Z"
          fill="#ff6b9d" stroke="#7a2548" stroke-width="2.5" stroke-linejoin="round"/>
    <!-- Top-right satellite -->
    <path d="M50 14 L 52 20 L 58 22 L 52 24 L 50 30 L 48 24 L 42 22 L 48 20 Z"
          fill="#b8a4ff" stroke="#5a4a99" stroke-width="2" stroke-linejoin="round"/>
    <!-- Bottom-left satellite -->
    <path d="M14 44 L 16 50 L 22 52 L 16 54 L 14 60 L 12 54 L 6 52 L 12 50 Z"
          fill="#ffd166" stroke="#a87b00" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

function picturesSvg() {
  // Picture frame with a sun + mountain scene.
  return `<svg viewBox="0 0 64 64">
    <rect x="6" y="12" width="52" height="40" rx="3" fill="#fff8dc" stroke="#a87b00" stroke-width="3"/>
    <rect x="9" y="15" width="46" height="34" fill="#b8e1ff"/>
    <!-- sun -->
    <circle cx="46" cy="22" r="5" fill="#ffd166"/>
    <!-- mountains -->
    <path d="M9 49 L20 34 L28 42 L38 30 L52 49 Z" fill="#06d6a0" stroke="#0a7a5b" stroke-width="2" stroke-linejoin="round"/>
    <!-- frame label slot -->
    <rect x="20" y="52" width="24" height="6" rx="1" fill="#fff8dc" stroke="#a87b00" stroke-width="2"/>
  </svg>`;
}
