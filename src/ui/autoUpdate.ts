import { registerSW } from 'virtual:pwa-register';

// New versions download in the background. An installed app on a tablet is
// rarely closed for real, so "apply on next launch" meant updates could wait
// for days. Instead the waiting version is applied as soon as the app goes
// to the background: the drawing is saved first, then the page reloads into
// the new version, and the autosave brings the drawing back. Never while
// visible (that would interrupt drawing) and never while the timer runs
// (the countdown would be lost).

const CHECK_EVERY_MS = 60 * 60 * 1000;

export type AutoUpdateDeps = {
  save: () => Promise<void>;
  busy: () => boolean;
};

export function setupAutoUpdate(deps: AutoUpdateDeps) {
  let waiting = false;
  let applying = false;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // The app is seldom reloaded, so ask for new versions on every return
      // to the foreground and once an hour.
      const check = () => { reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (!shouldApplyUpdate({ waiting, applying, hidden: document.visibilityState === 'hidden', busy: deps.busy() })) return;
    applying = true;
    void (async () => {
      try {
        await deps.save();
        // Activates the new service worker; the page reloads once it takes
        // control (possibly when the app is next shown, if iOS froze it).
        await updateSW(true);
      } catch {
        applying = false;
      }
    })();
  });
}

export function shouldApplyUpdate(s: { waiting: boolean; applying: boolean; hidden: boolean; busy: boolean }): boolean {
  return s.waiting && !s.applying && s.hidden && !s.busy;
}
