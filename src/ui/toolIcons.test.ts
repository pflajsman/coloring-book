import { describe, expect, it } from 'vitest';
import { markColor, toolIconSvg, type DockTool } from './toolIcons';

const ALL: DockTool[] = ['pen', 'brush', 'rainbow', 'fill', 'eraser', 'line', 'circle', 'rect', 'spray', 'glitter', 'stamp', 'blur'];

describe('toolIconSvg', () => {
  it('returns one svg per tool', () => {
    for (const t of ALL) {
      const svg = toolIconSvg(t, '#e74c3c', 'x');
      expect(svg.startsWith('<svg viewBox="0 0 64 64"')).toBe(true);
      expect(svg.trim().endsWith('</svg>')).toBe(true);
    }
  });

  it('tints the mark with the paint color', () => {
    for (const t of ALL.filter((t) => t !== 'rainbow' && t !== 'glitter')) {
      expect(toolIconSvg(t, '#3498db', 'x')).toContain('#3498db');
    }
  });

  it('rainbow and glitter ignore the paint color', () => {
    expect(toolIconSvg('rainbow', '#3498db', 'x')).not.toContain('#3498db');
    expect(toolIconSvg('glitter', '#3498db', 'x')).not.toContain('#3498db');
  });

  it('gradient ids are unique per uid', () => {
    const a = toolIconSvg('rainbow', '#000000', 'dock');
    const b = toolIconSvg('rainbow', '#000000', 'other');
    expect(a).toContain('id="rb-dock"');
    expect(a).toContain('url(#rb-dock)');
    expect(b).toContain('id="rb-other"');
  });
});

describe('markColor', () => {
  it('light colors fall back to grey marks, others pass through', () => {
    expect(markColor('#ffffff')).toBe('#c9ced6');
    expect(markColor('#fff176')).toBe('#c9ced6');
    expect(markColor('#e74c3c')).toBe('#e74c3c');
    expect(markColor('#000000')).toBe('#000000');
  });
});
