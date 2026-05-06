# Coloring Book — Project Handoff

A stylus-friendly PWA coloring book for young kids (target audience: ~3 years old). Built solo over multiple sessions; this doc captures architecture, decisions, gotchas, and how to keep going.

The user-facing summary lives in `README.md`. This document is for the developer.

---

## What it is

Single-page web app, no framework. Vite + TypeScript + plain DOM. Renders to a full-screen `<canvas>`, layers the UI as floating panels on top, persists drawings in IndexedDB, deploys to Azure Static Web Apps via GitHub Actions.

Target devices: tablets with stylus support (iPad, Surface, Android) primarily; desktop and phone work too.

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 7 | Fast HMR, native TS, small bundles |
| Language | TypeScript 6 (strict) | Catches bugs at the boundary; no runtime cost |
| Framework | None | Drawing apps are 90% canvas + DOM; React/Vue add overhead without help |
| Storage | IndexedDB via `idb` | Layer blobs are big; localStorage isn't enough |
| PWA | `vite-plugin-pwa` | Service worker + manifest + offline cache for free |
| Hosting | Azure Static Web Apps (Free tier) | Free SSL, free custom domain, GitHub Actions integration, PR previews |

Bundle size: ~50 KB JS / ~13 KB CSS gzipped + ~5 MB of bundled SVG templates.

## Architecture

```
src/
  engine/                      Pure canvas logic, no DOM/UI
    App.ts                     Wires input → tools → render loop
    Document.ts                Document = list of layers
    Layer.ts                   OffscreenCanvas wrapper
    Viewport.ts                Pan/zoom transform with per-edge insets
    PointerInput.ts            Pointer events, palm rejection, gestures
    StrokeRenderer.ts          Brush stamps, spline smoothing, pressure→width
    commands.ts                StrokeCommand, FillCommand, History
    fillClient.ts              Main-thread side of worker fill
  workers/
    floodFill.worker.ts        Off-main-thread fill w/ edge bleed dilation
  storage/
    db.ts                      IndexedDB project store (idb)
  templates/
    index.ts                   Manifest loader + SVG rasterizer (strips white fills)
  ui/
    KidUI.ts                   Tool dock, palette, top bar — all of the chrome
    Modal.ts                   Modal + promptDialog + confirmDialog helpers
    Tooltip.ts                 Hover tooltips (singleton)
    LayerPanel.ts              Layer list (currently unused — kept for future)
    styles.css
  types/
    document.ts                Op + meta types (designed for future delta sync)
  main.ts                      Boot, wires UI ↔ engine, handles save/load actions

public/
  templates/                   *.svg files + manifest.json (54 templates)
  icons/                       PWA icons (192, 512, 512-maskable)
  apple-touch-icon.png         iOS home-screen icon (180×180)
  favicon.svg                  Tab icon
```

### How a stroke flows

1. User puts finger/stylus on the canvas.
2. `PointerInput` fires `pointerdown`, captures the pointer, calls `App.handleStrokeStart(p)`.
3. `App` snapshots the active layer's pixels into `strokeBefore` (used later for undo) and stores a per-tool live state (e.g. `shapeAnchor` for line/circle/rect, `sprayPoint` for spray).
4. On each `pointermove`, `getCoalescedEvents()` returns all the high-frequency samples the OS batched into this frame. We render them to the layer using the per-tool path (`drawLineSegment` for pen, `drawBrushSegment` (radial-gradient stamp) for brush, `spraySplatter` for spray, `blurStamp` for the magic-finger tool, `drawSmoothSegment` for default 3-point spline smoothing).
5. On `pointerup`, the rendered layer is snapshotted again into `after`, and a `StrokeCommand` is built carrying `strokePoints`, `style`, `before`, `after`, `bbox`. It's pushed into `History`.
6. Undo restores `before`. Redo blits `after`. No re-rendering needed.

Shape tools (line, circle, rect) work the same except their `pointermove` handler **restores the snapshot first** then redraws the shape from anchor to current position, so the preview is non-destructive.

### How fill works

The fill is more involved than typical paint apps because we want it to handle three different cases cleanly:

1. **Tap white inside a black-line SVG template** — fill the enclosed white region, blend smoothly with the AA edges of the line art.
2. **Tap white inside a user-drawn closed shape** (e.g. a circle drawn with the brush) — same thing, but the boundary is a colored stroke instead of black ink.
3. **Tap an already-colored region** — re-fill with a new color.

The worker (`workers/floodFill.worker.ts`) receives:
- `source`: composite of ALL visible layers (including the target). This is the boundary-detection image. **Including the target is essential** so user-drawn strokes act as fill barriers.
- `target`: a copy of the target layer's pixels. The fill writes onto this and we blit the result back.
- `x, y, color, tolerance`.

The matcher classifies pixels two ways depending on the seed:

- **Light seed** (white background tap): a pixel is "in" the fill iff it's BOTH light enough AND unsaturated enough. Saturation threshold is tight (≥30 → barrier) so faint AA halos around colored strokes count as a barrier and don't leak. This is the trick that makes "tap inside a brush-drawn circle" work — without it the fill walks through the AA halo and reaches the background.
- **Color seed** (re-fill case): standard RGB-distance-to-seed match.

After the main fill, an **edge-bleed pass** dilates by 1 iteration:
- "Halo" pixels (clearly light + low-to-mid saturation, looks like AA edge of a colored stroke) get **promoted to the neighbor's full coverage**, eating the visible white halo against colored strokes.
- "Mid-grey" pixels (looks like AA gradient of black SVG line art) keep their soft-band partial coverage so smooth AA stays smooth.
- Already-saturated barrier pixels are left alone.

Coverage is composited as `over` so re-fill blends with existing pixels naturally.

### How layers work

A `Document` has 3+ layers:

- **Background** (locked, white) — the paper. Locked so the user can't paint on it directly.
- **Paint** (active by default) — where strokes go.
- **Line art** (locked) — the loaded template SVG, rasterized.

Compositing order is bg → paint → line art. The line art sits **on top** so the lines are always visible above the kid's color.

The template rasterizer (`templates/index.ts`) does an important post-process: it walks the rasterized ImageData and **converts near-white pixels to fully transparent**. Without this, openclipart SVGs with `fill="#ffffff"` interior paths (cat.svg, dog.svg, etc. — most of them) would cover the paint layer underneath and the kid's coloring would be invisible. Pixels darker than ~lightness 64 stay opaque (the lines themselves), pixels in between get linearly faded alpha (the anti-aliased edge gradient).

Templates also get **letterboxed** with a 6% margin so the picture doesn't touch the canvas edges — small drawings, big drawings, square drawings, all centered with breathing room.

### Tool roster (current)

| Tool | Key | What it does |
|---|---|---|
| Pen | P | Crisp thin 3px line, no pressure, `lineTo` segments |
| Brush | B | Soft radial-gradient stamp head, dense step-stamping along path |
| Ruler | L | Click-drag straight line, live preview, snapshot/restore |
| Circle | C | Click-drag ellipse from corner to corner, 64-segment polyline |
| Rectangle | R | Click-drag rectangle, 5-point stroke |
| Spray | S | Two-pass: soft mist gradient stamps + speckle dots, time-based emit (RAF loop) |
| Magic finger | U | Reads layer pixels, applies 3×3 box blur through a soft-circular mask |
| Fill | G | Off-thread flood fill, light/color seed paths, edge bleed dilation |
| Eraser | E | `destination-out` composite operation |

Each tool has its own border color in the dock to be recognizable at a glance. Pen=cyan, Brush=pink, Ruler=yellow, Circle=teal, Rectangle=coral, Spray=lavender, Blur=orange, Fill=green, Eraser=peach.

## UI layout

Top bar (always visible, single row that wraps below 1100 px):
- Left: **Pictures**, **Clear**, **Undo**
- Center: **Brush size** slider (centered, fluid width)
- Right: **Settings**, **Fullscreen**

Side panels (anchored top-100px / bottom-16px, scrollable with chevron buttons):
- Left: **color palette** (24 colors, basics first then shades)
- Right: **tool dock** (9 tools)

Both side panels use a single-column scrolling pattern with up/down chevrons. Press-and-hold on a chevron auto-scrolls (350 ms delay then 120 ms repeat).

Settings dialog (gear button):
- Brush size slider (also in topbar — duplicated as fallback for narrow viewports)
- Pressure sensitivity slider
- Stylus-only toggle (palm rejection)
- Save project / Save as PNG / My projects

Picker dialog (pictures button): grouped by category (Animals, Vehicles, Nature, Food, Fantasy, Places, Other). Filter chips at the top. Lazy-loaded SVG thumbnails.

## Storage / projects

`storage/db.ts` writes to IndexedDB via `idb`:
- `documents` store, keyed by `meta.id`.
- Each record: `{ meta, activeLayerId, layers: [{ id, name, visible, opacity, locked, blob, isTemplate }] }`.
- Layers are persisted as PNG blobs (compact, fast to load).

Naming: a fresh document is "Untitled" and won't auto-save. The first manual Save prompts for a name (`promptDialog`). Subsequent saves on the same doc are silent. The projects list lets you Open / Rename / Delete.

`beforeunload` auto-saves the current project IF it has been explicitly named — so reloading the page doesn't pollute the projects list with anonymous Untitled records.

## PWA

Service worker auto-precaches every static asset (HTML, JS, CSS, SVG, PNG, woff2) on install. ~150 entries, ~5 MB total.

Manifest (`vite.config.ts`):
- `display: 'fullscreen'` with `display_override: ['fullscreen', 'standalone', 'minimal-ui']` — Android opens in true fullscreen, iOS falls back to standalone (best iOS allows for installed PWAs).
- Theme color matches the cream icon background `#fff8dc`.
- Icons: 192, 512, 512-maskable (for Android adaptive icons), apple-touch-icon (180×180).

Install flow per platform:
- **Android Chrome/Edge**: install banner, or menu → "Install app".
- **iOS Safari**: Share → Add to Home Screen.
- **Desktop Edge/Chrome**: address-bar install icon.

After install, the home-screen launch should be edge-to-edge fullscreen on Android. The in-app fullscreen button (top-right) toggles fullscreen at runtime regardless of install state.

## Templates (54 total)

Indexed by `public/templates/manifest.json`. Each entry: `{ id, name, file, category }` where `file` is null for the special "blank" entry.

All artwork is **CC0 / public domain** from openclipart.org. To add a new template:
1. Drop the SVG in `public/templates/`.
2. Add a manifest entry.
3. Done — no code changes, no rebuild needed for runtime, but a deploy is needed to push it to production.

The rasterizer handles arbitrary SVG sizes via uniform-scale letterbox into a 1200×800 canvas with 6% margin.

Categories:
- **Animals** (22): cat, dog, horse, tiger, bear, teddy, monkey, owl, frog, snake, turtle, rabbit, mouse, sheep, cow, pig, duck, snail, elephant, fish, butterfly, dinosaur
- **Vehicles** (4): car, rocket, train, bicycle
- **Nature** (7): tree, flower, sun, moon, cloud, rainbow, mushroom
- **Food** (2): apple, cherry
- **Fantasy** (12): 7 unicorns, 5 princesses, dragon, robot, witch, santa
- **Places** (1): house
- **Other** (1): blank

## Deployment

GitHub Actions workflow in `.github/workflows/azure-static-web-apps.yml`. On every push to `main`:

1. `npm ci`
2. `npm run build`
3. Upload `dist/` to Azure Static Web Apps (using the deployment token in `AZURE_STATIC_WEB_APPS_API_TOKEN_PROUD_SAND_07BDFCC03`).

Azure Static Web App resource:
- Subscription: `54761565-d9ac-4cc2-ba09-87e397b8c7c8`
- Resource group: `coloring-book`
- SKU: Free
- Hostname: `proud-sand-07bdfcc03.azurestaticapps.net` (auto-generated; custom domain not configured yet)

`staticwebapp.config.json` handles SPA fallback, MIME types, immutable cache for `/assets/*`, no-cache for `index.html`/`sw.js`/manifest. PR previews work automatically.

## Decisions log

Things that bit us and how we settled them:

- **No framework** — drawing apps are mostly canvas + a few panels of buttons. React's overhead and re-render model don't help here.
- **Persistence per layer as PNG blobs** vs. op-replay log — PNG blobs are simpler and faster. The `types/document.ts` Op type is in place if we ever want to add server-side delta sync, but for now the op log isn't actually built up.
- **Stroke history snapshots** vs. per-stroke replay — full-canvas before/after `ImageData` is fast for typical 1200×800 canvases. For larger canvases we'd need bbox-clipped snapshots; the `bbox` field in `StrokeCommand` is already wired but the implementation uses the full canvas.
- **Worker for fill, not for paint** — fill is the only operation slow enough to need off-main-thread. Stroke rendering is sub-millisecond per segment; moving it to a worker would cost more in postMessage latency than it saves.
- **Brush as gradient stamp**, not `lineTo` — gives the soft painterly edges that read as "real brush". Cached per color so it's basically free at runtime.
- **Light-seed vs. color-seed fill matchers** — single matcher couldn't handle both "tap white inside a colored shape" and "re-color an existing region" cleanly. Branch on seed lightness/saturation.
- **Edge-bleed dilation pass** after fill — eliminates the white halo around drawn-shape boundaries. Distinguishes between "AA halo of a colored stroke" (promote to full coverage) and "AA gradient of black ink line" (keep partial coverage for smooth blend).
- **Strip white fills from rasterized templates** — half the openclipart SVGs have `fill="#ffffff"` interior paths that would cover the paint layer underneath. Post-process to transparent at rasterize time.
- **`shapeAnchor` for line/circle/rect** — preview tools rebuild `strokePoints` on every move; without a separate anchor, `strokePoints[0]` drifts and the shape collapses.
- **Hide native scrollbars on side panels, use chevrons** — kids don't recognize scrollbars; chevrons are obvious. Press-and-hold for continuous scroll.
- **Layout: scrollable single-column panels, never reflow into multiple columns** — flex-wrap into 2 columns produced ugly layouts with cropped icons. Single column + scrolling is consistent on every viewport.
- **Tooltips on hover, not on touch** — `pointerType === 'mouse'` only. On stylus/touch, the immediate action is what the user wants; tooltips would be distracting.
- **Suppress `contextmenu` globally** — `<canvas>` long-press fires the iOS callout sheet ("Save Image / Inspect"). Suppressing on the document root handles toolbar/panel backgrounds too.
- **`display: fullscreen` in manifest** — Android opens edge-to-edge after install. iOS falls back to standalone (the best it allows).

## Known issues / future work

In rough priority order:

- **Custom domain not wired up.** Default `*.azurestaticapps.net` URL works but the user wants their own domain eventually. Add CNAME → SWA hostname in DNS, then add custom domain in Azure portal.
- **Brush head cache key by color only.** If we ever add a "brush opacity" or "brush hardness" setting, the cache key needs to include those.
- **Stroke history uses full-canvas ImageData.** Fine at 1200×800; for bigger documents (4K+), switch to bbox-tile snapshots. The `bbox` field in `StrokeCommand` is already there.
- **Ops not actually recorded.** `types/document.ts` defines the op shape but `App.ts` doesn't push to an op log. If we want delta-sync someday, plumb that through.
- **Layer panel UI** (`LayerPanel.ts`) exists but isn't surfaced in the kid UI. Could be exposed in a "grown-up mode" later.
- **Fill rendering is single-threaded inside the worker.** For very large fills it can take 200+ ms. Could be split into chunks with cooperative yielding, but that complicates the algorithm. Currently fine in practice.
- **Spray and brush head caches can grow.** Bounded at 16 entries each, with FIFO eviction. If a kid rapidly cycles through 24 colors the cache thrashes — minor regen cost, no leak.
- **Some templates leak fill.** Cars and elephants with dotted shading textures have many tiny enclosed regions; flood fill correctly stops at each dot, leaving the dotted areas un-colored. Looks reasonable as "shading on a coloring page" but isn't visually identical to the rest. Could pre-process those templates to remove dot textures.
- **Settings dialog feels redundant** with most of its sliders also in the topbar. Could be slimmed down to just `Stylus only` + the action buttons, but kept the sliders as a fallback for narrow viewports.

## How to keep going

Start the dev server (`npm run dev`) and open http://localhost:5173/. HMR works for everything except the Web Worker (`workers/floodFill.worker.ts`) — changes there require a hard refresh because Vite bundles workers separately and the browser caches the worker module.

When testing on a real tablet, deploy to Azure (just push to main) and add the resulting URL to the home screen. The PWA will pick up updates automatically on next launch — but the **first** launch after a manifest change needs a fresh install to take effect (`display: fullscreen` only applies on install).

Files most likely to need edits:

- **Adding a tool**: extend `Tool` union in `App.ts`, branch in `handleStrokeStart`/`handleStrokeMove`, add icon + entry in `KidUI.ts`'s `TOOL_LIST`/`TOOL_ICONS`/`TOOL_NAMES`, add a CSS border accent.
- **Adding a template**: drop SVG in `public/templates/`, append to `manifest.json`. Done.
- **Tweaking fill behavior**: `workers/floodFill.worker.ts`. Always hard-refresh after editing — the worker bundle is cached.
- **Tweaking brush feel**: `engine/StrokeRenderer.ts`. The brush head gradient (`getBrushHead`) is the main lever for "soft" vs. "hard" edges.
- **Layout changes**: `ui/styles.css` is split into clearly-headed sections. Float panels live in `.kid-topbar`, `.kid-palette`, `.kid-dock`.

Always run `npm run build` before pushing — it does both `tsc --noEmit` (typecheck) and the Vite production build. CI runs the same command.
