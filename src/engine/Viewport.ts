export class Viewport {
  scale = 1;
  tx = 0;
  ty = 0;

  constructor(public docWidth: number, public docHeight: number) {}

  // Per-edge insets let the canvas be full-bleed (so it captures pointer
  // input across the whole screen) while the picture itself is sized and
  // centered within the area NOT covered by floating UI panels.
  fit(
    viewW: number,
    viewH: number,
    insets: { top?: number; right?: number; bottom?: number; left?: number; padding?: number } = {},
  ) {
    const padding = insets.padding ?? 16;
    const top = (insets.top ?? 0) + padding;
    const right = (insets.right ?? 0) + padding;
    const bottom = (insets.bottom ?? 0) + padding;
    const left = (insets.left ?? 0) + padding;
    const innerW = Math.max(1, viewW - left - right);
    const innerH = Math.max(1, viewH - top - bottom);
    this.scale = Math.min(innerW / this.docWidth, innerH / this.docHeight);
    this.tx = left + (innerW - this.docWidth * this.scale) / 2;
    this.ty = top + (innerH - this.docHeight * this.scale) / 2;
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
