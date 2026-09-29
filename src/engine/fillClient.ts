import type { Document } from './Document';
import { patchFromSnapshots, type PatchCommand } from './commands';
import { SerialQueue } from './SerialQueue';

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (img: ImageData) => void; reject: (e: unknown) => void }>();
const queue = new SerialQueue();

// Fills in flight or waiting. The App ignores new strokes while > 0 so a
// stroke can't be overwritten by a fill result computed before it.
export const fillsPending = () => queue.pending;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/floodFill.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<{ id: string; result: ImageData }>) => {
      const p = pending.get(e.data.id);
      if (p) {
        pending.delete(e.data.id);
        p.resolve(e.data.result);
      }
    };
    // A crashed worker would otherwise leave the fill promise pending
    // forever and the fill tool dead. Fail the waiting fills and start a
    // fresh worker on the next tap.
    const fail = (err: unknown) => {
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    worker.onerror = (e) => fail(e);
    worker.onmessageerror = (e) => fail(e);
  }
  return worker;
}

let nextId = 0;
const fillId = () => `fill_${nextId++}`;

function hexToRgba(hex: string, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

// Composite ALL visible layers — including the target layer — into the
// boundary-detection source. This lets the worker treat user-drawn strokes
// as fill boundaries, not just SVG line art. The fill still writes onto the
// target layer; the source is only used to decide where the fill spreads.
//
// Note: the target's existing pixels in the filled region get overwritten,
// which is what the user expects (tap inside a brushed circle and the inside
// gets the new color, even if a previous fill already partially colored it).
function buildSourceImage(doc: Document): ImageData {
  const w = doc.meta.width;
  const h = doc.meta.height;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d');
  if (!ctx) throw new Error('Could not get tmp 2D context');

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(layer.canvas as CanvasImageSource, 0, 0);
  }
  return ctx.getImageData(0, 0, w, h);
}

async function runFillNow(
  doc: Document,
  layerId: string,
  x: number,
  y: number,
  color: string,
  tolerance = 28,
): Promise<PatchCommand | null> {
  const layer = doc.getLayer(layerId);
  if (!layer) throw new Error(`Layer ${layerId} not found`);

  const before = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  const source = buildSourceImage(doc);
  const targetCopy = new ImageData(
    new Uint8ClampedArray(before.data),
    before.width,
    before.height,
  );

  const id = fillId();
  const w = getWorker();
  const result = await new Promise<ImageData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(
      {
        id,
        source,
        target: targetCopy,
        x: Math.round(x),
        y: Math.round(y),
        color: hexToRgba(color),
        tolerance,
      },
      [source.data.buffer, targetCopy.data.buffer],
    );
  });

  const cmd = patchFromSnapshots(layerId, before, result);
  // Paint the fill result onto the layer.
  layer.ctx.putImageData(result, 0, 0);
  return cmd;
}

export function runFill(
  doc: Document,
  layerId: string,
  x: number,
  y: number,
  color: string,
  tolerance = 28,
): Promise<PatchCommand | null> {
  // `before` is read inside the queued task, after earlier fills landed.
  return queue.run(() => runFillNow(doc, layerId, x, y, color, tolerance));
}
