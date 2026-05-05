export class Viewport {
  scale = 1;
  tx = 0;
  ty = 0;

  constructor(public docWidth: number, public docHeight: number) {}

  fit(viewW: number, viewH: number, padding = 24) {
    const sx = (viewW - padding * 2) / this.docWidth;
    const sy = (viewH - padding * 2) / this.docHeight;
    this.scale = Math.min(sx, sy);
    this.tx = (viewW - this.docWidth * this.scale) / 2;
    this.ty = (viewH - this.docHeight * this.scale) / 2;
  }

  screenToDoc(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale };
  }

  zoomAt(sx: number, sy: number, factor: number, min = 0.1, max = 16) {
    const next = Math.max(min, Math.min(max, this.scale * factor));
    const k = next / this.scale;
    this.tx = sx - (sx - this.tx) * k;
    this.ty = sy - (sy - this.ty) * k;
    this.scale = next;
  }

  pan(dx: number, dy: number) {
    this.tx += dx;
    this.ty += dy;
  }

  apply(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.scale, 0, 0, this.scale, this.tx, this.ty);
  }
}
