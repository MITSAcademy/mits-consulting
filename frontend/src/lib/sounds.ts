// Opt-in sound feedback using Web Audio API (no audio files needed).
// Toggle stored in localStorage under 'mits_sounds'.
// All sounds are synthesized — no external files.

const PREF_KEY = 'mits_sounds';

export function isSoundEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}
export function setSoundEnabled(v: boolean) {
  localStorage.setItem(PREF_KEY, v ? 'on' : 'off');
}

let sharedCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!sharedCtx) {
      sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (sharedCtx.state === 'suspended') {
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch { return null; }
}

function play(fn: (ac: AudioContext) => void) {
  if (!isSoundEnabled()) return;
  const ac = ctx();
  if (!ac) return;
  try { fn(ac); } catch {}
}

// Soft "tick" — for coin taps in the idle game
export function playTick() {
  play((ac) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.10);
    o.start(); o.stop(ac.currentTime + 0.12);
  });
}

// Warm "chime" — for payment recorded / sale won
export function playChime() {
  play((ac) => {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      const t = ac.currentTime + i * 0.08;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.start(t); o.stop(t + 0.55);
    });
  });
}

// Gentle "pop" — for positive micro-interactions (toast success)
export function playPop() {
  play((ac) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(600, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.05);
    g.gain.setValueAtTime(0.10, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    o.start(); o.stop(ac.currentTime + 0.14);
  });
}

// Soft "error" tone — for error toasts
export function playError() {
  play((ac) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(150, ac.currentTime + 0.15);
    g.gain.setValueAtTime(0.06, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    o.start(); o.stop(ac.currentTime + 0.20);
  });
}
