import { describe, expect, it } from 'vitest';
import { StickyFullscreen } from './fullscreen';

describe('StickyFullscreen', () => {
  it('does nothing until fullscreen was entered once', () => {
    const s = new StickyFullscreen();
    s.lost();
    expect(s.shouldReenter()).toBe(false);
  });

  it('re-enters after an accidental exit, once', () => {
    const s = new StickyFullscreen();
    s.entered();
    s.lost();
    expect(s.shouldReenter()).toBe(true);
    s.reentered();
    expect(s.shouldReenter()).toBe(false);
  });

  it('does not re-enter after the parent exits on purpose', () => {
    const s = new StickyFullscreen();
    s.entered();
    s.exitedByParent();
    s.lost();
    expect(s.shouldReenter()).toBe(false);
  });
});
