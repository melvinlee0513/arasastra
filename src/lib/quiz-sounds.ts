// Web Audio API sound effects for the quiz
const audioCtx = typeof window !== "undefined" ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function ensureCtx() {
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15, delay = 0) {
  if (!audioCtx) return;
  ensureCtx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startTime = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playChord(freqs: number[], duration: number, type: OscillatorType = "sine", volume = 0.08) {
  freqs.forEach((f) => playTone(f, duration, type, volume));
}

// --- Sound themes ---
export type SoundTheme = "arcade" | "chill" | "retro";

let currentTheme: SoundTheme = "arcade";
export function setSoundTheme(theme: SoundTheme) { currentTheme = theme; }
export function getSoundTheme(): SoundTheme { return currentTheme; }

export function playCorrect() {
  if (currentTheme === "retro") {
    playTone(660, 0.08, "square", 0.1);
    playTone(880, 0.12, "square", 0.1, 0.08);
    playTone(1320, 0.18, "square", 0.12, 0.16);
  } else if (currentTheme === "chill") {
    playChord([523, 659, 784], 0.3, "sine", 0.06);
  } else {
    playTone(523, 0.1, "sine", 0.15);
    playTone(659, 0.1, "sine", 0.15, 0.1);
    playTone(784, 0.15, "sine", 0.15, 0.2);
    playTone(1047, 0.2, "sine", 0.12, 0.3);
  }
}

export function playWrong() {
  if (currentTheme === "retro") {
    playTone(220, 0.15, "square", 0.08);
    playTone(165, 0.25, "square", 0.06, 0.15);
  } else if (currentTheme === "chill") {
    playTone(220, 0.3, "triangle", 0.08);
  } else {
    playTone(200, 0.15, "sawtooth", 0.1);
    playTone(150, 0.3, "sawtooth", 0.08, 0.15);
  }
}

export function playCountdownTick() {
  playTone(800, 0.06, currentTheme === "retro" ? "square" : "sine", 0.06);
}

export function playTimeWarning() {
  playTone(440, 0.08, "square", 0.06);
  playTone(440, 0.08, "square", 0.06, 0.15);
  playTone(440, 0.08, "square", 0.06, 0.3);
}

export function playPowerUp() {
  const type: OscillatorType = currentTheme === "retro" ? "square" : "sine";
  [400, 533, 666, 800, 1066].forEach((f, i) => playTone(f, 0.08, type, 0.1, i * 0.05));
}

export function playGameStart() {
  const type: OscillatorType = currentTheme === "retro" ? "square" : "sine";
  [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.12, type, 0.12, i * 0.12));
}

export function playResults() {
  [523, 587, 659, 784, 880, 1047].forEach((f, i) => playTone(f, 0.18, "sine", 0.1, i * 0.1));
}

export function playStreak() {
  [784, 988, 1175].forEach((f, i) => playTone(f, 0.1, "sine", 0.1, i * 0.06));
}

export function playCombo() {
  playChord([523, 659, 784, 1047], 0.4, "sine", 0.06);
}

export function playTickTock() {
  playTone(600, 0.04, "triangle", 0.04);
}
