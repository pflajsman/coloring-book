// "Time's up" alarm: a music-box arpeggio synthesized into a WAV once and
// played through an <audio> element, so there is no sound file to ship.
//
// Why not Web Audio: on iPad, Web Audio is muted by the silent switch / mute
// setting, and a context created at Start can be suspended by the time the
// alarm is due. An <audio> element plays as media (not muted by the silent
// switch) and, once it has played inside a tap, may play again later
// without one. The timer's Start button calls unlockAudio() for that.

const RATE = 22050;
// C major arpeggio up, then the high C held.
const NOTES = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
const NOTE_GAP = 0.18;
const ROUND_SECONDS = 2.4; // one melody plus a pause; the element loops it
const MAX_RING_MS = 60_000;

let audio: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function element(): HTMLAudioElement | null {
  if (audio) return audio;
  if (typeof Audio === 'undefined') return null;
  const url = URL.createObjectURL(new Blob([chimeWav()], { type: 'audio/wav' }));
  audio = new Audio(url);
  audio.preload = 'auto';
  audio.loop = true;
  return audio;
}

// Call inside a user tap. Plays the clip muted for a moment so iOS treats
// the element as user-started and lets the alarm play it later.
export function unlockAudio() {
  // Safari 16.4+: route page audio as media so the silent switch can't mute it.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) {
    try { session.type = 'playback'; } catch { /* read-only on some versions */ }
  }
  const el = element();
  if (!el || !el.paused) return;
  el.muted = true;
  el.play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.muted = false;
    })
    .catch(() => { el.muted = false; });
}

// Rings until stopChime() (a tap on the bubble) or for a minute at most.
export function playChime() {
  const el = element();
  if (!el) return;
  el.muted = false;
  el.currentTime = 0;
  el.play().catch(() => { /* blocked: the bubble still shows */ });
  (navigator as Navigator & { vibrate?: (p: number[]) => boolean }).vibrate?.([300, 150, 300, 150, 300]);
  if (stopTimer !== null) clearTimeout(stopTimer);
  stopTimer = setTimeout(stopChime, MAX_RING_MS);
}

export function stopChime() {
  if (stopTimer !== null) clearTimeout(stopTimer);
  stopTimer = null;
  if (audio && !audio.paused) audio.pause();
}

// One round of the melody as 16-bit mono PCM in a WAV container. Each note
// is a soft bell: a sine plus a quiet octave, quick attack, long decay.
export function chimeWav(): ArrayBuffer {
  const n = Math.round(ROUND_SECONDS * RATE);
  const pcm = new Float32Array(n);
  NOTES.forEach((f, i) => {
    const start = Math.round(i * NOTE_GAP * RATE);
    const len = (i === NOTES.length - 1 ? 1.4 : 0.7) * RATE;
    for (let k = 0; k < len && start + k < n; k++) {
      const t = k / RATE;
      const env = Math.min(1, k / (0.01 * RATE)) * Math.exp((-5 * k) / len);
      pcm[start + k] += env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
    }
  });
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    // 0.5 leaves headroom where overlapping notes add up.
    const s = Math.max(-1, Math.min(1, pcm[i] * 0.5));
    v.setInt16(44 + i * 2, s * 0x7fff, true);
  }
  return buf;
}
