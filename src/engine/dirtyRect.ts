// Find and cut out the rectangle of pixels a stroke or fill actually
// changed. Undo entries keep only that rectangle instead of two full-canvas
// copies (7.7 MB per step at 1200x800), which is what used to push iPad
// Safari over its memory limit after a few dozen strokes.
//
// Diffing the before/after buffers instead of tracking each tool's reach
// keeps this correct for every tool (spray clouds, stamps, blur) at the
// cost of one linear scan (~1M pixels, a few ms) per stroke.

export type Box = { x: number; y: number; w: number; h: number };

export function diffBox(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Box | null {
  const a32 = new Uint32Array(a.buffer, a.byteOffset, width * height);
  const b32 = new Uint32Array(b.buffer, b.byteOffset, width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (a32[row + x] !== b32[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function cropPixels(src: Uint8ClampedArray, width: number, box: Box): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let row = 0; row < box.h; row++) {
    const start = ((box.y + row) * width + box.x) * 4;
    out.set(src.subarray(start, start + box.w * 4), row * box.w * 4);
  }
  return out;
}
