// Fullscreen helpers with the webkit-prefixed fallbacks iPad Safari needs,
// plus "sticky" fullscreen: if fullscreen drops by accident (a swipe, the
// OS), the next tap on the page goes back in. Browsers only allow entering
// fullscreen inside a user gesture, so it can't happen without that tap.

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function enterFullscreen(): void {
  const el = document.documentElement as FsEl;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) void el.webkitRequestFullscreen();
}

export function exitFullscreen(): void {
  const d = document as FsDoc;
  if (d.exitFullscreen && d.fullscreenElement) d.exitFullscreen().catch(() => {});
  else if (d.webkitExitFullscreen) void d.webkitExitFullscreen();
}

export function onFullscreenChange(fn: () => void): void {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}

// Installed to the home screen: the OS already gives a chromeless window
// and the Fullscreen API does nothing useful there.
export function isInstalledApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches
  );
}

export class StickyFullscreen {
  private wanted = false;
  private pending = false;

  entered() { this.wanted = true; this.pending = false; }
  exitedByParent() { this.wanted = false; this.pending = false; }
  lost() { if (this.wanted) this.pending = true; }
  shouldReenter(): boolean { return this.wanted && this.pending; }
  reentered() { this.pending = false; }
}

export const sticky = new StickyFullscreen();

export function initStickyFullscreen(): void {
  onFullscreenChange(() => {
    if (isFullscreen()) sticky.entered();
    else sticky.lost();
  });
  // Capture phase so the re-entry request runs inside the same user gesture
  // even if the canvas handler calls preventDefault.
  document.addEventListener(
    'pointerdown',
    () => {
      if (!sticky.shouldReenter()) return;
      sticky.reentered();
      enterFullscreen();
    },
    { capture: true },
  );
}

// Keep the screen on while the app is visible. Not all browsers support it
// and it can be refused (battery saver); both cases are fine.
export function keepScreenAwake(): void {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<unknown> } };
  if (!nav.wakeLock) return;
  const request = () => { nav.wakeLock!.request('screen').catch(() => {}); };
  request();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') request();
  });
}
