// Off-main-thread flood fill. The main thread sends:
//   - source: ImageData of the composited image (layers BELOW target + line art)
//             used purely for boundary detection.
//   - target: ImageData of the layer we're going to paint into.
//   - x, y, color, tolerance
// The worker returns a new ImageData representing the target layer AFTER fill.
// We never mutate the user's other layers — we just look at `source` to decide
// where the fill is allowed to spread.

type FillRequest = {
  id: string;
  source: ImageData;
  target: ImageData;
  x: number;
  y: number;
  color: { r: number; g: number; b: number; a: number };
  tolerance: number;
};

type FillResponse = {
  id: string;
  result: ImageData;
};

self.onmessage = (e: MessageEvent<FillRequest>) => {
  const { id, source, target, x, y, color, tolerance } = e.data;
  const result = floodFill(source, target, x, y, color, tolerance);
  const resp: FillResponse = { id, result };
  // Transfer the result buffer back instead of structured-cloning it.
  (self as unknown as Worker).postMessage(resp, [result.data.buffer]);
};

function floodFill(
  source: ImageData,
  target: ImageData,
  sx: number,
  sy: number,
  color: { r: number; g: number; b: number; a: number },
  tolerance: number,
): ImageData {
  const w = source.width;
  const h = source.height;
  const src = source.data;
  const dst = new Uint8ClampedArray(target.data);

  if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
    return new ImageData(dst, w, h);
  }

  const idx = (px: number, py: number) => (py * w + px) * 4;
  const start = idx(sx, sy);
  const sr = src[start], sg = src[start + 1], sb = src[start + 2], sa = src[start + 3];
  const tol2 = tolerance * tolerance * 3;

  // Saturation of the seed pixel. We use this to decide whether the seed is
  // a "neutral" pixel (white, grey, or near it) vs. an already-colored region.
  // For a seed (255,255,255), saturation is 0; for (255,213,74) it's 181.
  const seedSat = Math.max(sr, sg, sb) - Math.min(sr, sg, sb);
  const seedLight = (sr + sg + sb) / 3;
  // "Light seed" = white-ish background tap. We use a stricter test than
  // pure-white so antialiased near-white templates still trigger this path.
  const isLightSeed = seedLight > 220 && seedSat < 20 && sa > 220;

  // visited[] holds the per-pixel "fill amount" 0..255. Pixels close to the
  // seed color get 255; pixels close to the boundary get partial coverage.
  const visited = new Uint8Array(w * h);
  const matches = (i: number) => {
    const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];
    if (isLightSeed) {
      // Tap was on a near-white background. A pixel counts as "still inside
      // the shape" iff it's BOTH light AND unsaturated. Either condition
      // failing means we hit a barrier:
      //   - dark pixel        → black ink line stops fill
      //   - saturated pixel   → user-drawn colored stroke stops fill
      //
      // Saturation thresholds are tight: even slight color tint counts as
      // an AA stroke edge. Without this, fills leak through the
      // anti-aliased halo around pen/ruler/brush strokes — the canvas
      // can't disable AA on vector strokes.
      if (a < 32) return 255; // transparent counts as background
      const light = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Hard barrier: clearly dark OR clearly saturated.
      if (light <= 96 || sat >= 30) return 0;
      // Hard match: clearly light AND clearly unsaturated.
      if (light >= 230 && sat <= 8) return 255;
      // Soft band in between: combine the two factors. 1.0 = full match,
      // 0.0 = barrier. This gives smooth AA fill edges while keeping
      // chunky boundaries solid.
      const lightFactor = Math.max(0, Math.min(1, (light - 96) / (230 - 96)));
      const satFactor = Math.max(0, Math.min(1, (30 - sat) / (30 - 8)));
      return Math.round(lightFactor * satFactor * 255);
    }
    // Color-similarity match for non-light seeds (re-fill an already
    // colored region with a different color).
    const dr = r - sr, dg = g - sg, db = b - sb;
    const da = a - sa;
    const dist2 = dr * dr + dg * dg + db * db;
    if (Math.abs(da) > 64) return 0;
    if (dist2 <= tol2) return 255;
    const soft = tol2 * 4;
    if (dist2 <= soft) {
      const t = 1 - (dist2 - tol2) / (soft - tol2);
      return Math.max(0, Math.min(255, Math.round(t * 255)));
    }
    return 0;
  };

  // Scanline fill — iterative, no recursion. We push columns left/right of
  // each filled span, then walk up/down within a column until we hit a
  // boundary. Standard textbook algorithm, just adapted to record a coverage
  // mask instead of a binary visited flag.
  const stack: Array<[number, number]> = [[sx, sy]];

  while (stack.length) {
    const popped = stack.pop()!;
    const px = popped[0];
    let py = popped[1];

    while (py >= 0 && matches(idx(px, py)) === 255 && !visited[py * w + px]) py--;
    py++;

    let spanLeft = false;
    let spanRight = false;

    while (py < h) {
      const i = idx(px, py);
      const cov = matches(i);
      const vIdx = py * w + px;
      if (cov === 0 || visited[vIdx]) break;
      visited[vIdx] = cov;

      if (px > 0) {
        const lCov = matches(idx(px - 1, py));
        if (!spanLeft && lCov === 255 && !visited[vIdx - 1]) {
          stack.push([px - 1, py]);
          spanLeft = true;
        } else if (spanLeft && lCov < 255) {
          spanLeft = false;
        }
      }
      if (px < w - 1) {
        const rCov = matches(idx(px + 1, py));
        if (!spanRight && rCov === 255 && !visited[vIdx + 1]) {
          stack.push([px + 1, py]);
          spanRight = true;
        } else if (spanRight && rCov < 255) {
          spanRight = false;
        }
      }
      py++;
    }
  }

  // Edge-bleed pass. The scanline above can leave two kinds of unsightly
  // ring around a barrier:
  //
  // 1. Strict-rejected pixels (returned 0): AA edges that were too tinted
  //    or too dark to count as inside the shape. They keep the original
  //    background colour and read as a halo.
  //
  // 2. Soft-banded pixels (returned partial coverage): AA edges that the
  //    matcher partially filled. Against a colored barrier the partial
  //    fill produces a pastel ring — not a halo of original background,
  //    but a noticeably paler version of the fill colour. Against a black
  //    line the partial-coverage pixels blend nicely so we leave them.
  //
  // Two passes:
  //   (a) Dilate into strict-0 neighbours of strict-255 cells.
  //   (b) Promote sub-255 pixels that touch a strict-255 cell up to 255 IF
  //       the source pixel is clearly an AA edge of a coloured stroke
  //       (light + low-to-medium saturation). We don't promote against
  //       black line art (light < 96) so anti-aliased SVG lines stay smooth.
  const ITERATIONS = 1;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const prev = new Uint8Array(visited);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const vIdx = py * w + px;
        const cov = prev[vIdx];
        if (cov === 255) continue; // already fully filled

        const i = idx(px, py);
        const r = src[i], g = src[i + 1], b = src[i + 2];

        // Classify the source pixel:
        //  - "halo": clearly light, faintly tinted → AA edge of a colored
        //            user stroke. Promote to full neighbor coverage so the
        //            halo disappears.
        //  - "midgrey": darker, low sat → AA edge of black line art. Let
        //               the existing soft-band coverage stand (it blends
        //               smoothly with the line).
        //  - "neither": leave alone.
        let halo = false;
        let bleedFactor = 0;
        if (isLightSeed) {
          const light = (r + g + b) / 3;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          // Halo: light pixel with low-to-mid saturation.
          if (light >= 200 && sat <= 50) {
            halo = true;
            bleedFactor = 1;
          } else if (light >= 150 && sat <= 50) {
            // Mid-light, lightly tinted: bleed proportionally.
            const lightFactor = Math.max(0, Math.min(1, (light - 150) / (200 - 150)));
            const satFactor = Math.max(0, Math.min(1, (50 - sat) / (50 - 8)));
            bleedFactor = lightFactor * satFactor;
          }
        } else {
          const dr = r - sr, dg = g - sg, db = b - sb;
          const dist2 = dr * dr + dg * dg + db * db;
          const limit = tol2 * 9;
          if (dist2 < limit) bleedFactor = 1 - dist2 / limit;
          if (dist2 < tol2 * 2) halo = true;
        }
        if (bleedFactor <= 0) continue;

        // Find the strongest filled neighbour.
        let nbCov = 0;
        if (px > 0 && prev[vIdx - 1] > nbCov) nbCov = prev[vIdx - 1];
        if (px < w - 1 && prev[vIdx + 1] > nbCov) nbCov = prev[vIdx + 1];
        if (py > 0 && prev[vIdx - w] > nbCov) nbCov = prev[vIdx - w];
        if (py < h - 1 && prev[vIdx + w] > nbCov) nbCov = prev[vIdx + w];
        if (!nbCov) continue;

        if (halo) {
          // Halo pixel: inherit full neighbour coverage. Eats white rings
          // around colored user strokes.
          visited[vIdx] = Math.max(cov, nbCov);
        } else if (cov === 0) {
          // Unvisited mid-grey AA pixel: bleed at scaled coverage.
          visited[vIdx] = Math.round(nbCov * bleedFactor);
        }
        // Else: already-soft-filled mid-grey pixel — leave the matcher's
        // partial coverage alone so black-line AA stays smooth.
      }
    }
  }

  // Composite the coverage mask into the target buffer using "over" with the
  // existing pixel, so re-filling an already-painted area looks natural.
  for (let i = 0, p = 0; i < visited.length; i++, p += 4) {
    const cov = visited[i];
    if (cov === 0) continue;
    const a = (cov / 255) * (color.a / 255);
    const inv = 1 - a;
    dst[p] = Math.round(color.r * a + dst[p] * inv);
    dst[p + 1] = Math.round(color.g * a + dst[p + 1] * inv);
    dst[p + 2] = Math.round(color.b * a + dst[p + 2] * inv);
    dst[p + 3] = Math.round(255 * a + dst[p + 3] * inv);
  }

  return new ImageData(dst, w, h);
}

export {};
