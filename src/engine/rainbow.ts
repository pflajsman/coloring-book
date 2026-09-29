// Rainbow brush colour: the hue walks around the colour wheel as the stroke
// gets longer. Quantized to 36 steps so the soft brush heads (one small
// canvas per colour) can be cached and reused; a continuous hue would build
// a new head for almost every stamp.

export const RAINBOW_CYCLE_PX = 600;
const STEPS = 36;
const SATURATION = 90;
const LIGHTNESS = 55;

export function rainbowColorAt(distance: number, startHue: number): string {
  const hue = startHue + (distance / RAINBOW_CYCLE_PX) * 360;
  const step = Math.floor((((hue % 360) + 360) % 360) / (360 / STEPS));
  return hslToHex(step * (360 / STEPS), SATURATION, LIGHTNESS);
}

// Brush heads append a hex alpha to the colour, so rainbow colours must be
// #rrggbb rather than hsl() strings.
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
