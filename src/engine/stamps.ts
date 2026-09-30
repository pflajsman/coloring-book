// Stamp tool shapes. Each stamp is drawn in a 100x100 box centred on the
// tap point (coordinates -50..50) and scaled to the brush size. The body
// takes the current paint colour; small details (eyes, leaves, stems) have
// fixed colours so the picture reads at any paint colour. Poop is always
// brown, the way children expect it.

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type StampId =
  | 'star' | 'heart' | 'flower' | 'sparkle' | 'unicorn' | 'mushroom'
  | 'dog' | 'cat' | 'pig' | 'poop' | 'apple' | 'pear';

export const SURPRISE = 'surprise' as const;
export type StampChoice = StampId | typeof SURPRISE;

type StampDef = {
  id: StampId;
  name: string;
  // Abstract shapes may spin to any angle; pictures only tilt a little so a
  // dog never lands upside down.
  spin: boolean;
  draw: (ctx: Ctx, color: string) => void;
};

const INK = '#2a2a3a';
const LEAF = '#4caf50';
const STEM = '#7a4a24';

// Mix a #rrggbb colour towards black (amount < 0) or white (amount > 0).
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  const ch = (v: number) => Math.round(v + (target - v) * k).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function circle(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
function poly(ctx: Ctx, pts: [number, number][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function shape(ctx: Ctx, d: string, color: string) {
  ctx.fillStyle = color;
  ctx.fill(new Path2D(d));
}
function smile(ctx: Ctx, x: number, y: number, w: number, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - w * 0.4, w, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}
// Eye dots stay dark on light paint and light on very dark paint.
function eyeColour(color: string) {
  const n = parseInt(color.slice(1), 16);
  const light = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
  return light < 60 ? '#ffffff' : INK;
}

export const STAMPS: StampDef[] = [
  {
    id: 'star', name: 'Star', spin: true,
    draw: (ctx, c) => poly(ctx, Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 22 : 50;
      return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
    }), c),
  },
  {
    id: 'heart', name: 'Heart', spin: true,
    draw: (ctx, c) => shape(ctx, 'M0 42 C -60 0 -35 -45 0 -18 C 35 -45 60 0 0 42 Z', c),
  },
  {
    id: 'flower', name: 'Flower', spin: true,
    draw: (ctx, c) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(ctx, Math.cos(a) * 26, Math.sin(a) * 26, 22, c);
      }
      circle(ctx, 0, 0, 15, c.toLowerCase() === '#ffffff' ? INK : '#ffffff');
    },
  },
  {
    id: 'sparkle', name: 'Sparkle', spin: true,
    draw: (ctx, c) => poly(ctx, [[0, -50], [9, -9], [50, 0], [9, 9], [0, 50], [-9, 9], [-50, 0], [-9, -9]], c),
  },
  {
    id: 'unicorn', name: 'Unicorn', spin: false,
    draw: (ctx, c) => {
      // Side view facing right: neck, head, muzzle, mane, ear, golden horn.
      shape(ctx, 'M-30 48 L-22 5 L5 5 L2 48 Z', c);
      ellipse(ctx, 0, -5, 30, 22, -0.25, c);
      ellipse(ctx, 26, 8, 17, 13, 0.3, c);
      circle(ctx, -24, -14, 11, '#ff6b9d');
      circle(ctx, -30, 2, 11, '#b8a4ff');
      circle(ctx, -32, 20, 10, '#6dd5ed');
      poly(ctx, [[-6, -24], [2, -46], [8, -22]], c);
      poly(ctx, [[6, -24], [26, -58], [16, -20]], '#ffd23f');
      circle(ctx, 6, -8, 4.5, eyeColour(c));
      circle(ctx, 34, 12, 2.5, eyeColour(c));
    },
  },
  {
    id: 'mushroom', name: 'Mushroom', spin: false,
    draw: (ctx, c) => {
      shape(ctx, 'M-16 2 L16 2 L20 46 Q0 52 -20 46 Z', '#f6e7c8');
      shape(ctx, 'M-48 8 Q-46 -44 0 -46 Q46 -44 48 8 Q0 18 -48 8 Z', c);
      const spot = c.toLowerCase() === '#ffffff' ? '#e74c3c' : '#ffffff';
      circle(ctx, -24, -18, 8, spot);
      circle(ctx, 4, -32, 9, spot);
      circle(ctx, 26, -12, 7, spot);
      circle(ctx, -2, -6, 6, spot);
    },
  },
  {
    id: 'dog', name: 'Dog', spin: false,
    draw: (ctx, c) => {
      ellipse(ctx, -34, -2, 13, 26, 0.35, shade(c, -0.3));
      ellipse(ctx, 34, -2, 13, 26, -0.35, shade(c, -0.3));
      circle(ctx, 0, 0, 36, c);
      ellipse(ctx, 0, 16, 18, 13, 0, shade(c, 0.45));
      circle(ctx, -13, -8, 5, eyeColour(c));
      circle(ctx, 13, -8, 5, eyeColour(c));
      ellipse(ctx, 0, 9, 8, 6, 0, INK);
      smile(ctx, 0, 22, 8);
    },
  },
  {
    id: 'cat', name: 'Cat', spin: false,
    draw: (ctx, c) => {
      poly(ctx, [[-34, -8], [-28, -48], [-6, -30]], c);
      poly(ctx, [[34, -8], [28, -48], [6, -30]], c);
      circle(ctx, 0, 2, 36, c);
      circle(ctx, -13, -4, 5, eyeColour(c));
      circle(ctx, 13, -4, 5, eyeColour(c));
      poly(ctx, [[-6, 8], [6, 8], [0, 15]], '#ff8fab');
      ctx.strokeStyle = eyeColour(c);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(s * 12, 14); ctx.lineTo(s * 40, 8);
        ctx.moveTo(s * 12, 18); ctx.lineTo(s * 40, 22);
      }
      ctx.stroke();
    },
  },
  {
    id: 'pig', name: 'Pig', spin: false,
    draw: (ctx, c) => {
      poly(ctx, [[-32, -16], [-34, -46], [-10, -32]], shade(c, -0.2));
      poly(ctx, [[32, -16], [34, -46], [10, -32]], shade(c, -0.2));
      circle(ctx, 0, 0, 36, c);
      // Darker snout on light paint, lighter snout on dark paint.
      ellipse(ctx, 0, 10, 17, 12, 0, eyeColour(c) === INK ? shade(c, -0.18) : shade(c, 0.35));
      circle(ctx, -6, 10, 3.5, INK);
      circle(ctx, 6, 10, 3.5, INK);
      circle(ctx, -14, -10, 5, eyeColour(c));
      circle(ctx, 14, -10, 5, eyeColour(c));
    },
  },
  {
    id: 'poop', name: 'Poop', spin: false,
    draw: (ctx) => {
      const brown = '#8d5524';
      ellipse(ctx, 0, 30, 44, 17, 0, brown);
      ellipse(ctx, 0, 8, 33, 15, 0, shade(brown, 0.08));
      ellipse(ctx, 0, -12, 22, 13, 0, brown);
      shape(ctx, 'M-8 -22 Q 2 -46 10 -40 Q 4 -30 12 -22 Z', brown);
      circle(ctx, -11, 6, 7, '#ffffff');
      circle(ctx, 11, 6, 7, '#ffffff');
      circle(ctx, -10, 7, 3.5, INK);
      circle(ctx, 12, 7, 3.5, INK);
      smile(ctx, 0, 28, 12, '#ffffff');
    },
  },
  {
    id: 'apple', name: 'Apple', spin: false,
    draw: (ctx, c) => {
      shape(ctx, 'M-3 -30 Q 2 -46 8 -50 L 12 -46 Q 6 -40 5 -30 Z', STEM);
      ellipse(ctx, 18, -40, 14, 7, -0.5, LEAF);
      shape(ctx, 'M0 -26 C -30 -44 -52 -22 -44 8 C -38 34 -18 50 0 42 C 18 50 38 34 44 8 C 52 -22 30 -44 0 -26 Z', c);
      ellipse(ctx, -22, -8, 6, 12, 0.3, shade(c, 0.5));
    },
  },
  {
    id: 'pear', name: 'Pear', spin: false,
    draw: (ctx, c) => {
      shape(ctx, 'M-3 -38 Q 0 -52 6 -56 L 10 -52 Q 5 -46 4 -38 Z', STEM);
      ellipse(ctx, 16, -48, 13, 6, -0.5, LEAF);
      shape(ctx, 'M0 -40 C -14 -40 -16 -24 -18 -12 C -38 0 -40 44 0 46 C 40 44 38 0 18 -12 C 16 -24 14 -40 0 -40 Z', c);
      ellipse(ctx, -16, 14, 5, 11, 0.3, shade(c, 0.5));
    },
  },
];

const BY_ID = new Map(STAMPS.map((s) => [s.id, s]));

// Which stamp comes out next. "Surprise" walks through all stamps and keeps
// its place across strokes, so repeated taps give a varied row instead of
// always restarting at the star.
export class StampPicker {
  selected: StampChoice = SURPRISE;
  private cursor = 0;

  select(choice: StampChoice) {
    this.selected = choice;
  }

  next(): StampId {
    if (this.selected !== SURPRISE) return this.selected;
    const id = STAMPS[this.cursor % STAMPS.length].id;
    this.cursor++;
    return id;
  }
}

// Draw one stamp centred at (x, y), `size` px across.
export function drawStamp(ctx: Ctx, id: StampId, x: number, y: number, size: number, color: string, random = Math.random) {
  const def = BY_ID.get(id);
  if (!def) return;
  const angle = def.spin ? random() * Math.PI * 2 : (random() - 0.5) * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size / 100, size / 100);
  def.draw(ctx, color);
  ctx.restore();
}
