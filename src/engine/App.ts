import { Document, newId } from './Document';
import { Viewport } from './Viewport';
import { PointerInput } from './PointerInput';
import { History, StrokeCommand } from './commands';
import {
  beginStroke,
  drawBrushSegment,
  drawDot,
  drawLineSegment,
  drawSmoothSegment,
  endStroke,
  glitterSplatter,
  nextStampShape,
  resetStampCycle,
  spraySplatter,
  stampAt,
} from './StrokeRenderer';
import { runFill } from './fillClient';
import type { Point, StrokeStyle } from '../types/document';

export type Tool = 'brush' | 'pen' | 'spray' | 'glitter' | 'stamp' | 'line' | 'circle' | 'rect' | 'blur' | 'eraser' | 'fill' | 'pan';

// Blur a circular region around (cx, cy) on the given canvas context.
// Reads the pixels, runs a 3x3 box blur (one pass), masks the write to a
// soft-edged circle so it looks like a brush stamp instead of a square.
function blurStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const r = Math.max(4, size / 2);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(r * 2 + 2));
  const h = Math.min(ctx.canvas.height - y0, Math.ceil(r * 2 + 2));
  if (w <= 2 || h <= 2) return;

  const img = ctx.getImageData(x0, y0, w, h);
  const src = img.data;
  // Output buffer for blurred pixels — we don't blur in place because
  // each output pixel needs the original neighbors.
  const dst = new Uint8ClampedArray(src);

  // Box blur, separable horizontal+vertical for speed. Skip the 1-pixel
  // border so the kernel always has 9 valid neighbors.
  const stride = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      // 3x3 average over RGBA. Unrolled for clarity & speed.
      const i00 = i - stride - 4;
      const i01 = i - stride;
      const i02 = i - stride + 4;
      const i10 = i - 4;
      const i11 = i;
      const i12 = i + 4;
      const i20 = i + stride - 4;
      const i21 = i + stride;
      const i22 = i + stride + 4;
      dst[i] = (src[i00] + src[i01] + src[i02] + src[i10] + src[i11] + src[i12] + src[i20] + src[i21] + src[i22]) / 9;
      dst[i + 1] = (src[i00 + 1] + src[i01 + 1] + src[i02 + 1] + src[i10 + 1] + src[i11 + 1] + src[i12 + 1] + src[i20 + 1] + src[i21 + 1] + src[i22 + 1]) / 9;
      dst[i + 2] = (src[i00 + 2] + src[i01 + 2] + src[i02 + 2] + src[i10 + 2] + src[i11 + 2] + src[i12 + 2] + src[i20 + 2] + src[i21 + 2] + src[i22 + 2]) / 9;
      dst[i + 3] = (src[i00 + 3] + src[i01 + 3] + src[i02 + 3] + src[i10 + 3] + src[i11 + 3] + src[i12 + 3] + src[i20 + 3] + src[i21 + 3] + src[i22 + 3]) / 9;
    }
  }

  // Mask: blend dst (blurred) → src (original) by a soft-edged disc. Pixels
  // at the brush center get fully replaced; pixels at the edge keep the
  // original; in between they fade. This gives the brush a soft falloff
  // instead of a hard rectangular stamp.
  const r2 = r * r;
  const fadeR2 = r2;
  const innerR2 = (r * 0.7) * (r * 0.7);
  const cxLocal = cx - x0;
  const cyLocal = cy - y0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cxLocal;
      const dy = y - cyLocal;
      const d2 = dx * dx + dy * dy;
      if (d2 >= fadeR2) continue;
      let weight: number;
      if (d2 <= innerR2) weight = 1;
      else weight = 1 - (d2 - innerR2) / (fadeR2 - innerR2);
      const i = (y * w + x) * 4;
      src[i] = src[i] * (1 - weight) + dst[i] * weight;
      src[i + 1] = src[i + 1] * (1 - weight) + dst[i + 1] * weight;
      src[i + 2] = src[i + 2] * (1 - weight) + dst[i + 2] * weight;
      src[i + 3] = src[i + 3] * (1 - weight) + dst[i + 3] * weight;
    }
  }
  ctx.putImageData(img, x0, y0);
}

export type AppState = {
  tool: Tool;
  color: string;
  size: number;
  pressureSensitivity: number;
  penOnly: boolean;
  busy: boolean;
};

type Listener = (s: AppState) => void;

export class App {
  doc: Document;
  viewport: Viewport;
  history = new History();
  state: AppState = {
    tool: 'brush',
    color: '#f1c40f',
    size: 12,
    pressureSensitivity: 1,
    penOnly: false,
    busy: false,
  };

  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private pointer: PointerInput;
  private listeners = new Set<Listener>();
  private rafQueued = false;

  // Live stroke state. We capture a `before` snapshot at strokeStart so the
  // resulting StrokeCommand has accurate undo data without re-rendering.
  private strokePoints: Point[] = [];
  private strokeStyle: StrokeStyle | null = null;
  private strokeBefore: ImageData | null = null;
  private strokeLayerId: string | null = null;
  // Anchor for shape tools (line/circle). Survives across moves because the
  // tool replaces strokePoints with the rendered shape geometry on each
  // frame — strokePoints[0] no longer stays at the user's start point.
  private shapeAnchor: Point | null = null;

  // Spray emits paint over time, not just on pointermove. We keep the last
  // pointer position and tick a RAF loop while the spray stroke is active.
  // Glitter shares the same pattern (different splatter renderer).
  private sprayPoint: Point | null = null;
  private sprayRaf: number | null = null;

  // Stamp tool tracks the last stamp position so consecutive stamps along a
  // drag are spaced by ~one stamp size (no piling up).
  private lastStampPos: Point | null = null;

  constructor(canvas: HTMLCanvasElement, doc: Document) {
    this.displayCanvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get display 2D context');
    this.displayCtx = ctx;
    this.doc = doc;
    this.viewport = new Viewport(doc.meta.width, doc.meta.height);

    this.pointer = new PointerInput(canvas, {
      toDoc: (sx, sy) => this.viewport.screenToDoc(sx, sy),
      isPenOnly: () => this.state.penOnly,
      onStrokeStart: (p) => this.handleStrokeStart(p),
      onStrokeMove: (points) => this.handleStrokeMove(points),
      onStrokeEnd: () => this.handleStrokeEnd(),
      onGesture: (g) => this.handleGesture(g),
    });

    this.fitToWindow();
    window.addEventListener('resize', () => this.fitToWindow());
    // Re-fit whenever the floating UI's height changes (slider wrapping to a
    // new row, panels growing). Without this, the topbar can wrap on mobile
    // but the canvas insets stay stuck at boot-time values.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.fitToWindow());
      requestAnimationFrame(() => {
        const topbar = document.querySelector('.kid-topbar');
        const palette = document.querySelector('.kid-palette');
        const dock = document.querySelector('.kid-dock');
        if (topbar) ro.observe(topbar);
        if (palette) ro.observe(palette);
        if (dock) ro.observe(dock);
      });
    }
    // Eat wheel events so the canvas doesn't pan/zoom and the page can't
    // scroll either — kids using a mouse will spin the wheel and we want the
    // picture to stay put.
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    // Suppress the browser's long-press / right-click menu and stylus
    // "save image / inspect" popup. Without this, holding a stylus on the
    // canvas pops up the OS context menu mid-stroke, which kids find
    // distressing because it interrupts whatever they were drawing.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.handleKey);
    this.scheduleRender();
  }

  destroy() {
    this.pointer.destroy();
    window.removeEventListener('keydown', this.handleKey);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  setState(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  fitToWindow() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.displayCanvas.getBoundingClientRect();
    this.displayCanvas.width = Math.floor(rect.width * dpr);
    this.displayCanvas.height = Math.floor(rect.height * dpr);
    this.displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Measure the actual floating UI rather than hardcoding insets. The
    // topbar height changes when its slider wraps to a second row on narrow
    // viewports; the palette/dock widths shrink on phone breakpoints. Hard
    // values used to lie about both and the canvas got cropped behind UI.
    //
    // Fallbacks keep boot-time + worker-only environments working when the
    // panels haven't been mounted yet.
    const GAP = 8;
    const topbar = document.querySelector('.kid-topbar') as HTMLElement | null;
    const palette = document.querySelector('.kid-palette') as HTMLElement | null;
    const dock = document.querySelector('.kid-dock') as HTMLElement | null;

    const topInset = topbar
      ? Math.ceil(topbar.getBoundingClientRect().bottom + GAP)
      : 92;
    const leftInset = palette
      ? Math.ceil(palette.getBoundingClientRect().right + GAP)
      : 88;
    const rightInset = dock
      ? Math.ceil(rect.width - dock.getBoundingClientRect().left + GAP)
      : 96;

    this.viewport.fit(rect.width, rect.height, {
      top: topInset,
      left: leftInset,
      right: rightInset,
      bottom: 8,
      padding: 0,
    });
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.rafQueued) return;
    this.rafQueued = true;
    requestAnimationFrame(() => {
      this.rafQueued = false;
      this.render();
    });
  }

  private render() {
    const { displayCtx, displayCanvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = displayCanvas.width / dpr;
    const h = displayCanvas.height / dpr;

    // Clear to transparent so the body's colorful background shows through.
    displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    displayCtx.clearRect(0, 0, w, h);

    const v = this.viewport;
    displayCtx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty);

    // Soft shadow behind the doc so it pops off the colorful page.
    displayCtx.fillStyle = 'rgba(0,0,0,0.18)';
    const shadow = 12 / v.scale;
    displayCtx.fillRect(shadow, shadow, this.doc.meta.width, this.doc.meta.height);

    for (const layer of this.doc.layers) {
      if (!layer.visible) continue;
      displayCtx.globalAlpha = layer.opacity;
      displayCtx.drawImage(layer.canvas as CanvasImageSource, 0, 0);
    }
    displayCtx.globalAlpha = 1;
  }

  private currentStyle(): StrokeStyle {
    const tool = this.state.tool;
    const isPen = tool === 'pen';
    const isShape = tool === 'line' || tool === 'circle' || tool === 'rect';
    return {
      color: this.state.color,
      // Thin pen has a fixed crisp line so kids can outline shapes precisely.
      size: isPen ? 3 : this.state.size,
      // Pen and shape tools ignore pressure — geometric shapes need uniform width.
      pressureSensitivity: isPen || isShape ? 0 : this.state.pressureSensitivity,
      eraser: tool === 'eraser',
    };
  }

  private handleStrokeStart(p: Point) {
    if (this.state.tool === 'fill') {
      void this.runFillAt(p);
      return;
    }
    if (this.state.tool === 'pan') return;

    const layer = this.doc.getActiveLayer();
    if (layer.locked) return;

    this.strokeBefore = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    this.strokeLayerId = layer.id;
    this.strokeStyle = this.currentStyle();
    this.strokePoints = [p];

    beginStroke(layer.ctx, this.strokeStyle);

    if (this.state.tool === 'spray') {
      this.sprayPoint = p;
      spraySplatter(layer.ctx, p, this.strokeStyle);
      this.startSprayLoop();
    } else if (this.state.tool === 'glitter') {
      this.sprayPoint = p;
      glitterSplatter(layer.ctx, p, this.strokeStyle);
      this.startSprayLoop();
    } else if (this.state.tool === 'stamp') {
      resetStampCycle();
      stampAt(layer.ctx, p, this.strokeStyle, nextStampShape());
      this.lastStampPos = p;
    } else if (this.state.tool === 'brush') {
      // Stamp at the same point twice so a tap produces a visible blob; the
      // brush head's center is opaque so a single stamp reads as a soft dot.
      drawBrushSegment(layer.ctx, p, p, this.strokeStyle);
    } else if (this.state.tool === 'line' || this.state.tool === 'circle' || this.state.tool === 'rect') {
      // Don't draw anything yet — we preview during the drag and commit on
      // release. Pin the anchor here so subsequent moves use the original
      // tap point, not whatever ended up at strokePoints[0] last frame.
      this.shapeAnchor = p;
    } else if (this.state.tool === 'blur') {
      // Single dab to start so taps without movement still soften the area.
      blurStamp(layer.ctx as CanvasRenderingContext2D, p.x, p.y, this.strokeStyle.size);
    } else {
      drawDot(layer.ctx, p, this.strokeStyle);
    }
    this.scheduleRender();
  }

  private handleStrokeMove(points: Point[]) {
    if (!this.strokeStyle || !this.strokeLayerId) return;
    const layer = this.doc.getLayer(this.strokeLayerId);
    if (!layer || layer.locked) return;

    if (this.state.tool === 'spray') {
      // Update the emit position; the RAF loop does the actual drawing so
      // density is time-based, not movement-based.
      const last = points[points.length - 1];
      this.sprayPoint = last;
      this.strokePoints.push(last);
      // Also splatter at every coalesced point so fast drags still leave
      // continuous coverage instead of dotted gaps.
      for (const p of points) spraySplatter(layer.ctx, p, this.strokeStyle, 6);
      this.scheduleRender();
      return;
    }

    if (this.state.tool === 'glitter') {
      const last = points[points.length - 1];
      this.sprayPoint = last;
      this.strokePoints.push(last);
      // Lower per-frame intensity than spray so the trail builds gradually
      // and reads as discrete sparkles rather than a solid wash.
      for (const p of points) glitterSplatter(layer.ctx, p, this.strokeStyle, 0.7);
      this.scheduleRender();
      return;
    }

    if (this.state.tool === 'stamp') {
      // Spacing keeps stamps from piling on top of each other when the user
      // drags slowly. Tuned to ~one stamp diameter; cycle the shape so the
      // trail reads as decorative variety.
      const minSpacing = Math.max(16, this.strokeStyle.size * 1.4);
      for (const p of points) {
        const last = this.lastStampPos;
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minSpacing) {
          stampAt(layer.ctx, p, this.strokeStyle, nextStampShape());
          this.lastStampPos = p;
          this.strokePoints.push(p);
        }
      }
      this.scheduleRender();
      return;
    }

    if (this.state.tool === 'line') {
      // Live preview: restore the pre-stroke snapshot, then draw a straight
      // line from the anchor point to the latest pointer position.
      if (!this.strokeBefore || !this.shapeAnchor) return;
      layer.ctx.putImageData(this.strokeBefore, 0, 0);
      const start = this.shapeAnchor;
      const last = points[points.length - 1];
      this.strokePoints = [start, last];
      beginStroke(layer.ctx, this.strokeStyle);
      drawLineSegment(layer.ctx, start, last, this.strokeStyle);
      endStroke(layer.ctx);
      this.scheduleRender();
      return;
    }

    if (this.state.tool === 'rect') {
      // Live preview of an axis-aligned rectangle. Stored as 5 points
      // (corners + return-to-start) so undo/redo replays through the
      // existing line-segment path.
      if (!this.strokeBefore || !this.shapeAnchor) return;
      layer.ctx.putImageData(this.strokeBefore, 0, 0);
      const start = this.shapeAnchor;
      const last = points[points.length - 1];
      const tl = { x: start.x, y: start.y, pressure: 0, t: start.t };
      const tr = { x: last.x, y: start.y, pressure: 0, t: start.t };
      const br = { x: last.x, y: last.y, pressure: 0, t: last.t };
      const bl = { x: start.x, y: last.y, pressure: 0, t: last.t };
      this.strokePoints = [tl, tr, br, bl, tl];
      beginStroke(layer.ctx, this.strokeStyle);
      drawLineSegment(layer.ctx, tl, tr, this.strokeStyle);
      drawLineSegment(layer.ctx, tr, br, this.strokeStyle);
      drawLineSegment(layer.ctx, br, bl, this.strokeStyle);
      drawLineSegment(layer.ctx, bl, tl, this.strokeStyle);
      endStroke(layer.ctx);
      this.scheduleRender();
      return;
    }

    if (this.state.tool === 'circle') {
      // Live preview of an ellipse fitted into the bounding box from the
      // anchor point to the current point. Drag from corner to corner like
      // a rectangle — the circle inscribes the box. Approximated with
      // ~64 line segments so it stores in StrokeCommand and replays
      // through the existing path.
      if (!this.strokeBefore || !this.shapeAnchor) return;
      layer.ctx.putImageData(this.strokeBefore, 0, 0);
      const start = this.shapeAnchor;
      const last = points[points.length - 1];
      const cx = (start.x + last.x) / 2;
      const cy = (start.y + last.y) / 2;
      const rx = Math.abs(last.x - start.x) / 2;
      const ry = Math.abs(last.y - start.y) / 2;
      const SEGMENTS = 64;
      const pts: Point[] = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2;
        pts.push({
          x: cx + Math.cos(a) * rx,
          y: cy + Math.sin(a) * ry,
          pressure: 0,
          t: start.t,
        });
      }
      this.strokePoints = pts;
      beginStroke(layer.ctx, this.strokeStyle);
      for (let i = 1; i < pts.length; i++) {
        drawLineSegment(layer.ctx, pts[i - 1], pts[i], this.strokeStyle);
      }
      endStroke(layer.ctx);
      this.scheduleRender();
      return;
    }

    // Render path depends on the tool.
    const tool = this.state.tool;
    for (const p of points) {
      const buf = this.strokePoints;
      const prev = buf[buf.length - 1];
      buf.push(p);
      if (tool === 'blur') {
        // Walk the segment in steps so fast drags get continuous blur,
        // not a string of disconnected blobs.
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(2, this.strokeStyle.size * 0.4);
        const steps = Math.max(1, Math.ceil(dist / step));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          blurStamp(
            layer.ctx as CanvasRenderingContext2D,
            prev.x + dx * t,
            prev.y + dy * t,
            this.strokeStyle.size,
          );
        }
      } else if (tool === 'brush') {
        drawBrushSegment(layer.ctx, prev, p, this.strokeStyle);
      } else if (tool === 'pen' || buf.length < 3) {
        drawLineSegment(layer.ctx, prev, p, this.strokeStyle);
      } else {
        drawSmoothSegment(layer.ctx, buf[buf.length - 3], prev, p, this.strokeStyle);
      }
    }
    this.scheduleRender();
  }

  private startSprayLoop() {
    if (this.sprayRaf !== null) return;
    const tick = () => {
      this.sprayRaf = null;
      if (!this.sprayPoint || !this.strokeStyle || !this.strokeLayerId) return;
      const layer = this.doc.getLayer(this.strokeLayerId);
      if (!layer) return;
      if (this.state.tool === 'glitter') {
        glitterSplatter(layer.ctx, this.sprayPoint, this.strokeStyle, 0.6);
      } else {
        spraySplatter(layer.ctx, this.sprayPoint, this.strokeStyle, 8);
      }
      this.scheduleRender();
      this.sprayRaf = requestAnimationFrame(tick);
    };
    this.sprayRaf = requestAnimationFrame(tick);
  }

  private stopSprayLoop() {
    if (this.sprayRaf !== null) {
      cancelAnimationFrame(this.sprayRaf);
      this.sprayRaf = null;
    }
    this.sprayPoint = null;
  }

  private handleStrokeEnd() {
    this.stopSprayLoop();
    if (!this.strokeStyle || !this.strokeLayerId || !this.strokeBefore) {
      this.resetStroke();
      return;
    }
    const layer = this.doc.getLayer(this.strokeLayerId);
    if (!layer) {
      this.resetStroke();
      return;
    }
    endStroke(layer.ctx);

    const after = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    const cmd = new StrokeCommand(this.strokeLayerId, this.strokePoints, this.strokeStyle);

    // Inject pre-captured before/after so the command can undo/redo without
    // re-rendering. The bbox is the full canvas — fine for normal strokes;
    // for very large docs, switch to a tiled snapshot strategy.
    type CmdInternals = {
      before: ImageData;
      after: ImageData;
      bbox: { x: number; y: number; w: number; h: number };
    };
    const internals = cmd as unknown as CmdInternals;
    internals.before = this.strokeBefore;
    internals.after = after;
    internals.bbox = { x: 0, y: 0, w: layer.canvas.width, h: layer.canvas.height };

    this.history.push(cmd);
    this.resetStroke();
    this.scheduleRender();
  }

  private resetStroke() {
    this.strokeStyle = null;
    this.strokePoints = [];
    this.strokeBefore = null;
    this.strokeLayerId = null;
    this.shapeAnchor = null;
    this.lastStampPos = null;
  }

  private async runFillAt(p: Point) {
    const layer = this.doc.getActiveLayer();
    if (layer.locked) return;
    if (p.x < 0 || p.y < 0 || p.x >= this.doc.meta.width || p.y >= this.doc.meta.height) return;
    this.setState({ busy: true });
    try {
      const cmd = await runFill(this.doc, layer.id, p.x, p.y, this.state.color, 28);
      this.history.push(cmd);
      this.scheduleRender();
    } finally {
      this.setState({ busy: false });
    }
  }

  private handleGesture(g: { dx: number; dy: number; dscale: number; cx: number; cy: number }) {
    const rect = this.displayCanvas.getBoundingClientRect();
    const sx = g.cx - rect.left;
    const sy = g.cy - rect.top;
    this.viewport.pan(g.dx, g.dy);
    this.viewport.zoomAt(sx, sy, g.dscale);
    this.scheduleRender();
  }

  private handleKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (this.history.undo(this.doc)) this.scheduleRender();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      if (this.history.redo(this.doc)) this.scheduleRender();
    } else if (e.key === 'b') this.setState({ tool: 'brush' });
    else if (e.key === 'p') this.setState({ tool: 'pen' });
    else if (e.key === 's') this.setState({ tool: 'spray' });
    else if (e.key === 'i') this.setState({ tool: 'glitter' });
    else if (e.key === 't') this.setState({ tool: 'stamp' });
    else if (e.key === 'l') this.setState({ tool: 'line' });
    else if (e.key === 'c') this.setState({ tool: 'circle' });
    else if (e.key === 'r') this.setState({ tool: 'rect' });
    else if (e.key === 'u') this.setState({ tool: 'blur' });
    else if (e.key === 'e') this.setState({ tool: 'eraser' });
    else if (e.key === 'g') this.setState({ tool: 'fill' });
    else if (e.key === 'h') this.setState({ tool: 'pan' });
  };

  newDocument(width = 1200, height = 800, name = 'Untitled') {
    this.doc = new Document({
      id: newId('doc'),
      name,
      width,
      height,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.viewport = new Viewport(width, height);
    this.history.clear();
    this.fitToWindow();
  }
}
