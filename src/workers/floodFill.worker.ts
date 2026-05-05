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

  // visited[] holds the per-pixel "fill amount" 0..255. Pixels close to the
  // seed color get 255; pixels close to the boundary get partial coverage.
  // Treating fill as a coverage mask is what gives anti-aliased edges instead
  // of the jagged white halos a binary fill produces against drawn line art.
  const visited = new Uint8Array(w * h);
  const matches = (i: number) => {
    const dr = src[i] - sr, dg = src[i + 1] - sg, db = src[i + 2] - sb;
    const da = src[i + 3] - sa;
    const dist2 = dr * dr + dg * dg + db * db;
    if (Math.abs(da) > 64) return 0;
    if (dist2 <= tol2) return 255;
    // Soft edge band: distance just above tolerance still fills, but
    // partially. This bridges the anti-aliased pixels along line edges.
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

  // Edge-bleed pass. The scanline above stops at the first non-pure-white
  // pixel, leaving a 1-2 px ring of anti-aliased pixels around line art
  // un-filled — that's the visible white halo against drawn lines.
  //
  // Fix: dilate the filled region by 2 iterations. For each unfilled pixel
  // adjacent to a filled one, if its source color is close to white (so
  // it's an AA edge, not the actual line), copy the neighbor's coverage
  // attenuated by how dark the pixel already is. The coverage attenuation
  // means lines stay crisp — black pixels get coverage ~0 and aren't
  // overwritten, but light-grey AA pixels pick up ~80% of the fill color.
  const ITERATIONS = 2;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Snapshot the current visited buffer; we only consider neighbors that
    // were filled BEFORE this iteration so the dilation grows by exactly
    // one pixel per pass instead of running away.
    const prev = new Uint8Array(visited);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const vIdx = py * w + px;
        if (prev[vIdx]) continue; // already filled
        // Source must be light-ish to be considered an edge pixel. If it's
        // dark we treat it as part of the line and leave it alone.
        const i = idx(px, py);
        const r = src[i], g = src[i + 1], b = src[i + 2];
        const light = (r + g + b) / 3;
        if (light < 96) continue; // line pixel — never overwrite
        // Find a filled neighbor.
        let nbCov = 0;
        if (px > 0 && prev[vIdx - 1] > nbCov) nbCov = prev[vIdx - 1];
        if (px < w - 1 && prev[vIdx + 1] > nbCov) nbCov = prev[vIdx + 1];
        if (py > 0 && prev[vIdx - w] > nbCov) nbCov = prev[vIdx - w];
        if (py < h - 1 && prev[vIdx + w] > nbCov) nbCov = prev[vIdx + w];
        if (!nbCov) continue;
        // Coverage is the neighbor's coverage attenuated by lightness:
        // closer-to-white pixels get more fill (they were "almost in"),
        // closer-to-grey pixels get less. Maps light=96 → 0%, light=255 → 100%.
        const lightFactor = (light - 96) / (255 - 96);
        visited[vIdx] = Math.round(nbCov * lightFactor);
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
