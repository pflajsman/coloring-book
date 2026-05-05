# Coloring Book

A stylus-friendly coloring web app for kids. Vite + TypeScript, no framework.

## Features

- **5 drawing tools**: pen (crisp thin line), brush (soft radial-gradient stamps), spray (paint-can mist), fill (worker-driven flood fill), eraser
- **Pressure-sensitive strokes** with quadratic-spline smoothing and `getCoalescedEvents` for high-Hz pen input
- **Smart flood fill** running in a Web Worker, with edge-bleed dilation so fills blend into anti-aliased line edges (no white halos)
- **Layers** (background / paint / line art), per-layer visibility & opacity
- **Command-pattern undo/redo** (50 steps)
- **PWA + offline**: service worker via `vite-plugin-pwa`, projects saved to IndexedDB
- **40+ line-art templates** across categories (animals, vehicles, nature, food, fantasy) — all CC0 from openclipart.org, lazy-loaded from `/public/templates/`
- **Touch + stylus support**: palm rejection, pinch zoom, custom long-press menu suppression
- **Project saving**: name your drawings, rename, delete, export as PNG

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173/.

## Build

```bash
npm run build
npm run preview
```

## Architecture

```
src/
  engine/
    App.ts              Wires input + history + render loop
    Document.ts         Document + layer list
    Layer.ts            OffscreenCanvas wrapper
    Viewport.ts         Pan/zoom transform
    PointerInput.ts     Pointer events, palm rejection, gestures
    StrokeRenderer.ts   Brush stamps, spline smoothing, pressure->width
    commands.ts         StrokeCommand, FillCommand, History
    fillClient.ts       Main-thread side of worker fill
  workers/
    floodFill.worker.ts Off-main-thread fill w/ soft edges + dilation
  storage/
    db.ts               IndexedDB project store (idb)
  templates/
    index.ts            Manifest loader + SVG rasterizer
  ui/
    KidUI.ts            Tool dock, palette, top bar
    LayerPanel.ts       Layer list w/ opacity sliders
    Modal.ts            Modal + prompt + confirm dialogs
    Tooltip.ts          Hover tooltips
    styles.css
  types/
    document.ts         Op + meta types
public/
  templates/            *.svg files + manifest.json
  favicon.svg, icons/
```

The op/meta types in `types/document.ts` are sized for a future delta-sync
backend (each operation has an id and layerId; layer pixel state can be
reconstructed from a snapshot + ops).

## Keyboard

- `P` pen, `B` brush, `S` spray, `G` fill, `E` eraser, `H` pan
- `Ctrl+Z` undo, `Ctrl+Y` / `Ctrl+Shift+Z` redo

## Adding new templates

Drop a clean line-art SVG in `public/templates/` and add an entry to
`public/templates/manifest.json`:

```json
{ "id": "rabbit", "name": "Rabbit", "file": "rabbit.svg", "category": "Animals" }
```

The rasterizer strips white interior fills automatically and letterboxes the
SVG into the canvas with a 6% margin, so any SVG with proper viewBox works.

## Deployment

Deployed via GitHub Actions to Azure Static Web Apps on every push to `main`.
See `.github/workflows/azure-static-web-apps.yml` and `staticwebapp.config.json`.
