// Templates live in /public/templates/ as standalone SVG files indexed by
// /public/templates/manifest.json. We fetch the manifest once on first
// request and lazy-load SVG bodies as needed. This keeps the JS bundle small
// (no inline SVGs), lets users add new pictures without a rebuild, and lets
// the service worker cache them like any other static asset.

export type Template = {
  id: string;
  name: string;
  // Path under /public; null means "blank — no line art".
  file: string | null;
  // Optional category for the picker filter. Manifest entries without a
  // category fall under "All".
  category?: string;
};

let manifestPromise: Promise<Template[]> | null = null;
const svgCache = new Map<string, string>();

// import.meta.env.BASE_URL handles the case where Vite is configured with a
// non-root `base` (e.g., when deploying to GitHub Pages under a subpath).
function url(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return base.replace(/\/$/, '') + path;
}

export function loadManifest(): Promise<Template[]> {
  if (!manifestPromise) {
    manifestPromise = fetch(url('/templates/manifest.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      })
      .then((j: { templates: Template[] }) => j.templates);
  }
  return manifestPromise;
}

export async function loadSvg(tpl: Template): Promise<string | null> {
  if (!tpl.file) return null;
  const cached = svgCache.get(tpl.file);
  if (cached) return cached;
  const text = await fetch(url(`/templates/${tpl.file}`)).then((r) => {
    if (!r.ok) throw new Error(`template ${tpl.file} ${r.status}`);
    return r.text();
  });
  svgCache.set(tpl.file, text);
  return text;
}

// Strip near-white pixels to transparent and force the rest to black so only
// the line art remains on the template layer. Used by both the SVG template
// pipeline and the AI-generated PNG pipeline.
//
// Without this, opaque white pixels cover the user's paint layer underneath —
// the kid taps fill or paints inside the shape and sees nothing happen,
// because the white is on top.
//
// Anti-aliased line edges (greyscale) keep their darkness proportional to how
// dark they were, with alpha proportional to (1 - lightness). That preserves
// smooth edges while killing the fills.
function processLineArt(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (a === 0) continue;
    // Lightness 0..255. Pure white = 255, pure black = 0.
    const light = (r + g + b) / 3;
    // Map: light >= 240 → fully transparent (was white interior fill).
    //      light <= 64  → keep fully opaque (the line itself).
    //      in between   → linearly fade alpha so edge anti-aliasing
    //                     remains smooth.
    let newAlpha: number;
    if (light >= 240) newAlpha = 0;
    else if (light <= 64) newAlpha = a;
    else newAlpha = Math.round(a * (1 - (light - 64) / (240 - 64)));
    // Force the visible color to black so the lines read crisply on any
    // background and so undo replays produce the same pixels.
    px[i] = 0;
    px[i + 1] = 0;
    px[i + 2] = 0;
    px[i + 3] = newAlpha;
  }
  ctx.putImageData(data, 0, 0);
}

// Letterbox a source image (any aspect ratio) into width×height while
// preserving its aspect ratio. Returns the destination box on the canvas.
// Centralizes the letterbox math so the SVG and PNG paths use the same logic.
function letterbox(srcW: number, srcH: number, dstW: number, dstH: number) {
  // Reserve a margin around the picture so it doesn't touch the canvas
  // edges. 6% on each side leaves room for the kid to color the
  // background and gives the picture visual breathing room.
  const margin = 0.06;
  const innerW = dstW * (1 - margin * 2);
  const innerH = dstH * (1 - margin * 2);
  const aspectImg = srcW / srcH;
  const aspectInner = innerW / innerH;
  let dw: number, dh: number;
  if (aspectImg > aspectInner) {
    dw = innerW;
    dh = innerW / aspectImg;
  } else {
    dh = innerH;
    dw = innerH * aspectImg;
  }
  return {
    dx: Math.round((dstW - dw) / 2),
    dy: Math.round((dstH - dh) / 2),
    dw: Math.round(dw),
    dh: Math.round(dh),
  };
}

export async function rasterizeTemplate(
  tpl: Template,
  width: number,
  height: number,
): Promise<ImageBitmap | null> {
  const svg = await loadSvg(tpl);
  if (!svg) return null; // blank
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objUrl;
    await img.decode();
    // Letterbox the SVG into the canvas while preserving aspect ratio. Many
    // openclipart files have arbitrary viewBoxes (square / portrait /
    // landscape); stretching them to 1200x800 distorts the artwork.
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get template 2D context');

    const box = letterbox(img.naturalWidth, img.naturalHeight, width, height);
    ctx.drawImage(img, box.dx, box.dy, box.dw, box.dh);
    processLineArt(ctx, width, height);
    return await createImageBitmap(tmp);
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

// Same letterbox + line-art post-process as rasterizeTemplate, but the source
// is an already-decoded ImageBitmap (e.g. an AI-generated PNG). The bitmap is
// drawn through `getImageData`, so the source canvas must not be tainted —
// see the AI client for the CORS-mode handling.
export async function rasterizeImageBitmap(
  src: ImageBitmap,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get template 2D context');
  const box = letterbox(src.width, src.height, width, height);
  ctx.drawImage(src, box.dx, box.dy, box.dw, box.dh);
  processLineArt(ctx, width, height);
  return await createImageBitmap(tmp);
}

export function thumbnailUrl(tpl: Template): string | null {
  return tpl.file ? url(`/templates/${tpl.file}`) : null;
}
