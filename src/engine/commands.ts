import type { Document } from './Document';
import type { Point, StrokeStyle } from '../types/document';
import { renderStroke } from './StrokeRenderer';

export interface Command {
  apply(doc: Document): void;
  invert(doc: Document): void;
  redo?(doc: Document): void;
}

// Stroke command. The App captures `before` at strokeStart and `after` at
// strokeEnd, then injects them into the command. That avoids re-rendering the
// stroke just to compute deltas. If a command is constructed without injected
// state (e.g., during op-replay on document load), apply() falls back to
// re-rendering and capturing.
export class StrokeCommand implements Command {
  before?: ImageData;
  after?: ImageData;
  bbox?: { x: number; y: number; w: number; h: number };

  constructor(
    public layerId: string,
    public points: Point[],
    public style: StrokeStyle,
  ) {}

  apply(doc: Document) {
    const layer = doc.getLayer(this.layerId);
    if (!layer) return;
    if (this.after && this.bbox) {
      layer.ctx.putImageData(this.after, this.bbox.x, this.bbox.y);
      return;
    }
    // Replay path: snapshot full layer, render stroke, capture deltas.
    const w = layer.canvas.width;
    const h = layer.canvas.height;
    if (!this.before) {
      this.before = layer.ctx.getImageData(0, 0, w, h);
      this.bbox = { x: 0, y: 0, w, h };
    }
    renderStroke(layer.ctx, this.points, this.style);
    this.after = layer.ctx.getImageData(0, 0, w, h);
  }

  invert(doc: Document) {
    const layer = doc.getLayer(this.layerId);
    if (!layer || !this.before || !this.bbox) return;
    layer.ctx.putImageData(this.before, this.bbox.x, this.bbox.y);
  }

  redo(doc: Document) {
    this.apply(doc);
  }
}

// Flood-fill command. Stores the full pre/post ImageData of the target layer
// so undo is a single putImageData. For very large canvases we'd want to
// store a delta region instead, but for typical coloring docs (1-2 megapixel)
// this is fine and keeps the worker contract simple.
export class FillCommand implements Command {
  before?: ImageData;
  after: ImageData;

  constructor(
    public layerId: string,
    public x: number,
    public y: number,
    public color: string,
    public tolerance: number,
    after: ImageData,
  ) {
    this.after = after;
  }

  apply(doc: Document) {
    const layer = doc.getLayer(this.layerId);
    if (!layer) return;
    if (!this.before) {
      this.before = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    }
    layer.ctx.putImageData(this.after, 0, 0);
  }

  invert(doc: Document) {
    const layer = doc.getLayer(this.layerId);
    if (!layer || !this.before) return;
    layer.ctx.putImageData(this.before, 0, 0);
  }

  redo(doc: Document) {
    const layer = doc.getLayer(this.layerId);
    if (!layer) return;
    layer.ctx.putImageData(this.after, 0, 0);
  }
}

export class History {
  private stack: Command[] = [];
  private redoStack: Command[] = [];
  private capacity = 50;

  push(cmd: Command) {
    this.stack.push(cmd);
    if (this.stack.length > this.capacity) this.stack.shift();
    this.redoStack = [];
  }

  undo(doc: Document) {
    const cmd = this.stack.pop();
    if (!cmd) return false;
    cmd.invert(doc);
    this.redoStack.push(cmd);
    return true;
  }

  redo(doc: Document) {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    if (cmd.redo) cmd.redo(doc);
    else cmd.apply(doc);
    this.stack.push(cmd);
    return true;
  }

  clear() {
    this.stack = [];
    this.redoStack = [];
  }

  canUndo() { return this.stack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
}
