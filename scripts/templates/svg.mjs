// Tiny SVG toolkit for generated coloring pages. One fixed line style for
// every picture: bold black round strokes, no fills, 1200x800 canvas. The
// app letterboxes pages to 88 %, so 9 units render at about 8 px.

const n = (v) => Math.round(v * 10) / 10;

export function page(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
<g fill="none" stroke="#000" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
${body}
</g>
</svg>
`;
}

// Picture pages: every closed shape is painted white, so a shape listed
// later covers the lines of the shapes behind it (a leg behind the body, an
// ear over the head). The app strips white when it loads a template, so the
// fill never shows; it only hides the overlapping lines and the sliver areas
// they would create. Open paths, lines and black dots are left alone.
export function solidPage(body) {
  const solid = body
    .replace(/<(circle|ellipse|rect)(?![^>]*\bfill=)/g, '<$1 fill="#fff"')
    .replace(/<path d="([^"]*Z)"\/>/g, '<path d="$1" fill="#fff"/>');
  return page(solid);
}

export const circle = (cx, cy, r) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
export const ellipse = (cx, cy, rx, ry) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"/>`;
export const rect = (x, y, w, h, r = 0) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r ? ` rx="${n(r)}"` : ''}/>`;
export const line = (x1, y1, x2, y2) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`;
export const path = (d) => `<path d="${d}"/>`;
export const poly = (points, closed = true) =>
  `<path d="M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}${closed ? ' Z' : ''}"/>`;
// Solid black dot (eyes, noses, connect-the-dots points). Filled so it never
// becomes a tiny unfillable ring.
export const dot = (cx, cy, r) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#000" stroke="none"/>`;
export const dashed = (d, dash = 22, gap = 18) => `<path d="${d}" stroke-dasharray="${dash} ${gap}"/>`;
export const digit = (x, y, text, size = 34) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" fill="#000" stroke="none" text-anchor="middle">${text}</text>`;
export const group = (transform, ...parts) => `<g transform="${transform}">${parts.join('')}</g>`;
