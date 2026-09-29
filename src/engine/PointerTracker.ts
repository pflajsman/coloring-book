// Pure bookkeeping for "which pointer is doing what" on the canvas. Kept
// free of DOM types so the rules can be unit tested.
//
// Zoom locked (default, kid mode): the first pointer that lands while no
// stroke is running owns the stroke. Every other pointer (a resting palm, a
// second finger) is ignored. There is never a gesture.
//
// Zoom unlocked (parent mode): a second pointer turns the interaction into a
// two-finger pinch/pan. Any in-flight stroke is ended (committed), extra
// pointers beyond two are ignored, and fingers left over after a gesture do
// not start drawing until they lift.

export type DownResult =
  | { kind: 'ignore' }
  | { kind: 'stroke-start' }
  | { kind: 'gesture-start'; endStroke: boolean };

type Pos = { x: number; y: number };

export class PointerTracker {
  private active = new Map<number, Pos>();
  private strokeId: number | null = null;
  private gestureIds: number[] = [];

  constructor(private isZoomLocked: () => boolean) {}

  has(id: number): boolean {
    return this.active.has(id);
  }

  down(id: number, x: number, y: number): DownResult {
    this.active.set(id, { x, y });
    if (this.isZoomLocked()) {
      if (this.strokeId !== null) return { kind: 'ignore' };
      this.strokeId = id;
      return { kind: 'stroke-start' };
    }
    if (this.gestureIds.length === 2) return { kind: 'ignore' };
    if (this.active.size >= 2) {
      const endStroke = this.strokeId !== null;
      this.strokeId = null;
      this.gestureIds = [...this.active.keys()].slice(-2);
      return { kind: 'gesture-start', endStroke };
    }
    this.strokeId = id;
    return { kind: 'stroke-start' };
  }

  move(id: number, x: number, y: number): 'stroke' | 'gesture' | 'ignore' {
    const p = this.active.get(id);
    if (!p) return 'ignore';
    p.x = x;
    p.y = y;
    if (this.gestureIds.includes(id)) return 'gesture';
    if (id === this.strokeId) return 'stroke';
    return 'ignore';
  }

  up(id: number): { endStroke: boolean } {
    this.active.delete(id);
    if (this.gestureIds.includes(id)) this.gestureIds = [];
    if (id === this.strokeId) {
      this.strokeId = null;
      return { endStroke: true };
    }
    return { endStroke: false };
  }

  // The owner's press turned out to be a tap that is already handled (fill,
  // or a stroke the App refused). Give up ownership so the next pointer can
  // draw even while this one (often a resting palm) stays down.
  release(id: number) {
    if (this.strokeId === id) this.strokeId = null;
  }

  gesturePair(): [Pos, Pos] | null {
    if (this.gestureIds.length !== 2) return null;
    const a = this.active.get(this.gestureIds[0]);
    const b = this.active.get(this.gestureIds[1]);
    return a && b ? [{ ...a }, { ...b }] : null;
  }
}
