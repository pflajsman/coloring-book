import type { Point } from '../types/document';
import { PointerTracker } from './PointerTracker';

export type StrokeStartHandler = (p: Point, e: PointerEvent) => void;
export type StrokeMoveHandler = (points: Point[], e: PointerEvent) => void;
export type StrokeEndHandler = (e: PointerEvent) => void;
export type TapHandler = (p: Point, e: PointerEvent) => void;
export type GestureHandler = (g: { dx: number; dy: number; dscale: number; cx: number; cy: number }) => void;

export type PointerInputHandlers = {
  onStrokeStart: StrokeStartHandler;
  onStrokeMove: StrokeMoveHandler;
  onStrokeEnd: StrokeEndHandler;
  onTap?: TapHandler;
  onGesture?: GestureHandler;
  toDoc: (sx: number, sy: number) => { x: number; y: number };
  isPenOnly: () => boolean; // palm-rejection: when true, ignore touch
  // Kid mode: when true, extra fingers never zoom/pan and never interrupt
  // the stroke in progress. See PointerTracker for the rules.
  isZoomLocked: () => boolean;
};

export class PointerInput {
  private tracker: PointerTracker;
  private gestureStartDist = 0;
  private gestureLastCenter = { x: 0, y: 0 };

  constructor(private el: HTMLElement, private h: PointerInputHandlers) {
    this.tracker = new PointerTracker(h.isZoomLocked);
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onUp);
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('pointerleave', this.onUp);
  }

  private toPoint(e: PointerEvent): Point {
    const rect = this.el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const d = this.h.toDoc(sx, sy);
    // Mouse always reports pressure 0.5 when a button is held; treat that as
    // "no pressure data" so it doesn't contaminate the pen sensitivity curve.
    const pressure =
      e.pointerType === 'pen'
        ? (e.pressure > 0 ? e.pressure : 0.5)
        : 0.5;
    return { x: d.x, y: d.y, pressure, t: e.timeStamp };
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);

    // Palm rejection: when pen-only mode is on and we see a touch, drop it.
    if (this.h.isPenOnly() && e.pointerType === 'touch') return;

    const r = this.tracker.down(e.pointerId, e.clientX, e.clientY);
    if (r.kind === 'stroke-start') {
      this.h.onStrokeStart(this.toPoint(e), e);
    } else if (r.kind === 'gesture-start') {
      // Commit whatever was drawn so far instead of leaving a half stroke
      // with a running spray loop and no undo entry.
      if (r.endStroke) this.h.onStrokeEnd(e);
      this.beginGesture();
    }
  };

  private onMove = (e: PointerEvent) => {
    const r = this.tracker.move(e.pointerId, e.clientX, e.clientY);
    if (r === 'gesture') {
      this.updateGesture();
      return;
    }
    if (r !== 'stroke') return;
    e.preventDefault();

    // getCoalescedEvents returns the high-frequency samples the OS batched
    // into this single rAF-aligned pointermove. Without it you get visible
    // angles between samples on 120Hz displays / styluses.
    const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const events = raw.length ? raw : [e];
    this.h.onStrokeMove(events.map((ev) => this.toPoint(ev)), e);
  };

  private onUp = (e: PointerEvent) => {
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    // pointerleave follows pointerup for the same pointer; only the first
    // one counts.
    if (!this.tracker.has(e.pointerId)) return;
    if (this.tracker.up(e.pointerId).endStroke) this.h.onStrokeEnd(e);
  };

  private beginGesture() {
    const pair = this.tracker.gesturePair();
    if (!pair) return;
    const [a, b] = pair;
    this.gestureStartDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.gestureLastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private updateGesture() {
    const pair = this.tracker.gesturePair();
    if (!pair) return;
    const [a, b] = pair;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const dscale = this.gestureStartDist > 0 ? dist / this.gestureStartDist : 1;
    const dx = center.x - this.gestureLastCenter.x;
    const dy = center.y - this.gestureLastCenter.y;

    this.h.onGesture?.({ dx, dy, dscale, cx: center.x, cy: center.y });

    this.gestureStartDist = dist;
    this.gestureLastCenter = center;
  }
}
