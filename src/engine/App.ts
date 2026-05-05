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
  spraySplatter,
} from './StrokeRenderer';
import { runFill } from './fillClient';
import type { Point, StrokeStyle } from '../types/document';

export type Tool = 'brush' | 'pen' | 'spray' | 'line' | 'circle' | 'eraser' | 'fill' | 'pan';

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
    pressureSensitivity: 0.7,
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
  private sprayPoint: Point | null = null;
  private sprayRaf: number | null = null;

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
    // Reserve just enough margin for the floating UI; everything else is
    // drawing area. `padding: 0` on the fit means we don't add an extra
    // gap on top of the per-edge insets.
    //   top: top control row (button height + tiny gap)
    //   left/right: side panel widths (palette/dock + tiny gap)
    //   bottom: minimal — nothing floats there
    this.viewport.fit(rect.width, rect.height, {
      top: 92,
      left: 88,
      right: 96,
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
    const isShape = tool === 'line' || tool === 'circle';
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
    } else if (this.state.tool === 'brush') {
      // Stamp at the same point twice so a tap produces a visible blob; the
      // brush head's center is opaque so a single stamp reads as a soft dot.
      drawBrushSegment(layer.ctx, p, p, this.strokeStyle);
    } else if (this.state.tool === 'line' || this.state.tool === 'circle') {
      // Don't draw anything yet — we preview during the drag and commit on
      // release. Pin the anchor here so subsequent moves use the original
      // tap point, not whatever ended up at strokePoints[0] last frame.
      this.shapeAnchor = p;
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

    // Render path depends on the tool:
    //  - pen: straight lines (crisp, no smoothing artifacts)
    //  - brush: stamped radial-gradient head for soft, painterly edges
    //  - eraser: smoothed line, destination-out composite
    const tool = this.state.tool;
    for (const p of points) {
      const buf = this.strokePoints;
      const prev = buf[buf.length - 1];
      buf.push(p);
      if (tool === 'brush') {
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
      spraySplatter(layer.ctx, this.sprayPoint, this.strokeStyle, 8);
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
    else if (e.key === 'l') this.setState({ tool: 'line' });
    else if (e.key === 'c') this.setState({ tool: 'circle' });
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
