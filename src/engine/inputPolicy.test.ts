import { describe, expect, it } from 'vitest';
import { strokeStartAction, toolAfterColorPick } from './inputPolicy';

describe('strokeStartAction', () => {
  it('ignores every press while the saved drawing is still loading', () => {
    // Anything drawn now would be replaced by the restored drawing.
    expect(strokeStartAction({ tool: 'brush', booting: true, fillsPending: 0 })).toBe('ignore');
    expect(strokeStartAction({ tool: 'fill', booting: true, fillsPending: 0 })).toBe('ignore');
  });

  it('fills on a fill tap, draws otherwise', () => {
    expect(strokeStartAction({ tool: 'fill', booting: false, fillsPending: 0 })).toBe('fill');
    expect(strokeStartAction({ tool: 'rainbow', booting: false, fillsPending: 0 })).toBe('stroke');
  });

  it('ignores strokes while a fill is pending, and the pan tool', () => {
    expect(strokeStartAction({ tool: 'brush', booting: false, fillsPending: 1 })).toBe('ignore');
    expect(strokeStartAction({ tool: 'pan', booting: false, fillsPending: 0 })).toBe('ignore');
  });
});

describe('toolAfterColorPick', () => {
  it('switches tools that ignore the paint colour to the brush', () => {
    expect(toolAfterColorPick('eraser')).toBe('brush');
    expect(toolAfterColorPick('rainbow')).toBe('brush');
  });

  it('keeps colour tools as they are', () => {
    expect(toolAfterColorPick('fill')).toBe('fill');
    expect(toolAfterColorPick('pen')).toBe('pen');
  });
});
