import type { LayerSnapshot } from '../types/document';

export class Layer {
  readonly id: string;
  name: string;
  visible = true;
  opacity = 1;
  locked = false;
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor(id: string, name: string, width: number, height: number) {
    this.id = id;
    this.name = name;

    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      this.canvas = c;
    }
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx as CanvasRenderingContext2D;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  snapshot(): LayerSnapshot {
    return {
      id: this.id,
      name: this.name,
      visible: this.visible,
      opacity: this.opacity,
      locked: this.locked,
    };
  }

  async toBlob(): Promise<Blob> {
    if (this.canvas instanceof OffscreenCanvas) {
      return await this.canvas.convertToBlob({ type: 'image/png' });
    }
    return new Promise((resolve, reject) => {
      (this.canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/png',
      );
    });
  }

  async loadFromBlob(blob: Blob) {
    const bmp = await createImageBitmap(blob);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(bmp, 0, 0);
    bmp.close();
  }
}
