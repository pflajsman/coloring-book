// Is an AI-generated picture actually a coloring page? The app turns every
// non-white pixel into black line art, so a painted or shaded image (for
// example Pollinations' fallback model) becomes dark blotches. We measure a
// downscaled copy and reject pictures that are clearly not black outlines on
// white, so the child sees "try again" instead of a mess.

export type LineArtStats = {
  // Share of pixels, 0..1.
  colourful: number; // clearly coloured (channel spread > 60)
  mid: number; // grey tones between ink and paper
  dark: number; // ink
};

export function lineArtStats(rgba: Uint8ClampedArray): LineArtStats {
  let colourful = 0, mid = 0, dark = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    n++;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const light = (r + g + b) / 3;
    if (spread > 60) colourful++;
    else if (light < 70) dark++;
    else if (light < 200) mid++;
  }
  if (!n) return { colourful: 0, mid: 0, dark: 0 };
  return { colourful: colourful / n, mid: mid / n, dark: dark / n };
}

// Thresholds are deliberately loose: anti-aliased edges and JPEG noise add
// some grey, so only pictures that are clearly painted, shaded, filled or
// empty are rejected. Calibrated 2026-09-29: real line art measured 0 %
// colour, up to 22.5 % dark and 12.5 % grey; a Pollinations fallback
// painting measured 11 % colour, 33 % dark.
export function isLineArt(s: LineArtStats): boolean {
  return s.colourful <= 0.05 && s.mid <= 0.2 && s.dark <= 0.28 && s.dark + s.mid >= 0.005;
}
