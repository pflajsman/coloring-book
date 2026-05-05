import type { App, Tool } from '../engine/App';
import { showModal } from './Modal';
import { attachTooltip } from './Tooltip';

// Big, bright, uncluttered. The aim: a 3-year-old can use it without reading.
// Only four tools visible (brush, fill, eraser, undo). Everything else lives
// in a settings drawer behind a single gear button.

const KID_COLORS = [
  '#e74c3c', // red
  '#e67e22', // orange
  '#f1c40f', // yellow
  '#2ecc71', // green
  '#1abc9c', // teal
  '#3498db', // blue
  '#9b59b6', // purple
  '#e91e63', // pink
  '#795548', // brown
  '#000000', // black
  '#ffffff', // white (last so kids don't pick it by accident)
];

type Tools = Extract<Tool, 'brush' | 'pen' | 'spray' | 'fill' | 'eraser'>;

// Order matters — this is the visual order in the dock (top to bottom).
// Pen first so it lands at the top of the dock for easy access.
const TOOL_LIST: Tools[] = ['pen', 'brush', 'spray', 'fill', 'eraser'];

const TOOL_ICONS: Record<Tools, string> = {
  brush: brushSvg(),
  pen: penSvg(),
  spray: spraySvg(),
  fill: fillSvg(),
  eraser: eraserSvg(),
};

const TOOL_NAMES: Record<Tools, string> = {
  pen: 'Pen',
  brush: 'Brush',
  spray: 'Spray',
  fill: 'Fill',
  eraser: 'Eraser',
};

export type KidUIActions = {
  onUndo: () => void;
  onClear: () => void;
  onSave: () => Promise<void> | void;
  onSavePng: () => Promise<void> | void;
  onLoadTemplate: () => void;
  onOpenProjects: () => void;
};

export function buildKidUI(app: App, actions: KidUIActions): {
  palette: HTMLElement;
  dock: HTMLElement;
  topBar: HTMLElement;
} {
  // ---- Color palette (left side) ----
  const palette = document.createElement('aside');
  palette.className = 'kid-palette';
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
      if (app.state.tool === 'eraser') app.setState({ tool: 'brush' });
    });
    swatches.push(s);
    palette.appendChild(s);
  }

  // ---- Tool dock (right side, vertical) ----
  const dock = document.createElement('div');
  dock.className = 'kid-dock';
  const toolBtns: Partial<Record<Tools, HTMLButtonElement>> = {};
  TOOL_LIST.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'kid-tool';
    b.dataset.tool = t;
    b.innerHTML = TOOL_ICONS[t];
    b.addEventListener('click', () => app.setState({ tool: t }));
    attachTooltip(b, TOOL_NAMES[t]);
    toolBtns[t] = b;
    dock.appendChild(b);
  });
  // Undo button — kids understand "oops" better than "undo".
  const undo = document.createElement('button');
  undo.className = 'kid-tool kid-undo';
  undo.innerHTML = undoSvg();
  undo.addEventListener('click', () => actions.onUndo());
  attachTooltip(undo, 'Undo');
  dock.appendChild(undo);

  // Clear-all (trash) button — wipes all paint, keeps the line art.
  const clearBtn = document.createElement('button');
  clearBtn.className = 'kid-tool kid-clear';
  clearBtn.innerHTML = trashSvg();
  clearBtn.addEventListener('click', () => actions.onClear());
  attachTooltip(clearBtn, 'Clear all');
  dock.appendChild(clearBtn);

  // ---- Top bar: pictures (templates) + gear (settings) ----
  const topBar = document.createElement('div');
  topBar.className = 'kid-topbar';

  const picturesBtn = document.createElement('button');
  picturesBtn.className = 'kid-iconbtn';
  picturesBtn.innerHTML = picturesSvg();
  picturesBtn.addEventListener('click', () => actions.onLoadTemplate());
  attachTooltip(picturesBtn, 'Pictures');
  topBar.appendChild(picturesBtn);

  const gear = document.createElement('button');
  gear.className = 'kid-iconbtn kid-gear';
  gear.innerHTML = gearSvg();
  gear.addEventListener('click', () => openSettings(app, actions));
  attachTooltip(gear, 'Settings');
  topBar.appendChild(gear);

  // ---- React to state changes ----
  app.subscribe((s) => {
    swatches.forEach((sw) => sw.classList.toggle('active', sw.dataset.color === s.color));
    (Object.entries(toolBtns) as [Tools, HTMLButtonElement][]).forEach(([id, b]) => {
      b.classList.toggle('active', id === s.tool);
    });
  });

  return { palette, dock, topBar };
}

// Settings drawer — flat, minimalistic. Just sliders, a toggle, and three
// action buttons. No section headers, no decorative cards.
function openSettings(app: App, actions: KidUIActions) {
  const body = document.createElement('div');
  body.className = 'kid-settings';

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

  const destroy = showModal('Settings', body, { narrow: true });
}

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

function bigBtn(label: string, onClick: () => void) {
  const b = document.createElement('button');
  b.className = 'kid-bigbtn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ---- Inline icons (no external assets, scales crisply at any size) ----

// Each icon is drawn with explicit colors (not currentColor) so the dock
// reads as a row of physical art tools — wooden pencil, painted brush,
// fluorescent marker, metallic spray can, etc. Stroke widths and corner
// radii are tuned for crispness at the dock's 76 px size.

function brushSvg() {
  // Vertical paintbrush, centered. Big bristle clump on top with paint
  // splotch above it so it reads "brush dipped in paint" at a glance.
  return `<svg viewBox="0 0 64 64">
    <!-- paint drop on bristle tip -->
    <ellipse cx="32" cy="8" rx="10" ry="3" fill="#ff6b9d"/>
    <!-- bristles (broad, tapered) -->
    <path d="M22 10 Q 22 8 32 8 Q 42 8 42 10 L 40 28 L 24 28 Z"
          fill="#ff6b9d" stroke="#7a2548" stroke-width="2" stroke-linejoin="round"/>
    <!-- ferrule (gold band) -->
    <rect x="22" y="28" width="20" height="6" fill="#ffd166"
          stroke="#a87b00" stroke-width="2"/>
    <!-- ferrule rivets -->
    <circle cx="27" cy="31" r="0.9" fill="#a87b00"/>
    <circle cx="37" cy="31" r="0.9" fill="#a87b00"/>
    <!-- wooden handle, slightly tapered toward bottom -->
    <path d="M24 34 L40 34 L36 58 L28 58 Z"
          fill="#d97a3a" stroke="#7a3e16" stroke-width="2" stroke-linejoin="round"/>
    <!-- handle highlight -->
    <line x1="28" y1="38" x2="29" y2="54" stroke="#f5b483" stroke-width="2"/>
  </svg>`;
}

function penSvg() {
  // Vertical pencil, centered, classic yellow body. Sharpened tip at the
  // bottom (graphite point), pink eraser at the top.
  return `<svg viewBox="0 0 64 64">
    <!-- pink eraser cap -->
    <rect x="24" y="6" width="16" height="8" rx="1.5" fill="#ff6b9d"
          stroke="#7a2548" stroke-width="2"/>
    <!-- silver ferrule (band) -->
    <rect x="24" y="14" width="16" height="4" fill="#bfc7d4"
          stroke="#5a6276" stroke-width="2"/>
    <line x1="26" y1="16" x2="38" y2="16" stroke="#5a6276" stroke-width="1"/>
    <!-- yellow body -->
    <rect x="24" y="18" width="16" height="28" fill="#ffd54a"
          stroke="#a07900" stroke-width="2"/>
    <!-- body highlight -->
    <line x1="28" y1="20" x2="28" y2="44" stroke="#fff1a8" stroke-width="2"/>
    <!-- wood cone (tip section) -->
    <path d="M24 46 L40 46 L36 56 L28 56 Z"
          fill="#f0c990" stroke="#7a3e16" stroke-width="2" stroke-linejoin="round"/>
    <!-- graphite point -->
    <path d="M28 56 L36 56 L32 60 Z" fill="#2a2a3a"/>
  </svg>`;
}


function spraySvg() {
  // Spray can centered upright. Cap on top, can body in middle, mist
  // emerging straight up from the nozzle so it's clear what it does.
  return `<svg viewBox="0 0 64 64">
    <!-- mist cloud above the can -->
    <g fill="#b8a4ff">
      <circle cx="32" cy="6" r="1.4"/>
      <circle cx="26" cy="9" r="1.1"/>
      <circle cx="38" cy="9" r="1.1"/>
      <circle cx="22" cy="12" r="1.0"/>
      <circle cx="42" cy="12" r="1.0"/>
      <circle cx="32" cy="13" r="1.2"/>
      <circle cx="28" cy="15" r="0.9"/>
      <circle cx="36" cy="15" r="0.9"/>
    </g>
    <!-- cap (top) -->
    <rect x="26" y="16" width="12" height="8" rx="1.5" fill="#ff8c00"
          stroke="#7a4400" stroke-width="2"/>
    <!-- nozzle slot -->
    <rect x="30" y="13" width="4" height="3" fill="#2a2a3a"/>
    <!-- can body -->
    <rect x="20" y="24" width="24" height="32" rx="2" fill="#dfe4ee"
          stroke="#5a6276" stroke-width="2"/>
    <!-- label band -->
    <rect x="20" y="34" width="24" height="12" fill="#b8a4ff"
          stroke="#5a4a99" stroke-width="2"/>
    <!-- label stripe -->
    <line x1="22" y1="40" x2="42" y2="40" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
    <!-- can highlight (left edge) -->
    <line x1="23" y1="28" x2="23" y2="54" stroke="#fff" stroke-width="2" opacity="0.7"/>
  </svg>`;
}

function fillSvg() {
  // Tipping paint bucket, paint pouring, blue paint inside.
  return `<svg viewBox="0 0 64 64">
    <!-- paint splash on ground -->
    <path d="M6 56 Q 16 50 28 54 Q 36 58 32 62 Q 18 60 6 60 Z" fill="#3498db" stroke="#1e5a91" stroke-width="2" stroke-linejoin="round"/>
    <!-- bucket body, tilted -->
    <g transform="rotate(20 40 30)">
      <rect x="22" y="14" width="32" height="32" rx="2" fill="#bfc7d4" stroke="#5a6276" stroke-width="2"/>
      <!-- paint inside -->
      <path d="M22 14 L54 14 L52 24 L24 24 Z" fill="#3498db"/>
      <!-- handle -->
      <path d="M26 14 Q 38 4 50 14" stroke="#5a6276" stroke-width="2" fill="none"/>
      <!-- highlight -->
      <line x1="26" y1="28" x2="26" y2="42" stroke="#fff" stroke-width="2" opacity="0.6"/>
    </g>
    <!-- pouring stream -->
    <path d="M48 30 Q 44 44 36 52" stroke="#3498db" stroke-width="6" stroke-linecap="round" fill="none"/>
  </svg>`;
}

function eraserSvg() {
  // Pink + blue eraser block, perfectly centered in the 64x64 viewBox.
  // No tilt — kids see it head-on. Bevel highlights make it 3D-ish.
  return `<svg viewBox="0 0 64 64">
    <!-- pink top half -->
    <path d="M14 22 L50 22 L50 32 L14 32 Z"
          fill="#ff8fb1" stroke="#7a2548" stroke-width="2" stroke-linejoin="round"/>
    <!-- blue bottom half -->
    <path d="M14 32 L50 32 L50 42 L14 42 Z"
          fill="#6dd5ed" stroke="#1e6e80" stroke-width="2" stroke-linejoin="round"/>
    <!-- highlights along the top of each half -->
    <line x1="18" y1="26" x2="46" y2="26" stroke="#ffd0dc" stroke-width="1.5"/>
    <line x1="18" y1="36" x2="46" y2="36" stroke="#b6ecf6" stroke-width="1.5"/>
    <!-- shavings beneath the eraser -->
    <ellipse cx="22" cy="48" rx="2" ry="1" fill="#d97a8c"/>
    <ellipse cx="32" cy="50" rx="2.4" ry="1" fill="#6dd5ed"/>
    <ellipse cx="42" cy="48" rx="2" ry="1" fill="#d97a8c"/>
  </svg>`;
}

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
