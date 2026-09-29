// Dock tool icons, "tool + its mark" style: a chunky flat tool with a thick
// outline plus the line or shape it makes, drawn in the current paint
// colour, so a child learns "this one makes that". Glitter and Rainbow have
// their own colours and ignore the paint colour.

export type DockTool =
  | 'pen' | 'brush' | 'rainbow' | 'fill' | 'eraser' | 'line'
  | 'circle' | 'rect' | 'spray' | 'glitter' | 'stamp' | 'blur';

const K = '#2a2a3a';
const LIGHT_MARK = '#c9ced6';

// White or pale paint would vanish on the white dock button; show those
// marks in light grey instead (relative luminance above 0.85).
export function markColor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.85 ? LIGHT_MARK : color;
}

function rainbowGradient(id: string): string {
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#ff4d4d"/><stop offset=".2" stop-color="#ff9f1c"/><stop offset=".4" stop-color="#ffe14d"/><stop offset=".6" stop-color="#4cd964"/><stop offset=".8" stop-color="#3fa9ff"/><stop offset="1" stop-color="#a45cff"/></linearGradient></defs>`;
}

const DRAW: Record<DockTool, (c: string, uid: string) => string> = {
  pen: (c) => `<path d="M8 56 C 18 46, 26 58, 36 50" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <g transform="rotate(45 38 26)"><rect x="32" y="4" width="12" height="34" rx="2" fill="#ffd23f" stroke="${K}" stroke-width="3"/>
    <rect x="32" y="4" width="12" height="7" rx="2" fill="#ff8fab" stroke="${K}" stroke-width="3"/>
    <path d="M32 38 L38 50 L44 38 Z" fill="#f6d7a7" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 46 L38 50 L40 46 Z" fill="${c}"/></g>`,
  brush: (c) => `<path d="M6 54 C 16 42, 26 60, 38 50" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" opacity=".9"/>
    <g transform="rotate(45 40 24)"><rect x="35" y="0" width="10" height="26" rx="4" fill="#d97a3a" stroke="${K}" stroke-width="3"/>
    <rect x="33" y="26" width="14" height="7" fill="#c9ced6" stroke="${K}" stroke-width="3"/>
    <path d="M33 33 Q 33 46 40 50 Q 47 46 47 33 Z" fill="${c}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></g>`,
  rainbow: (_c, uid) => {
    const id = `rb-${uid}`;
    return `${rainbowGradient(id)}<path d="M6 54 C 16 40, 28 62, 40 48" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linecap="round"/>
    <g transform="rotate(45 40 24)"><rect x="35" y="0" width="10" height="26" rx="4" fill="#a45cff" stroke="${K}" stroke-width="3"/>
    <rect x="33" y="26" width="14" height="7" fill="#ffd23f" stroke="${K}" stroke-width="3"/>
    <path d="M33 33 Q 33 46 40 50 Q 47 46 47 33 Z" fill="url(#${id})" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></g>
    <path d="M50 6 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#ffd23f" stroke="${K}" stroke-width="1.5"/>`;
  },
  fill: (c) => `<path d="M10 22 L30 8 L48 30 L28 44 Z" fill="#8fd3ff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 22 Q 20 32 30 30 L48 30" fill="none" stroke="${K}" stroke-width="3"/>
    <path d="M44 32 Q 54 40 52 50" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="44" cy="56" rx="16" ry="5" fill="${c}" stroke="${K}" stroke-width="3"/>`,
  eraser: (c) => `<path d="M8 50 L 46 50" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 10" opacity=".7"/>
    <g transform="rotate(-30 36 30)"><rect x="18" y="20" width="36" height="20" rx="4" fill="#ff8fab" stroke="${K}" stroke-width="3"/>
    <rect x="18" y="20" width="14" height="20" rx="4" fill="#ffffff" stroke="${K}" stroke-width="3"/></g>`,
  line: (c) => `<line x1="8" y1="54" x2="56" y2="42" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
    <g transform="rotate(-14 32 24)"><rect x="4" y="16" width="56" height="16" rx="3" fill="#ffd23f" stroke="${K}" stroke-width="3"/>
    <path d="M14 16v6 M24 16v9 M34 16v6 M44 16v9 M54 16v6" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/></g>`,
  circle: (c) => `<circle cx="32" cy="32" r="21" fill="none" stroke="${c}" stroke-width="7"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="${K}" stroke-width="2" opacity=".35"/>
    <circle cx="47" cy="17" r="6" fill="#fff" stroke="${K}" stroke-width="3"/>`,
  rect: (c) => `<rect x="11" y="11" width="42" height="42" rx="5" fill="none" stroke="${c}" stroke-width="7"/>
    <rect x="11" y="11" width="42" height="42" rx="5" fill="none" stroke="${K}" stroke-width="2" opacity=".35"/>
    <circle cx="53" cy="53" r="6" fill="#fff" stroke="${K}" stroke-width="3"/>`,
  spray: (c) => `<rect x="30" y="22" width="24" height="36" rx="6" fill="#c9ced6" stroke="${K}" stroke-width="3"/>
    <rect x="30" y="32" width="24" height="12" fill="${c}" stroke="${K}" stroke-width="3"/>
    <rect x="36" y="12" width="12" height="10" rx="2" fill="#fff" stroke="${K}" stroke-width="3"/>
    <g fill="${c}"><circle cx="24" cy="14" r="2.6"/><circle cx="16" cy="10" r="2"/><circle cx="18" cy="20" r="2.6"/><circle cx="9" cy="16" r="2"/><circle cx="11" cy="26" r="2.4"/><circle cx="22" cy="27" r="1.8"/><circle cx="6" cy="8" r="1.6"/></g>`,
  glitter: () => `<line x1="12" y1="54" x2="36" y2="30" stroke="${K}" stroke-width="9" stroke-linecap="round"/>
    <line x1="12" y1="54" x2="36" y2="30" stroke="#a45cff" stroke-width="4" stroke-linecap="round"/>
    <path d="M40 8 l5 11 12 2 -9 8 2 12 -10 -6 -10 6 2 -12 -9 -8 12 -2z" fill="#ffd23f" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M12 16 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" fill="#ff5fa2"/>
    <path d="M56 46 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" fill="#3fa9ff"/>`,
  stamp: (c) => `<path d="M32 60 C 12 48, 10 36, 20 32 C 26 30, 30 34, 32 37 C 34 34, 38 30, 44 32 C 54 36, 52 48, 32 60 Z" fill="${c}" opacity=".85"/>
    <circle cx="32" cy="10" r="7" fill="#d97a3a" stroke="${K}" stroke-width="3"/>
    <rect x="28" y="16" width="8" height="10" fill="#d97a3a" stroke="${K}" stroke-width="3"/>
    <rect x="14" y="26" width="36" height="8" rx="3" fill="#c9ced6" stroke="${K}" stroke-width="3"/>`,
  blur: (c) => `<path d="M6 44 C 20 36, 30 52, 50 44" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" opacity=".35"/>
    <path d="M6 44 C 14 40, 20 44, 24 45" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
    <path d="M26 42 L26 14 Q26 8 31 8 Q36 8 36 14 L36 30 L44 30 Q50 30 50 36 L50 44 Q50 54 40 54 L32 54 Q26 54 26 48 Z" fill="#ffd9b8" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 30v6 M43 31v5" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`,
};

export function toolIconSvg(tool: DockTool, color: string, uid: string): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${DRAW[tool](markColor(color), uid)}</svg>`;
}
