// Composite a fill's coverage mask onto straight-alpha RGBA pixels with the
// Porter-Duff "over" operator. The old inline version mixed colour channels
// as if they were premultiplied, so partly covered pixels on a transparent
// layer came out darkened (visible dark fringes along strokes).
export function compositeCoverage(
  dst: Uint8ClampedArray,
  coverage: Uint8Array,
  color: { r: number; g: number; b: number; a: number },
): void {
  for (let i = 0, p = 0; i < coverage.length; i++, p += 4) {
    const cov = coverage[i];
    if (cov === 0) continue;
    const sa = (cov / 255) * (color.a / 255);
    const da = dst[p + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) continue;
    const k = (da * (1 - sa)) / outA;
    const s = sa / outA;
    dst[p] = Math.round(color.r * s + dst[p] * k);
    dst[p + 1] = Math.round(color.g * s + dst[p + 1] * k);
    dst[p + 2] = Math.round(color.b * s + dst[p + 2] * k);
    dst[p + 3] = Math.round(outA * 255);
  }
}
