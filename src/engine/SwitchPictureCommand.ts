import type { Command } from './commands';
import type { Document } from './Document';
import { newId } from './Document';
import type { DocumentMeta } from '../types/document';

// Picking a new picture replaces both the line art and the paint. This
// command makes that one undo step, so a child who taps a thumbnail by
// accident can get their drawing back with Undo.
//
// It restores pixels and the template id only; the document keeps the new
// id and name, so an undo can never cause a Save to overwrite the old
// project either.
export class SwitchPictureCommand implements Command {
  readonly bytes: number;

  constructor(
    private before: Map<string, ImageData>,
    private after: Map<string, ImageData>,
    private beforeTemplateId?: string,
    private afterTemplateId?: string,
  ) {
    let n = 0;
    for (const m of [before, after]) for (const img of m.values()) n += img.data?.length ?? 0;
    this.bytes = n;
  }

  apply(doc: Document) {
    this.put(doc, this.after);
    doc.meta.templateId = this.afterTemplateId;
  }

  invert(doc: Document) {
    this.put(doc, this.before);
    doc.meta.templateId = this.beforeTemplateId;
  }

  private put(doc: Document, pixels: Map<string, ImageData>) {
    for (const [id, img] of pixels) doc.getLayer(id)?.ctx.putImageData(img, 0, 0);
  }
}

export function captureLayers(doc: Document, ids: string[]): Map<string, ImageData> {
  const out = new Map<string, ImageData>();
  for (const id of ids) {
    const l = doc.getLayer(id);
    if (l) out.set(id, l.ctx.getImageData(0, 0, l.canvas.width, l.canvas.height));
  }
  return out;
}

export function freshMeta(meta: DocumentMeta, now: number): DocumentMeta {
  return { ...meta, id: newId('doc'), name: 'Untitled', createdAt: now, updatedAt: now };
}
