import type { Point, StrokeStyle } from '../types/document';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function widthForPressure(style: StrokeStyle, pressure: number): number {
  const sens = style.pressureSensitivity;
  const factor = 1 - sens + sens * pressure * 2;
  return Math.max(0.5, style.size * factor);
}

export function beginStroke(ctx: Ctx, style: StrokeStyle) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
  }
}

export function endStroke(ctx: Ctx) {
  ctx.globalCompositeOperation = 'source-over';
}

export function drawDot(ctx: Ctx, p: Point, style: StrokeStyle) {
  const r = widthForPressure(style, p.pressure) / 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Plain straight-line segment. Used for the thin pen and for replay paths
// where smoothing isn't needed.
export function drawLineSegment(ctx: Ctx, prev: Point, curr: Point, style: StrokeStyle) {
  const w0 = widthForPressure(style, prev.pressure);
  const w1 = widthForPressure(style, curr.pressure);
  ctx.lineWidth = (w0 + w1) / 2;
  ctx.beginPath();
  ctx.moveTo(prev.x, prev.y);
  ctx.lineTo(curr.x, curr.y);
  ctx.stroke();
}

// Quadratic-spline smoothing using the "midpoint" algorithm. The curve goes
// from the previous segment's midpoint, uses `prev` as the control point,
// and ends at the new midpoint(prev, curr). This needs three points to draw
// each curve — the caller passes (prevPrev, prev, curr).
//
// Why three points: with only (prev, curr) we can either go straight (jagged
// at angles) or use prev as control, but then the *endpoint* of one curve
// doesn't match the *startpoint* of the next, producing visible gaps —
// exactly the "dotted line on fast strokes" symptom.
export function drawSmoothSegment(
  ctx: Ctx,
  prevPrev: Point,
  prev: Point,
  curr: Point,
  style: StrokeStyle,
) {
  const w0 = widthForPressure(style, prev.pressure);
  const w1 = widthForPressure(style, curr.pressure);
  const startMid = { x: (prevPrev.x + prev.x) / 2, y: (prevPrev.y + prev.y) / 2 };
  const endMid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };

  ctx.lineWidth = (w0 + w1) / 2;
  ctx.beginPath();
  ctx.moveTo(startMid.x, startMid.y);
  ctx.quadraticCurveTo(prev.x, prev.y, endMid.x, endMid.y);
  ctx.stroke();
}

// Backwards-compatible export — older callers used drawSegment for any
// brush stroke. We keep it as an alias for the straight-line version since
// without three points there's nothing to smooth.
export const drawSegment = drawLineSegment;

// ---------- Soft "pro" brush ----------
// Renders strokes by stamping a radial-gradient brush head along the path.
// This is what gives gradient-edged paint instead of a hard line. The brush
// head is rendered once at a fixed 128 px and re-used for every stamp via
// drawImage, scaled to the stroke's current width.

const BRUSH_HEAD_SIZE = 128;
const brushHeadCache = new Map<string, HTMLCanvasElement>();

function getBrushHead(color: string): HTMLCanvasElement {
  const cached = brushHeadCache.get(color);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = BRUSH_HEAD_SIZE;
  c.height = BRUSH_HEAD_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('brush head ctx');

  const r = BRUSH_HEAD_SIZE / 2;
  // Soft falloff: opaque core for ~40% of the radius, then fade to fully
  // transparent at the edge. Using two stops with a non-linear midpoint
  // gives the painted "wet" feel without a hard core/halo transition.
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(0.7, color + '80'); // ~50% alpha (hex append)
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BRUSH_HEAD_SIZE, BRUSH_HEAD_SIZE);

  brushHeadCache.set(color, c);
  // Don't let the cache grow unbounded — drop the oldest when it gets big.
  if (brushHeadCache.size > 16) {
    const first = brushHeadCache.keys().next().value;
    if (first) brushHeadCache.delete(first);
  }
  return c;
}

// Hex-append alpha only works for #rrggbb; normalize 3-char hex first.
function normalizeHex(color: string): string {
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }
  return color;
}

// Stamp the brush head once at (x, y) with the given diameter.
function stampBrush(ctx: Ctx, head: HTMLCanvasElement, x: number, y: number, size: number) {
  const half = size / 2;
  ctx.drawImage(head, x - half, y - half, size, size);
}

// Render a brush segment: walk the line in small steps and stamp the head at
// each. Step distance is ~12% of the brush diameter, dense enough to read
// as a continuous painted stroke.
export function drawBrushSegment(ctx: Ctx, prev: Point, curr: Point, style: StrokeStyle) {
  if (style.eraser) {
    // Eraser uses destination-out; no need for a soft brush head — the
    // existing line-segment path looks fine and is much faster.
    drawLineSegment(ctx, prev, curr, style);
    return;
  }
  const head = getBrushHead(normalizeHex(style.color));
  const w0 = widthForPressure(style, prev.pressure);
  const w1 = widthForPressure(style, curr.pressure);
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const avgW = (w0 + w1) / 2;
  if (dist < 0.5) {
    stampBrush(ctx, head, curr.x, curr.y, avgW);
    return;
  }
  // ~8 stamps per brush diameter at the smallest size, scaling down with
  // bigger brushes to keep total stamp count reasonable.
  const step = Math.max(0.5, avgW * 0.12);
  const steps = Math.ceil(dist / step);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = prev.x + dx * t;
    const y = prev.y + dy * t;
    const w = w0 + (w1 - w0) * t;
    stampBrush(ctx, head, x, y, w);
  }
}

// Spray paint emit — two passes:
// 1. A soft radial-gradient "mist" stamp builds a smoothly-falling cloud at
//    the nozzle center. Many overlapping low-alpha stamps create the rich,
//    feathered look of real spray paint instead of dots-on-white.
// 2. A speckle pass on top adds the characteristic grainy texture you see
//    where individual paint droplets land.
const sprayHeadCache = new Map<string, HTMLCanvasElement>();

function getSprayHead(color: string): HTMLCanvasElement {
  const cached = sprayHeadCache.get(color);
  if (cached) return cached;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('spray head ctx');
  const r = size / 2;
  // Very soft falloff: low-alpha core, fully transparent at edge. Each
  // stamp adds only a faint amount; density builds up the mist.
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color + '38');   // ~22% alpha core
  grad.addColorStop(0.5, color + '18'); // ~10% alpha
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  sprayHeadCache.set(color, c);
  if (sprayHeadCache.size > 16) {
    const first = sprayHeadCache.keys().next().value;
    if (first) sprayHeadCache.delete(first);
  }
  return c;
}

export function spraySplatter(ctx: Ctx, p: Point, style: StrokeStyle, intensity = 1) {
  if (style.eraser) return;
  const radius = Math.max(10, style.size * 1.2);
  const head = getSprayHead(normalizeHex(style.color));

  // Mist pass: 3 jittered stamps of the soft head. Slight random offset and
  // size variance keeps the cloud from looking like a perfect circle.
  const mistStamps = 3;
  for (let i = 0; i < mistStamps; i++) {
    const ox = (Math.random() - 0.5) * radius * 0.4;
    const oy = (Math.random() - 0.5) * radius * 0.4;
    const sr = radius * (0.85 + Math.random() * 0.3);
    const d = sr * 2;
    ctx.drawImage(head, p.x + ox - sr, p.y + oy - sr, d, d);
  }

  // Speckle pass: pinprick droplets at the perimeter for the grainy
  // spray-can look. sqrt(uniform) for even disk distribution.
  const speckle = Math.min(140, Math.round(radius * radius * 0.12 * intensity));
  for (let i = 0; i < speckle; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = p.x + Math.cos(a) * r;
    const y = p.y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(x, y, 0.4 + Math.random() * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Replay a full stroke (used during undo/redo and document load). Uses
// 3-point smoothing where possible, falling back to straight lines at the
// stroke endpoints where there isn't enough context.
export function renderStroke(ctx: Ctx, points: Point[], style: StrokeStyle) {
  if (points.length === 0) return;
  beginStroke(ctx, style);
  if (points.length === 1) {
    drawDot(ctx, points[0], style);
    endStroke(ctx);
    return;
  }
  if (points.length === 2) {
    drawLineSegment(ctx, points[0], points[1], style);
    endStroke(ctx);
    return;
  }
  // First segment: straight from p0 to midpoint(p0,p1).
  drawLineSegment(ctx, points[0], points[1], style);
  for (let i = 2; i < points.length; i++) {
    drawSmoothSegment(ctx, points[i - 2], points[i - 1], points[i], style);
  }
  endStroke(ctx);
}
