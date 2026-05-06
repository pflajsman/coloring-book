# Coloring Book

A stylus-friendly coloring book PWA for young kids. Vite + TypeScript, no framework.

Live: deployed via GitHub Actions to Azure Static Web Apps on every push to `main`.

## Features

- **11 drawing tools** — pen (crisp thin line), brush (soft radial-gradient stamps), fill (off-thread flood fill), eraser, ruler (straight lines), circle, rectangle, spray (paint-can mist), glitter (rainbow sparkle wand), stamps (star/heart/flower/sparkle imprints), magic finger (smudge / blur)
- **Pressure-sensitive strokes** with 3-point spline smoothing and `getCoalescedEvents` for high-Hz pen input
- **Smart flood fill** in a Web Worker — handles SVG line art, user-drawn shapes, and re-coloring with a saturation-aware matcher and edge-bleed dilation (no white halos)
- **3 layers** (background / paint / line art) with per-layer visibility & opacity
- **Undo / redo** (50 steps) via the command pattern
- **24-color palette** with chevron-button scrolling, organized basics-first
- **Always-visible brush size slider** in the top bar
- **PWA** — installable, offline, opens fullscreen on Android home-screen launch
- **54 line-art templates** across Animals, Vehicles, Nature, Food, Fantasy, Places — all CC0 from openclipart.org, lazy-loaded with category filter
- **Project saving** — IndexedDB store, name / rename / delete, export as PNG
- **Tablet-first** — palm rejection, custom long-press menu suppression, OS callout disabled, fullscreen toggle

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173/.

## Build

```bash
npm run build      # typecheck + production build to dist/
npm run preview    # serve dist/ locally
```

## Keyboard

- `P` pen, `B` brush, `G` fill, `E` eraser, `L` ruler, `C` circle, `R` rectangle, `S` spray, `I` glitter, `T` stamps, `U` magic finger, `H` pan
- `Ctrl+Z` undo, `Ctrl+Y` / `Ctrl+Shift+Z` redo

## Adding new templates

Drop a CC0 line-art SVG in `public/templates/` and add an entry to `public/templates/manifest.json`:

```json
{ "id": "rabbit", "name": "Rabbit", "file": "rabbit.svg", "category": "Animals" }
```

The rasterizer strips white interior fills, letterboxes the SVG with a 6% margin, and centers it on the 1200×800 canvas — so any SVG with a proper `viewBox` works.

## Architecture

```
src/
  engine/                Pure canvas logic (no DOM/UI)
    App.ts               Input → tools → render loop
    Document.ts          Document + layer list
    Layer.ts             OffscreenCanvas wrapper
    Viewport.ts          Pan/zoom with per-edge insets
    PointerInput.ts      Pointer events, palm rejection, gestures
    StrokeRenderer.ts    Brush stamps, spline smoothing, pressure→width
    commands.ts          Stroke/Fill commands, History
    fillClient.ts        Main-thread side of worker fill
  workers/
    floodFill.worker.ts  Off-thread fill with edge-bleed dilation
  storage/db.ts          IndexedDB project store (idb)
  templates/index.ts     Manifest loader + SVG rasterizer
  ui/                    KidUI, Modal, Tooltip, styles.css
  types/document.ts      Op + meta types
  main.ts                Boot

public/
  templates/             54 SVGs + manifest.json
  icons/                 PWA icons
  favicon.svg, apple-touch-icon.png
```

## Deployment

GitHub Actions → Azure Static Web Apps (Free tier). Workflow at `.github/workflows/azure-static-web-apps.yml`. SPA fallback + cache headers in `staticwebapp.config.json`.

## More detail

See [`PROJECT.md`](./PROJECT.md) for an in-depth handoff document covering architecture decisions, the fill algorithm, layer compositing, the decisions log, known issues, and where to make common changes.
