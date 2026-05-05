import type { Document } from './Document';
import { FillCommand } from './commands';

let worker: Worker | null = null;
const pending = new Map<string, (img: ImageData) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/floodFill.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<{ id: string; result: ImageData }>) => {
      const cb = pending.get(e.data.id);
      if (cb) {
        pending.delete(e.data.id);
        cb(e.data.result);
      }
    };
  }
  return worker;
}

let nextId = 0;
const fillId = () => `fill_${nextId++}`;

function hexToRgba(hex: string, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

// Composite all visible layers other than the target. The worker uses this as
// its boundary-detection source — it sees what the user sees behind the layer
// being painted, including the line art.
function buildSourceImage(doc: Document, targetLayerId: string): ImageData {
  const w = doc.meta.width;
  const h = doc.meta.height;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d');
  if (!ctx) throw new Error('Could not get tmp 2D context');

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (layer.id === targetLayerId) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(layer.canvas as CanvasImageSource, 0, 0);
  }
  return ctx.getImageData(0, 0, w, h);
}

export async function runFill(
  doc: Document,
  layerId: string,
  x: number,
  y: number,
  color: string,
  tolerance = 28,
): Promise<FillCommand> {
  const layer = doc.getLayer(layerId);
  if (!layer) throw new Error(`Layer ${layerId} not found`);

  const before = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  const source = buildSourceImage(doc, layerId);
  const targetCopy = new ImageData(
    new Uint8ClampedArray(before.data),
    before.width,
    before.height,
  );

  const id = fillId();
  const w = getWorker();
  const result = await new Promise<ImageData>((resolve) => {
    pending.set(id, resolve);
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

  const cmd = new FillCommand(layerId, x, y, color, tolerance, result);
  cmd.before = before;
  // Apply paints `after` to the layer.
  cmd.apply(doc);
  return cmd;
}
