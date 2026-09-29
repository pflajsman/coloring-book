# Kid lock, new icons, Rainbow brush and new templates

Date: 2026-09-29
Status: approved in conversation, pending written-spec review

## Goal

Make the coloring book survive unsupervised use by a ~3-year-old on an iPad and an Android tablet: no accidental zoom, no lost drawings when the child swipes out of the app, no toddler-reachable settings. Then make it more fun: clearer tool icons, a Rainbow brush, and about 45 new pages.

## What the user asked for vs. what the web platform allows

- The user reports the app "minimizes" or "shows all windows" while the child draws. On iPad these are the 4/5-finger multitasking gestures and the Home swipe; on Android the edge-swipe gesture navigation. The OS consumes these before the browser sees them, so **no web page can block them**, fullscreen or not. The app mitigates (sticky fullscreen, autosave, parent guide) and points the parent to OS features that do block them: iPad Guided Access (the only full block) or turning off multitasking gestures; Android App pinning.
- "Block changing size of canvas space" means the two-finger pinch/pan that zooms the canvas (`PointerInput.ts` gesture path → `Viewport.zoomAt`) and, on iPad, whole-page pinch zoom (iOS ignores `user-scalable=no`). Both are fully in our control.

## Delivery: three parts, each planned, tested and committed separately

- **Part A:** Kid lock and bug fixes (first; fixes what the child hits today)
- **Part B:** Option A icons and Rainbow brush
- **Part C:** New templates

Out of scope for this round: server-side AI content moderation and rate limiting, palm detection by contact size.

---

## Part A: Kid lock and bug fixes

### A1. Canvas lock and multi-touch handling
- New app state `zoomLocked: boolean`, default `true`, persisted in `localStorage` (try/catch, default to locked on any failure).
- When locked: `PointerInput` never enters gesture mode. The first pointer that lands while no stroke is running owns the stroke; other pointers (resting palm, extra fingers) are ignored and never interrupt it. A resting palm does not block the next stroke. The viewport stays at fit-to-window.
- When unlocked: current pinch/pan behavior, plus zoom is clamped to a minimum of fit scale (never smaller than the page), and switching the lock back on resets the view to fit.
- Fix the existing gesture-cancel bug (review item 1): when an in-flight stroke is interrupted (only possible when unlocked), end it properly: stop the spray/glitter loop and commit the partial stroke as an undo step.
- Tracking: pointer bookkeeping must tolerate 3+ simultaneous pointers without leaving stale "active" entries.

### A2. Whole-page zoom block (iPad)
- `touch-action: manipulation` on all UI outside the canvas; `touch-action: none` stays on the canvas.
- `preventDefault` on `gesturestart` / `gesturechange` (Safari-only events) at the document level.
- Apply CSS safe-area insets (`env(safe-area-inset-*)`) to the top bar, palette and dock.

### A3. Parent gate
- A reusable `holdToActivate(button, ms, onActivate)` helper: press and hold for 2000 ms; a ring fills around the button while held; releasing early cancels; a quick tap shows a small hint bubble ("Grown-ups: hold to open").
- Gated: Settings (gear), Make a picture (AI), Fullscreen exit. Projects and Delete live inside Settings, so they are covered too.
- Settings gains: an "Allow zoom" switch (A1) and a "Lock this tablet" section (A5).

### A4. Sticky fullscreen and screen wake
- On `fullscreenchange` / `webkitfullscreenchange` to not-fullscreen, set a flag; the next `pointerdown` anywhere re-requests fullscreen (user activation is required, so it cannot happen without a tap). Only if the user entered fullscreen at least once in this session, and not after a gated exit.
- Listen to prefixed and unprefixed events and properties (review item: icon out of sync).
- Hide the fullscreen button when running as an installed app (`display-mode: fullscreen` or `standalone`, or `navigator.standalone`).
- Request a screen wake lock while visible; re-request on `visibilitychange` to visible; tolerate rejection and missing API.

### A5. "Lock this tablet" parent guide
- Static content in the Settings dialog, two short blocks: iPad (Guided Access, or turn off multitasking gestures) and Android (App pinning). Describe where to look, not exact menu paths, because they differ by OS version. Wording to be checked against Apple and Google help pages during implementation; where not verifiable, keep it general.

### A6. Autosave and restore
- A dedicated IndexedDB record `autosave` (separate from named projects) holding the current document in the existing project record format plus `meta` (id, name).
- Written: 3 s after the last committed stroke/fill (debounced), and immediately on `visibilitychange` → hidden and `pagehide`.
- Restored on boot, before the blank template would load; the boot blank-template load must not clear anything drawn in the meantime (review: boot race).
- Call `navigator.storage.persist()` once, ignoring the result.

### A7. Safe picture switching
- Loading a template or an AI image: first autosave the current drawing, then load the new picture with a **fresh document id and name "Untitled"**, so a later Save never overwrites the previous project (review: overwrite bug).
- The switch is one undo step: undo restores the previous drawing's layers. (Implemented as a command that holds before/after snapshots of the paint and line-art layers.) Undo restores pixels only; the document keeps its new id and name, so undoing can never cause an overwrite either.

### A8. AI dialog cancellation
- Closing the AI dialog (× button, backdrop, cancel) aborts the fetch via `AbortController` and stops speech recognition. A late result is ignored.

### A9. Modal promise resolution
- `Modal` × button and backdrop resolve `promptDialog` with `null` and `confirmDialog` with `false`, so callers always continue (fixes the stuck AI toast).

### A10. Fill correctness
- Serialize fills: a queue in `fillClient`, each fill starts from the current layer pixels after the previous fill has been applied. Strokes started while a fill is pending are ignored (fills finish in well under a second), so a fill result can never overwrite a newer stroke.
- Worker `onerror` / `messageerror` rejects the pending promise and recreates the worker.
- Fix the straight-alpha compositing in `floodFill.worker.ts` so partially covered pixels keep their colour (no dark fringes).

### A11. Update and offline behavior
- `vite-plugin-pwa` `registerType: 'prompt'`; a waiting service worker is applied only on the next app launch (never mid-drawing).
- Add `json` to `globPatterns`; exclude `templates/_uni_preview/**` from precache.

### A12. Undo memory
- History entries store only the changed bounding box (before and after `ImageData` cropped to the bbox, padded by the brush radius), not full-canvas copies.
- Total history capped by bytes (about 60 MB) in addition to the 50-step limit; the oldest entries are dropped first.
- Add a Redo button next to Undo in the top bar.

### A13. Smaller items
- Hide the "Stylus only" toggle behind the gated Settings (automatic via A3).
- AI prompt input no longer autofocuses (keyboard stays down until tapped).

---

## Part B: Icons and Rainbow brush

### B1. Option A icons
- Replace the 11 dock icons in `KidUI.ts` with the Option A set from the approved preview (https://claude.ai/artifact/FPi1XwYB376CdutaRQGMrE), plus the Rainbow brush icon.
- Icons are functions of the current paint color; the dock re-renders the icons on every color change. Glitter and Rainbow ignore the color. Very light paint (white, pale yellow) shows its marks in light grey so they stay visible on the white dock buttons.
- Top-bar icons unchanged.
- SVG gradient ids must be unique per icon instance.

### B2. Rainbow brush
- New tool `rainbow`, placed after Brush in the dock, keyboard shortcut `W`, tooltip "Rainbow".
- Renders exactly like Brush, but the stamp color is the `#rrggbb` equivalent of `hsl(hue, 90%, 55%)` (brush heads append hex alpha, so hex is required) where hue advances with distance travelled: one full cycle every 600 px of stroke length in document space, starting at a random hue per stroke.
- Hue is quantized to 36 steps (10° each) so the existing per-color brush stamp cache is reused.
- Pure function `rainbowColorAt(distance, startHue): string` is unit tested.
- Undo works like a normal brush stroke.

---

## Part C: New templates

All hand-authored SVGs in `public/templates/`, registered in `manifest.json`, CC0-compatible (original work). Style: bold black outlines (stroke 6 to 8 at a 1200×800 viewBox), closed regions so fill works, no shading, few small details.

- **Animals (10):** lion, giraffe, zebra, penguin, hedgehog, fox, whale, octopus, chick, ladybug.
- **Fairy tales (10), new category "Fairy tales":** Red Riding Hood, the Wolf, Three Little Pigs' house, castle, knight, mermaid, gnome, frog prince, gingerbread house, pumpkin carriage.
- **Vehicles (8):** race car, fire truck, police car, bus, tractor, excavator, ambulance, monster truck.
- **Games (16), new category "Games":**
  - 4 mazes (wide corridors, grid 4×4 to 6×6), each with a start character and a goal item; generated by `scripts/make-mazes.mjs` with a fixed seed so output is reproducible and committed.
  - 4 connect-the-dots (two 1 to 10, two 1 to 20), numbers large and readable.
  - 2 tic-tac-toe boards and 2 dot grids (dots-and-boxes).
  - 4 tracing sheets: zigzags, waves, loops, shapes (dashed lines).
- Existing Fantasy items that fit fairy tales stay where they are.

Expected limitation: hand-authored characters will look simpler and more cartoonish than the openclipart ones.

---

## Testing

- Add Vitest (dev dependency) and `npm test`. Unit tests for pure logic: pointer ownership rules when zoom is locked, `rainbowColorAt`, maze generator (every maze solvable, deterministic for a seed), history byte cap, autosave debounce scheduling, fill queue ordering.
- `npm run build` (typecheck + build) must pass after each part.
- Manual check in desktop Chrome at tablet viewport after each part.
- A device checklist for the user (iPad + Android) per part, covering: pinch on canvas and on UI, 3+ finger touches, swipe away and back (drawing restored), gated buttons, fullscreen re-entry, offline Pictures, new icons tint, Rainbow stroke, each new template fills correctly.
