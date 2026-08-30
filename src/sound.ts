let ctx: AudioContext | null = null;
let muted = false;

function loadMuted(): boolean {
  try {
    return window.localStorage.getItem('solitaire-muted') === '1';
  } catch {
    return false;
  }
}

muted = loadMuted();

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
  return ctx;
}

function tone(
  freq: number,
  durMs: number,
  type: OscillatorType = 'sine',
  gain = 0.07,
  delayMs = 0
): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delayMs / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.05);
}

export function playDraw(): void {
  tone(520, 40, 'triangle', 0.05);
  tone(720, 30, 'triangle', 0.04, 35);
}

export function playPlace(): void {
  tone(240, 60, 'sine', 0.09);
}

const FOUNDATION_NOTES = [392, 494, 587, 784];

export function playFoundation(index = 0): void {
  const base = FOUNDATION_NOTES[index % FOUNDATION_NOTES.length];
  if (!Number.isFinite(base)) return;
  tone(base, 130, 'sine', 0.08);
  tone(base * 2, 90, 'sine', 0.04, 50);
}

export function playUndo(): void {
  tone(330, 50, 'triangle', 0.05);
  tone(250, 50, 'triangle', 0.05, 45);
}

export function playError(): void {
  tone(150, 110, 'square', 0.04);
}

export function playWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 200, 'sine', 0.08, i * 130));
  tone(1319, 350, 'sine', 0.06, 540);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
  try {
    window.localStorage.setItem('solitaire-muted', v ? '1' : '0');
  } catch {
    // ignore
  }
}
