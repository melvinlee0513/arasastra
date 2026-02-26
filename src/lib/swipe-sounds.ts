/**
 * Audio feedback for flashcard swipe interactions.
 * Uses Web Audio API to generate a short swoosh sound — no external files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

/** Play a short satisfying swoosh/click when a card is swiped away */
export function playSwoosh(direction: "left" | "right") {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Right (Got It) = upward pitch, Left (Review) = downward pitch
    const baseFreq = direction === "right" ? 600 : 300;
    const endFreq = direction === "right" ? 900 : 200;

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio not available — silent fallback
  }
}
