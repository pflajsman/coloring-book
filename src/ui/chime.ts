// Gentle "time's up" melody: a music-box arpeggio synthesized with Web
// Audio, so there is no sound file to ship or cache.
//
// iPad Safari only lets audio start inside a user gesture, so the timer's
// Start button calls unlockAudio(); the alarm later reuses that context.
// The ring/silent switch still mutes Web Audio on iOS.

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;
let playing: AudioScheduledSourceNode[] = [];

export function unlockAudio() {
  try {
    if (!ctx) {
      const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!C) return;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio: the bubble still shows */
  }
}

// C major arpeggio up and back down, then the high C.
const NOTES = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
const NOTE_GAP = 0.18;
const ROUNDS = 3;
const ROUND_GAP = 1.6;

export function playChime() {
  unlockAudio();
  if (!ctx) return;
  stopChime();
  const t0 = ctx.currentTime + 0.05;
  for (let r = 0; r < ROUNDS; r++) {
    NOTES.forEach((f, i) => bell(ctx!, f, t0 + r * ROUND_GAP + i * NOTE_GAP, i === NOTES.length - 1 ? 1.4 : 0.7));
  }
}

export function stopChime() {
  for (const n of playing) {
    try { n.stop(); } catch { /* already stopped */ }
  }
  playing = [];
}

// One soft bell note: a sine with a quiet octave overtone, quick attack and
// a long exponential fade.
function bell(ac: AudioContext, freq: number, at: number, length: number) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  gain.connect(ac.destination);
  for (const [mult, level] of [[1, 1], [2, 0.25]] as const) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const g = ac.createGain();
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(at);
    osc.stop(at + length + 0.05);
    osc.onended = () => { playing = playing.filter((n) => n !== osc); };
    playing.push(osc);
  }
}
