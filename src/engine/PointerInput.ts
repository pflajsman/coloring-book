import type { Point } from '../types/document';

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
};

type ActivePointer = {
  id: number;
  type: string;
  x: number;
  y: number;
};

export class PointerInput {
  private active = new Map<number, ActivePointer>();
  private strokePointerId: number | null = null;
  private gestureIds: number[] = [];
  private gestureStartDist = 0;
  private gestureLastCenter = { x: 0, y: 0 };

  constructor(private el: HTMLElement, private h: PointerInputHandlers) {
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

    this.active.set(e.pointerId, {
      id: e.pointerId,
      type: e.pointerType,
      x: e.clientX,
      y: e.clientY,
    });

    // Two-finger gesture takes precedence — cancel any in-flight stroke.
    if (this.active.size >= 2) {
      this.strokePointerId = null;
      this.beginGesture();
      return;
    }

    if (this.strokePointerId !== null) return;
    this.strokePointerId = e.pointerId;
    this.h.onStrokeStart(this.toPoint(e), e);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.active.has(e.pointerId)) return;
    const a = this.active.get(e.pointerId)!;
    a.x = e.clientX;
    a.y = e.clientY;

    if (this.gestureIds.length === 2) {
      this.updateGesture();
      return;
    }

    if (e.pointerId !== this.strokePointerId) return;
    e.preventDefault();

    // getCoalescedEvents returns the high-frequency samples the OS batched
    // into this single rAF-aligned pointermove. Without it you get visible
    // angles between samples on 120Hz displays / styluses.
    const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const events = raw.length ? raw : [e];
    const points = events.map((ev) => this.toPoint(ev));

    // Predicted events let us extend the stroke ~one frame ahead of the
    // physical pointer — used purely for the live preview, NOT committed to
    // the actual stroke buffer (otherwise undo/replay would be lossy).
    this.h.onStrokeMove(points, e);
  };

  private onUp = (e: PointerEvent) => {
    this.active.delete(e.pointerId);
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }

    if (this.gestureIds.includes(e.pointerId)) {
      this.gestureIds = [];
    }

    if (e.pointerId === this.strokePointerId) {
      this.strokePointerId = null;
      this.h.onStrokeEnd(e);
    }
  };

  private beginGesture() {
    this.gestureIds = [...this.active.keys()].slice(0, 2);
    if (this.gestureIds.length < 2) return;
    const [a, b] = this.gestureIds.map((id) => this.active.get(id)!);
    this.gestureStartDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.gestureLastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private updateGesture() {
    if (this.gestureIds.length < 2) return;
    const [a, b] = this.gestureIds.map((id) => this.active.get(id)!);
    if (!a || !b) return;
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
