# Part B: Tool Icons and Rainbow Brush Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dock icons with the approved "tool + its mark" (Option A) set, tinted in the current paint color, and add a Rainbow brush.

**Architecture:** Two pure modules with unit tests: `src/engine/rainbow.ts` (distance → hex color) and `src/ui/toolIcons.ts` (tool + color → SVG string). `App` gets a `rainbow` tool that reuses the brush stamp path with a per-segment color. `KidUI` renders the dock from `toolIcons` and re-renders icons when the color changes.

**Tech Stack:** Vite 7, TypeScript 6 strict, plain DOM, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-09-29-kid-lock-icons-templates-design.md` (Part B: B1, B2)

## Global Constraints

- `npm test` and `npm run build` pass after every task.
- Rainbow: one full hue cycle every 600 px of stroke length (document space), random start hue per stroke, hue quantized to 36 steps (10° each), saturation 90 %, lightness 55 %.
- Brush heads are built by appending hex alpha to the color (`color + '80'`), so every brush color, including rainbow colors, must be `#rrggbb`.
- Rainbow tool: after Brush in the dock, keyboard shortcut `W`, tooltip "Rainbow", undo like a normal stroke.
- Icons: Option A from https://claude.ai/artifact/FPi1XwYB376CdutaRQGMrE; glitter and rainbow ignore the paint color; SVG gradient ids unique per icon instance; top-bar icons unchanged.
- Very light paint colors (white, pale yellow) must stay visible in the icons: marks use `#c9ced6` when the paint color's relative luminance is above 0.85.
- No em dashes in user-facing copy. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Long rainbow strokes: the brush head cache must not thrash or grow without bound (24 palette colors + 36 rainbow steps). Covered in Task 1 (cache limit raised to 64, constant exported and tested).
- Selecting white or pale yellow paint: dock icons stay readable. Covered in Task 3 (`light colors fall back to grey marks`).
- Two rainbow icons on the page at once (dock + tooltip or future preview): gradient ids must not collide. Covered in Task 3 (`gradient ids are unique per uid`).
- Rainbow stroke undo: one undo removes the whole stroke. Covered by the existing `patchFromSnapshots` path; checked manually in Task 2.
- Switching color mid-session re-renders icons without breaking tooltips or the active highlight. Checked manually in Task 3.

---

### Task 1: Rainbow color function and brush head cache size

**Files:**
- Create: `src/engine/rainbow.ts`
- Test: `src/engine/rainbow.test.ts`
- Modify: `src/engine/StrokeRenderer.ts:87-122` (cache limit)

**Interfaces:**
- Produces: `RAINBOW_CYCLE_PX = 600`, `rainbowColorAt(distance: number, startHue: number): string` (returns `#rrggbb`), `hslToHex(h: number, s: number, l: number): string`; `BRUSH_HEAD_CACHE_MAX = 64` exported from `StrokeRenderer.ts`.

- [ ] **Step 1: Write the failing test**

`src/engine/rainbow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RAINBOW_CYCLE_PX, hslToHex, rainbowColorAt } from './rainbow';

describe('hslToHex', () => {
  it('converts known colors', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });
});

describe('rainbowColorAt', () => {
  it('always returns #rrggbb (brush heads append hex alpha)', () => {
    for (let d = 0; d < 2000; d += 37) expect(rainbowColorAt(d, 123)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('starts at the start hue and is half way round at half a cycle', () => {
    expect(rainbowColorAt(0, 0)).toBe(hslToHex(0, 90, 55));
    expect(rainbowColorAt(RAINBOW_CYCLE_PX / 2, 0)).toBe(hslToHex(180, 90, 55));
    expect(rainbowColorAt(RAINBOW_CYCLE_PX, 0)).toBe(hslToHex(0, 90, 55));
  });

  it('quantizes to 36 steps so brush heads can be cached', () => {
    const colors = new Set<string>();
    for (let d = 0; d < RAINBOW_CYCLE_PX * 3; d += 1) colors.add(rainbowColorAt(d, 77));
    expect(colors.size).toBe(36);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engine/rainbow.test.ts`
Expected: FAIL, cannot resolve `./rainbow`.

- [ ] **Step 3: Implement**

`src/engine/rainbow.ts`:

```ts
// Rainbow brush colour: the hue walks around the colour wheel as the stroke
// gets longer. Quantized to 36 steps so the soft brush heads (one small
// canvas per colour) can be cached and reused; a continuous hue would build
// a new head for almost every stamp.

export const RAINBOW_CYCLE_PX = 600;
const STEPS = 36;
const SATURATION = 90;
const LIGHTNESS = 55;

export function rainbowColorAt(distance: number, startHue: number): string {
  const hue = startHue + (distance / RAINBOW_CYCLE_PX) * 360;
  const step = Math.floor((((hue % 360) + 360) % 360) / (360 / STEPS));
  return hslToHex(step * (360 / STEPS), SATURATION, LIGHTNESS);
}

// Brush heads append a hex alpha to the colour, so rainbow colours must be
// #rrggbb rather than hsl() strings.
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engine/rainbow.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Raise the brush head cache limit**

In `src/engine/StrokeRenderer.ts`, below `const brushHeadCache = new Map<string, HTMLCanvasElement>();` add:

```ts
// 24 palette colours + 36 rainbow steps fit without evicting each other.
// Each head is 128x128 RGBA (64 KB), so the cap is about 4 MB.
export const BRUSH_HEAD_CACHE_MAX = 64;
```

and change `if (brushHeadCache.size > 16) {` (the brush head one, near line 114) to `if (brushHeadCache.size > BRUSH_HEAD_CACHE_MAX) {`. Leave the spray head cache at 16.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add src/engine/rainbow.ts src/engine/rainbow.test.ts src/engine/StrokeRenderer.ts
git commit -m "Add rainbow colour function and room for rainbow brush heads"
```

---

### Task 2: Rainbow tool in the engine

**Files:**
- Modify: `src/engine/App.ts:21` (Tool type), `:127-141` (stroke state), `:292-337` (`handleStrokeStart`), `:458-489` (`handleStrokeMove` default path), `:584-605` (`handleKey`)

**Interfaces:**
- Consumes: `rainbowColorAt` (Task 1), `drawBrushSegment` (existing).
- Produces: `Tool` includes `'rainbow'`.

- [ ] **Step 1: Tool type and stroke state**

In `src/engine/App.ts`:
- Add `'rainbow'` to the `Tool` union after `'brush'`.
- Add `import { rainbowColorAt } from './rainbow';`.
- Below `private lastStampPos: Point | null = null;` add:

```ts
  // Rainbow brush: hue follows the distance travelled since stroke start.
  private rainbowStartHue = 0;
  private rainbowDist = 0;
```

- [ ] **Step 2: Start a rainbow stroke**

In `handleStrokeStart`, replace the brush branch:

```ts
    } else if (this.state.tool === 'brush') {
```

with:

```ts
    } else if (this.state.tool === 'rainbow') {
      // Random start so every rainbow stroke looks a little different.
      this.rainbowStartHue = Math.random() * 360;
      this.rainbowDist = 0;
      this.strokeStyle = { ...this.strokeStyle, color: rainbowColorAt(0, this.rainbowStartHue) };
      drawBrushSegment(layer.ctx, p, p, this.strokeStyle);
    } else if (this.state.tool === 'brush') {
```

- [ ] **Step 3: Continue a rainbow stroke**

In `handleStrokeMove`, in the default per-point loop, add a branch before `} else if (tool === 'brush') {`:

```ts
      } else if (tool === 'rainbow') {
        this.rainbowDist += Math.hypot(p.x - prev.x, p.y - prev.y);
        this.strokeStyle = { ...this.strokeStyle, color: rainbowColorAt(this.rainbowDist, this.rainbowStartHue) };
        drawBrushSegment(layer.ctx, prev, p, this.strokeStyle);
```

`this.strokeStyle` is non-null here (checked at the top of `handleStrokeMove`); if TypeScript narrows it away inside the loop, capture `const style = this.strokeStyle;` before the loop and assign `this.strokeStyle = { ...style, color: ... }`.

- [ ] **Step 4: Keyboard shortcut**

In `handleKey`, add after the `'b'` line:

```ts
    else if (e.key === 'w') this.setState({ tool: 'rainbow' });
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS. (The dock button arrives in Task 3; the tool is reachable with `W` now.)

Manual: `npm run dev`, press `W`, draw a long curve: colours cycle smoothly through the rainbow, about one cycle per 600 document px. One Undo removes the whole stroke.

- [ ] **Step 6: Commit**

```bash
git add src/engine/App.ts
git commit -m "Add Rainbow brush tool to the engine (shortcut W)"
```

---

### Task 3: Option A tool icons, tinted by paint color

**Files:**
- Create: `src/ui/toolIcons.ts`
- Test: `src/ui/toolIcons.test.ts`
- Modify: `src/ui/KidUI.ts:40-76` (tool list, icons, names), `:111-124` (dock build), `:213-222` (subscribe), `:503-800` (delete old tool icon functions `brushSvg` … `eraserSvg`)
- Modify: `src/ui/styles.css:331-341` (rainbow border accent)

**Interfaces:**
- Consumes: `Tool` including `'rainbow'` (Task 2).
- Produces: `type DockTool = 'pen' | 'brush' | 'rainbow' | 'fill' | 'eraser' | 'line' | 'circle' | 'rect' | 'spray' | 'glitter' | 'stamp' | 'blur'`; `toolIconSvg(tool: DockTool, color: string, uid: string): string`; `markColor(color: string): string`.

- [ ] **Step 1: Write the failing test**

`src/ui/toolIcons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markColor, toolIconSvg, type DockTool } from './toolIcons';

const ALL: DockTool[] = ['pen', 'brush', 'rainbow', 'fill', 'eraser', 'line', 'circle', 'rect', 'spray', 'glitter', 'stamp', 'blur'];

describe('toolIconSvg', () => {
  it('returns one svg per tool', () => {
    for (const t of ALL) {
      const svg = toolIconSvg(t, '#e74c3c', 'x');
      expect(svg.startsWith('<svg viewBox="0 0 64 64"')).toBe(true);
      expect(svg.trim().endsWith('</svg>')).toBe(true);
    }
  });

  it('tints the mark with the paint color', () => {
    for (const t of ALL.filter((t) => t !== 'rainbow' && t !== 'glitter')) {
      expect(toolIconSvg(t, '#3498db', 'x')).toContain('#3498db');
    }
  });

  it('rainbow and glitter ignore the paint color', () => {
    expect(toolIconSvg('rainbow', '#3498db', 'x')).not.toContain('#3498db');
    expect(toolIconSvg('glitter', '#3498db', 'x')).not.toContain('#3498db');
  });

  it('gradient ids are unique per uid', () => {
    const a = toolIconSvg('rainbow', '#000000', 'dock');
    const b = toolIconSvg('rainbow', '#000000', 'other');
    expect(a).toContain('id="rb-dock"');
    expect(a).toContain('url(#rb-dock)');
    expect(b).toContain('id="rb-other"');
  });
});

describe('markColor', () => {
  it('light colors fall back to grey marks, others pass through', () => {
    expect(markColor('#ffffff')).toBe('#c9ced6');
    expect(markColor('#fff176')).toBe('#c9ced6');
    expect(markColor('#e74c3c')).toBe('#e74c3c');
    expect(markColor('#000000')).toBe('#000000');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/toolIcons.test.ts`
Expected: FAIL, cannot resolve `./toolIcons`.

- [ ] **Step 3: Implement toolIcons.ts**

`src/ui/toolIcons.ts` (drawings copied from the approved Option A preview):

```ts
// Dock tool icons, "tool + its mark" style: a chunky flat tool with a thick
// outline plus the line or shape it makes, drawn in the current paint
// colour, so a child learns "this one makes that". Glitter and Rainbow have
// their own colours and ignore the paint colour.

export type DockTool =
  | 'pen' | 'brush' | 'rainbow' | 'fill' | 'eraser' | 'line'
  | 'circle' | 'rect' | 'spray' | 'glitter' | 'stamp' | 'blur';

const K = '#2a2a3a';
const LIGHT_MARK = '#c9ced6';

// White or pale paint would vanish on the white dock button; show those
// marks in light grey instead (relative luminance above 0.85).
export function markColor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.85 ? LIGHT_MARK : color;
}

function rainbowGradient(id: string): string {
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#ff4d4d"/><stop offset=".2" stop-color="#ff9f1c"/><stop offset=".4" stop-color="#ffe14d"/><stop offset=".6" stop-color="#4cd964"/><stop offset=".8" stop-color="#3fa9ff"/><stop offset="1" stop-color="#a45cff"/></linearGradient></defs>`;
}

const DRAW: Record<DockTool, (c: string, uid: string) => string> = {
  pen: (c) => `<path d="M8 56 C 18 46, 26 58, 36 50" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <g transform="rotate(45 38 26)"><rect x="32" y="4" width="12" height="34" rx="2" fill="#ffd23f" stroke="${K}" stroke-width="3"/>
    <rect x="32" y="4" width="12" height="7" rx="2" fill="#ff8fab" stroke="${K}" stroke-width="3"/>
    <path d="M32 38 L38 50 L44 38 Z" fill="#f6d7a7" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 46 L38 50 L40 46 Z" fill="${c}"/></g>`,
  brush: (c) => `<path d="M6 54 C 16 42, 26 60, 38 50" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" opacity=".9"/>
    <g transform="rotate(45 40 24)"><rect x="35" y="0" width="10" height="26" rx="4" fill="#d97a3a" stroke="${K}" stroke-width="3"/>
    <rect x="33" y="26" width="14" height="7" fill="#c9ced6" stroke="${K}" stroke-width="3"/>
    <path d="M33 33 Q 33 46 40 50 Q 47 46 47 33 Z" fill="${c}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></g>`,
  rainbow: (_c, uid) => {
    const id = `rb-${uid}`;
    return `${rainbowGradient(id)}<path d="M6 54 C 16 40, 28 62, 40 48" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linecap="round"/>
    <g transform="rotate(45 40 24)"><rect x="35" y="0" width="10" height="26" rx="4" fill="#a45cff" stroke="${K}" stroke-width="3"/>
    <rect x="33" y="26" width="14" height="7" fill="#ffd23f" stroke="${K}" stroke-width="3"/>
    <path d="M33 33 Q 33 46 40 50 Q 47 46 47 33 Z" fill="url(#${id})" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></g>
    <path d="M50 6 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#ffd23f" stroke="${K}" stroke-width="1.5"/>`;
  },
  fill: (c) => `<path d="M10 22 L30 8 L48 30 L28 44 Z" fill="#8fd3ff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 22 Q 20 32 30 30 L48 30" fill="none" stroke="${K}" stroke-width="3"/>
    <path d="M44 32 Q 54 40 52 50" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="44" cy="56" rx="16" ry="5" fill="${c}" stroke="${K}" stroke-width="3"/>`,
  eraser: (c) => `<path d="M8 50 L 46 50" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 10" opacity=".7"/>
    <g transform="rotate(-30 36 30)"><rect x="18" y="20" width="36" height="20" rx="4" fill="#ff8fab" stroke="${K}" stroke-width="3"/>
    <rect x="18" y="20" width="14" height="20" rx="4" fill="#ffffff" stroke="${K}" stroke-width="3"/></g>`,
  line: (c) => `<line x1="8" y1="54" x2="56" y2="42" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
    <g transform="rotate(-14 32 24)"><rect x="4" y="16" width="56" height="16" rx="3" fill="#ffd23f" stroke="${K}" stroke-width="3"/>
    <path d="M14 16v6 M24 16v9 M34 16v6 M44 16v9 M54 16v6" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/></g>`,
  circle: (c) => `<circle cx="32" cy="32" r="21" fill="none" stroke="${c}" stroke-width="7"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="${K}" stroke-width="2" opacity=".35"/>
    <circle cx="47" cy="17" r="6" fill="#fff" stroke="${K}" stroke-width="3"/>`,
  rect: (c) => `<rect x="11" y="11" width="42" height="42" rx="5" fill="none" stroke="${c}" stroke-width="7"/>
    <rect x="11" y="11" width="42" height="42" rx="5" fill="none" stroke="${K}" stroke-width="2" opacity=".35"/>
    <circle cx="53" cy="53" r="6" fill="#fff" stroke="${K}" stroke-width="3"/>`,
  spray: (c) => `<rect x="30" y="22" width="24" height="36" rx="6" fill="#c9ced6" stroke="${K}" stroke-width="3"/>
    <rect x="30" y="32" width="24" height="12" fill="${c}" stroke="${K}" stroke-width="3"/>
    <rect x="36" y="12" width="12" height="10" rx="2" fill="#fff" stroke="${K}" stroke-width="3"/>
    <g fill="${c}"><circle cx="24" cy="14" r="2.6"/><circle cx="16" cy="10" r="2"/><circle cx="18" cy="20" r="2.6"/><circle cx="9" cy="16" r="2"/><circle cx="11" cy="26" r="2.4"/><circle cx="22" cy="27" r="1.8"/><circle cx="6" cy="8" r="1.6"/></g>`,
  glitter: () => `<line x1="12" y1="54" x2="36" y2="30" stroke="${K}" stroke-width="9" stroke-linecap="round"/>
    <line x1="12" y1="54" x2="36" y2="30" stroke="#a45cff" stroke-width="4" stroke-linecap="round"/>
    <path d="M40 8 l5 11 12 2 -9 8 2 12 -10 -6 -10 6 2 -12 -9 -8 12 -2z" fill="#ffd23f" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M12 16 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" fill="#ff5fa2"/>
    <path d="M56 46 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" fill="#3fa9ff"/>`,
  stamp: (c) => `<path d="M32 60 C 12 48, 10 36, 20 32 C 26 30, 30 34, 32 37 C 34 34, 38 30, 44 32 C 54 36, 52 48, 32 60 Z" fill="${c}" opacity=".85"/>
    <circle cx="32" cy="10" r="7" fill="#d97a3a" stroke="${K}" stroke-width="3"/>
    <rect x="28" y="16" width="8" height="10" fill="#d97a3a" stroke="${K}" stroke-width="3"/>
    <rect x="14" y="26" width="36" height="8" rx="3" fill="#c9ced6" stroke="${K}" stroke-width="3"/>`,
  blur: (c) => `<path d="M6 44 C 20 36, 30 52, 50 44" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" opacity=".35"/>
    <path d="M6 44 C 14 40, 20 44, 24 45" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
    <path d="M26 42 L26 14 Q26 8 31 8 Q36 8 36 14 L36 30 L44 30 Q50 30 50 36 L50 44 Q50 54 40 54 L32 54 Q26 54 26 48 Z" fill="#ffd9b8" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 30v6 M43 31v5" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`,
};

export function toolIconSvg(tool: DockTool, color: string, uid: string): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${DRAW[tool](markColor(color), uid)}</svg>`;
}
```

Note: the `brush` and `spray` drawings use `#c9ced6` for the metal parts. The "tints the mark" test passes a mid-blue, so it is unaffected; `markColor` only returns `#c9ced6` for very light paint.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/toolIcons.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use the icons in the dock**

In `src/ui/KidUI.ts`:
- Add `import { toolIconSvg, type DockTool } from './toolIcons';`.
- Replace the `type Tools = Extract<Tool, ...>` line, `TOOL_LIST`, `TOOL_ICONS` and `TOOL_NAMES` with:

```ts
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
```

- In the dock build loop, replace `b.innerHTML = TOOL_ICONS[t];` with `b.innerHTML = toolIconSvg(t, app.state.color, t);`.
- In the `app.subscribe` callback, add at the top (declare `let iconColor = app.state.color;` just above `app.subscribe(`):

```ts
    // Redraw the dock icons in the new paint colour so each icon shows the
    // mark it will make.
    if (s.color !== iconColor) {
      iconColor = s.color;
      (Object.entries(toolBtns) as [Tools, HTMLButtonElement][]).forEach(([id, b]) => {
        b.innerHTML = toolIconSvg(id, s.color, id);
      });
    }
```

- Delete the now-unused functions `brushSvg`, `penSvg`, `circleSvg`, `rectSvg`, `lineSvg`, `blurSvg`, `spraySvg`, `glitterSvg`, `stampSvg`, `fillSvg`, `eraserSvg` and their leading comments. Keep `undoSvg`, `redoSvg`, `trashSvg`, `gearSvg`, fullscreen, `aiSparkleSvg`, `picturesSvg`, chevrons, slider icons.

Before deleting, check `attachTooltip` does not store the button's `innerHTML` (read `src/ui/Tooltip.ts`); if it does, re-attach after re-render.

- [ ] **Step 6: Rainbow border accent**

In `src/ui/styles.css`, after `.kid-tool[data-tool="brush"] { border-color: #ff6b9d; }` add:

```css
.kid-tool[data-tool="rainbow"] { border-color: #a45cff; }
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: PASS.
Manual: dock shows 12 icons in the new style; tapping red, blue, white paint recolors pen/brush/fill/eraser/ruler/circle/square/spray/stamp/magic finger marks (white shows grey); glitter and rainbow keep their own colours; the active tool highlight and tooltips still work after a colour change; the Rainbow button selects the rainbow brush.

- [ ] **Step 8: Commit**

```bash
git add src/ui/toolIcons.ts src/ui/toolIcons.test.ts src/ui/KidUI.ts src/ui/styles.css
git commit -m "Redraw dock tool icons in the tool-plus-mark style, tinted by paint colour"
```

---

### Task 4: Docs

**Files:**
- Modify: `README.md` (Features tool list, Keyboard)
- Modify: `PROJECT.md` (Tool roster, architecture tree, known issues about brush cache)
- Modify: `docs/device-checklist-part-a.md` → append a "Part B" section

- [ ] **Step 1: README**

- Features: "11 drawing tools" becomes "12 drawing tools" and add "rainbow brush (colour cycles as you draw)" after "brush (soft radial-gradient stamps)".
- Keyboard: add `W` rainbow after `B` brush.

- [ ] **Step 2: PROJECT.md**

- Architecture tree: add `rainbow.ts                 Rainbow brush colour (distance → hex)` under engine and `toolIcons.ts               Dock icons (tool + mark, tinted by paint colour)` under ui.
- Tool roster section: add Rainbow (brush stamps, hue by distance, 36 cached steps, `W`).
- Known issues: change "Spray and brush head caches can grow. Bounded at 16 entries each" to "Brush heads are capped at 64 (palette + rainbow steps), spray heads at 16, FIFO eviction."

- [ ] **Step 3: Checklist**

Append to `docs/device-checklist-part-a.md`:

```markdown

## Part B (icons and Rainbow brush)

- [ ] The dock shows 12 icons; each one shows the mark it makes.
- [ ] Pick red, then blue, then white paint: the icon marks change colour (white shows light grey).
- [ ] Rainbow brush: a long stroke cycles through the colours smoothly, and one Undo removes it.
- [ ] Drawing with Rainbow stays smooth on the tablet (no stutter on long strokes).
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add README.md PROJECT.md docs/device-checklist-part-a.md
git commit -m "Document Rainbow brush and new tool icons"
```
