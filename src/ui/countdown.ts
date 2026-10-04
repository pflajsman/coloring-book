// Countdown for the top-bar timer. Keeps an absolute end time instead of
// counting ticks, so a throttled background tab or a sleeping iPad still
// finishes on time (the alarm fires on the first tick after waking).

// Minute choices offered by the -/+ buttons.
export const TIMER_STEPS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

export function stepMinutes(current: number, dir: 1 | -1): number {
  const i = TIMER_STEPS.indexOf(current);
  if (i === -1) return TIMER_STEPS[0];
  return TIMER_STEPS[Math.max(0, Math.min(TIMER_STEPS.length - 1, i + dir))];
}

// "m:ss", rounded up so the display shows 0:01 until the very end and
// never reads 0:00 while still running.
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class Countdown {
  private endsAt: number | null = null;

  constructor(private now: () => number = () => Date.now()) {}

  start(minutes: number) {
    this.endsAt = this.now() + minutes * 60_000;
  }

  clear() {
    this.endsAt = null;
  }

  get running(): boolean {
    return this.endsAt !== null;
  }

  remaining(): number {
    return this.endsAt === null ? 0 : Math.max(0, this.endsAt - this.now());
  }

  // True exactly once, on the first check at or after the end time; the
  // countdown then stops.
  finished(): boolean {
    if (this.endsAt === null || this.now() < this.endsAt) return false;
    this.endsAt = null;
    return true;
  }
}
