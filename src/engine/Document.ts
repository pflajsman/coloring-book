import type { DocumentMeta, LayerSnapshot } from '../types/document';
import { Layer } from './Layer';

let _id = 0;
export const newId = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${(_id++).toString(36)}`;

export class Document {
  meta: DocumentMeta;
  layers: Layer[] = [];
  activeLayerId: string;

  // The "template" layer holds the line art being colored. It always sits on
  // top so user paint shows underneath the lines. We keep it as a regular Layer
  // so it round-trips through save/load without special-casing.
  templateLayerId: string;

  constructor(meta: DocumentMeta) {
    this.meta = meta;

    const bg = new Layer(newId('layer'), 'Background', meta.width, meta.height);
    bg.ctx.fillStyle = '#ffffff';
    bg.ctx.fillRect(0, 0, meta.width, meta.height);
    bg.locked = true;

    const paint = new Layer(newId('layer'), 'Paint', meta.width, meta.height);
    const template = new Layer(newId('layer'), 'Line art', meta.width, meta.height);
    template.locked = true;

    this.layers = [bg, paint, template];
    this.activeLayerId = paint.id;
    this.templateLayerId = template.id;
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  getActiveLayer(): Layer {
    const l = this.getLayer(this.activeLayerId);
    if (!l) throw new Error('No active layer');
    return l;
  }

  addLayer(name = 'Layer'): Layer {
    const layer = new Layer(newId('layer'), name, this.meta.width, this.meta.height);
    // Insert below the template layer so line art stays on top.
    const tplIdx = this.layers.findIndex((l) => l.id === this.templateLayerId);
    const idx = tplIdx === -1 ? this.layers.length : tplIdx;
    this.layers.splice(idx, 0, layer);
    this.activeLayerId = layer.id;
    return layer;
  }

  removeLayer(id: string) {
    if (id === this.templateLayerId) return;
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    this.layers.splice(idx, 1);
    if (this.activeLayerId === id) {
      const fallback = this.layers.find((l) => !l.locked);
      this.activeLayerId = fallback ? fallback.id : this.layers[0].id;
    }
  }

  layerSnapshots(): LayerSnapshot[] {
    return this.layers.map((l) => l.snapshot());
  }

  composite(target: CanvasRenderingContext2D) {
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, target.canvas.width, target.canvas.height);
    for (const l of this.layers) {
      if (!l.visible) continue;
      target.globalAlpha = l.opacity;
      target.drawImage(l.canvas as CanvasImageSource, 0, 0);
    }
    target.globalAlpha = 1;
    target.restore();
  }
}
