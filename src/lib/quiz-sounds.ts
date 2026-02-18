// Web Audio API sound effects for the quiz
const audioCtx = typeof window !== "undefined" ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playCorrect() {
  playTone(523, 0.12, "sine", 0.15);
  setTimeout(() => playTone(659, 0.12, "sine", 0.15), 100);
  setTimeout(() => playTone(784, 0.2, "sine", 0.15), 200);
}

export function playWrong() {
  playTone(200, 0.15, "sawtooth", 0.1);
  setTimeout(() => playTone(150, 0.3, "sawtooth", 0.08), 150);
}

export function playCountdownTick() {
  playTone(800, 0.08, "sine", 0.08);
}

export function playTimeWarning() {
  playTone(440, 0.1, "square", 0.06);
}

export function playPowerUp() {
  playTone(400, 0.08, "sine", 0.12);
  setTimeout(() => playTone(600, 0.08, "sine", 0.12), 80);
  setTimeout(() => playTone(800, 0.15, "sine", 0.12), 160);
}

export function playGameStart() {
  playTone(523, 0.1, "sine", 0.12);
  setTimeout(() => playTone(659, 0.1, "sine", 0.12), 120);
  setTimeout(() => playTone(784, 0.1, "sine", 0.12), 240);
  setTimeout(() => playTone(1047, 0.2, "sine", 0.15), 360);
}

export function playResults() {
  [523, 587, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, "sine", 0.12), i * 100);
  });
}
