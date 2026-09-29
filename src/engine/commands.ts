import type { Document } from './Document';
import { cropPixels, diffBox, type Box } from './dirtyRect';

export interface Command {
  apply(doc: Document): void;
  invert(doc: Document): void;
  redo?(doc: Document): void;
  // Approximate memory held by this entry; History uses it for its cap.
  bytes?: number;
}

// Undo entry for any pixel change on one layer (stroke, fill, clear): the
// before/after pixels of just the changed rectangle.
export class PatchCommand implements Command {
  readonly bytes: number;

  constructor(
    public layerId: string,
    public box: Box,
    private before: ImageData,
    private after: ImageData,
  ) {
    this.bytes = before.data.length + after.data.length;
  }

  apply(doc: Document) {
    doc.getLayer(this.layerId)?.ctx.putImageData(this.after, this.box.x, this.box.y);
  }

  invert(doc: Document) {
    doc.getLayer(this.layerId)?.ctx.putImageData(this.before, this.box.x, this.box.y);
  }
}

// Build a PatchCommand from two full-layer snapshots. Returns null when the
// action changed nothing (a tap outside the picture, a fill on the same
// colour), so no empty undo steps pile up.
export function patchFromSnapshots(layerId: string, before: ImageData, after: ImageData): PatchCommand | null {
  const box = diffBox(before.data, after.data, before.width, before.height);
  if (!box) return null;
  const crop = (img: ImageData) =>
    new ImageData(cropPixels(img.data, img.width, box), box.w, box.h);
  return new PatchCommand(layerId, box, crop(before), crop(after));
}

export class History {
  private stack: Command[] = [];
  private redoStack: Command[] = [];
  onChange: (() => void) | null = null;

  constructor(private capacity = 50, private maxBytes = 60 * 1024 * 1024) {}

  push(cmd: Command) {
    this.stack.push(cmd);
    this.redoStack = [];
    while (this.stack.length > this.capacity) this.stack.shift();
    // Drop oldest entries until under the memory cap, but never the newest:
    // the child must always be able to undo the last thing they did.
    while (this.stack.length > 1 && this.totalBytes() > this.maxBytes) this.stack.shift();
    this.onChange?.();
  }

  undo(doc: Document) {
    const cmd = this.stack.pop();
    if (!cmd) return false;
    cmd.invert(doc);
    this.redoStack.push(cmd);
    this.onChange?.();
    return true;
  }

  redo(doc: Document) {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    if (cmd.redo) cmd.redo(doc);
    else cmd.apply(doc);
    this.stack.push(cmd);
    this.onChange?.();
    return true;
  }

  clear() {
    this.stack = [];
    this.redoStack = [];
    this.onChange?.();
  }

  canUndo() { return this.stack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  private totalBytes() {
    let n = 0;
    for (const c of this.stack) n += c.bytes ?? 0;
    for (const c of this.redoStack) n += c.bytes ?? 0;
    return n;
  }
}
