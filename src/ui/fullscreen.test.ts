import { describe, expect, it } from 'vitest';
import { REENTER_EVENT, StickyFullscreen } from './fullscreen';

describe('StickyFullscreen', () => {
  it('does nothing until fullscreen was entered once', () => {
    const s = new StickyFullscreen();
    s.lost();
    expect(s.shouldReenter()).toBe(false);
  });

  it('keeps trying on every tap until fullscreen is actually entered again', () => {
    const s = new StickyFullscreen();
    s.entered();
    s.lost();
    let attempts = 0;
    const enter = () => { attempts++; }; // browser rejects: nothing changes
    s.tap(enter);
    s.tap(enter);
    expect(attempts).toBe(2);
    s.entered(); // fullscreenchange confirms we are back in
    s.tap(enter);
    expect(attempts).toBe(2);
  });

  it('re-enters on pointerup (touch user activation), not pointerdown', () => {
    expect(REENTER_EVENT).toBe('pointerup');
  });

  it('does not re-enter after the parent exits on purpose', () => {
    const s = new StickyFullscreen();
    s.entered();
    s.exitedByParent();
    s.lost();
    expect(s.shouldReenter()).toBe(false);
  });
});
