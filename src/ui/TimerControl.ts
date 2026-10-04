import { attachTooltip } from './Tooltip';
import { playChime, stopChime, unlockAudio } from './chime';
import { Countdown, formatRemaining, stepMinutes } from './countdown';
import { requestScreenAwake } from './fullscreen';

// Top-bar timer: a round button that opens a small panel with minutes,
// Start and Clear. While running, the button shows the time left; at zero a
// chime rings and a "Time's up!" bubble appears until someone taps it.

const DEFAULT_MINUTES = 10;

export function buildTimerControl(): HTMLElement {
  const countdown = new Countdown();
  let minutes = DEFAULT_MINUTES;
  let tick: ReturnType<typeof setInterval> | null = null;

  const btn = document.createElement('button');
  btn.className = 'kid-iconbtn kid-timer';
  btn.setAttribute('aria-label', 'Timer');
  btn.setAttribute('aria-haspopup', 'dialog');
  attachTooltip(btn, 'Timer');

  // ---- Panel ----
  const panel = document.createElement('div');
  panel.className = 'kid-timer-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Timer');
  panel.hidden = true;

  const minus = roundBtn('−', 'Fewer minutes');
  const plus = roundBtn('+', 'More minutes');
  const value = document.createElement('div');
  value.className = 'kid-timer-value';
  const stepper = document.createElement('div');
  stepper.className = 'kid-timer-stepper';
  stepper.append(minus, value, plus);

  const startBtn = document.createElement('button');
  startBtn.className = 'kid-timer-action kid-timer-start';
  startBtn.textContent = 'Start';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'kid-timer-action kid-timer-clear';
  clearBtn.textContent = 'Clear';
  const actions = document.createElement('div');
  actions.className = 'kid-timer-actions';
  actions.append(startBtn, clearBtn);

  panel.append(stepper, actions);

  // ---- Time's up bubble ----
  const bubble = document.createElement('div');
  bubble.className = 'kid-timer-done';
  bubble.hidden = true;
  bubble.innerHTML = `<div class="kid-timer-done-card">${alarmSvg()}<div>Time's up!</div></div>`;

  const render = () => {
    value.textContent = `${minutes} min`;
    minus.disabled = stepMinutes(minutes, -1) === minutes;
    plus.disabled = stepMinutes(minutes, 1) === minutes;
    clearBtn.disabled = !countdown.running;
    btn.classList.toggle('running', countdown.running);
    if (countdown.running) {
      const left = formatRemaining(countdown.remaining());
      btn.innerHTML = `<span class="kid-timer-left">${left}</span>`;
      btn.setAttribute('aria-label', `Timer, ${left} left`);
    } else {
      btn.innerHTML = clockSvg();
      btn.setAttribute('aria-label', 'Timer');
    }
  };

  const stopTicking = () => {
    if (tick !== null) clearInterval(tick);
    tick = null;
  };

  const onTick = () => {
    if (countdown.finished()) {
      stopTicking();
      render();
      showDone();
      return;
    }
    render();
  };

  const showDone = () => {
    bubble.hidden = false;
    playChime();
  };

  const hideDone = () => {
    bubble.hidden = true;
    stopChime();
  };

  const openPanel = () => {
    const r = btn.getBoundingClientRect();
    panel.style.top = `${Math.round(r.bottom + 10)}px`;
    // Right-align under the button but keep the panel on screen.
    panel.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    panel.hidden = false;
  };
  const closePanel = () => {
    panel.hidden = true;
  };

  btn.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  minus.addEventListener('click', () => {
    minutes = stepMinutes(minutes, -1);
    render();
  });
  plus.addEventListener('click', () => {
    minutes = stepMinutes(minutes, 1);
    render();
  });
  startBtn.addEventListener('click', () => {
    // Stop an old alarm first: pausing after unlockAudio() would abort its
    // muted play and leave the sound locked on iPad.
    hideDone();
    // Inside the tap, so iPad Safari allows the alarm to sound later and
    // keeps the screen on until then.
    unlockAudio();
    requestScreenAwake();
    countdown.start(minutes);
    stopTicking();
    tick = setInterval(onTick, 250);
    closePanel();
    render();
  });
  clearBtn.addEventListener('click', () => {
    countdown.clear();
    stopTicking();
    closePanel();
    render();
  });
  bubble.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hideDone();
  });
  // Tapping anywhere outside closes the panel.
  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden) return;
    const t = e.target as Node;
    if (!panel.contains(t) && !btn.contains(t)) closePanel();
  });
  window.addEventListener('resize', closePanel);
  // Waking the iPad: check straight away instead of waiting for a tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tick !== null) onTick();
  });

  render();
  document.body.append(panel, bubble);
  return btn;
}

function roundBtn(label: string, aria: string) {
  const b = document.createElement('button');
  b.className = 'kid-timer-step';
  b.textContent = label;
  b.setAttribute('aria-label', aria);
  return b;
}

function clockSvg() {
  return `<svg viewBox="0 0 64 64" fill="none" stroke="#2a2a3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="35" r="21" fill="#e8fbff"/>
    <path d="M32 23 L32 35 L41 40"/>
    <path d="M26 8 L38 8 M32 8 L32 14"/>
  </svg>`;
}

function alarmSvg() {
  return `<svg viewBox="0 0 64 64" fill="none" stroke="#2a2a3a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="35" r="20" fill="#fff176"/>
    <path d="M32 24 L32 35 L40 40"/>
    <path d="M10 18 Q 12 9 21 8" /><path d="M54 18 Q 52 9 43 8"/>
    <path d="M18 52 L13 58 M46 52 L51 58"/>
  </svg>`;
}
