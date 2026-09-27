// Production-grade Web Audio API Synthesizer for Quran Competition Warning Bells
// Recreates authentic bronze/brass competition bells with realistic strike and harmonic decay

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Single resonant bell chime strike
function playBellStrike(ctx: AudioContext, time: number, freq = 680, gainMultiplier = 1.0) {
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.001, time);
  masterGain.gain.exponentialRampToValueAtTime(0.7 * gainMultiplier, time + 0.008);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);

  // Fundamental oscillator
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, time);

  // Partial 1 (metallic overtone)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 1.98, time);
  gain2.gain.setValueAtTime(0.35, time);
  gain2.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);

  // Partial 2 (high harmonic shimmer)
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 3.02, time);
  gain3.gain.setValueAtTime(0.18, time);
  gain3.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);

  osc1.connect(masterGain);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc3.connect(gain3);
  gain3.connect(masterGain);

  osc1.start(time);
  osc2.start(time);
  osc3.start(time);

  osc1.stop(time + 2.5);
  osc2.stop(time + 2.5);
  osc3.stop(time + 2.5);
}

export function playCompetitionBell(type: 'FIRST_WARNING' | 'FINAL_WARNING' | 'STOP') {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === 'FIRST_WARNING') {
      // 1 strike
      playBellStrike(ctx, now, 660, 1.0);
    } else if (type === 'FINAL_WARNING') {
      // 2 strikes
      playBellStrike(ctx, now, 660, 0.9);
      playBellStrike(ctx, now + 0.38, 740, 1.0);
    } else if (type === 'STOP') {
      // 3 strikes (urgent stop signal)
      playBellStrike(ctx, now, 620, 0.9);
      playBellStrike(ctx, now + 0.35, 620, 0.9);
      playBellStrike(ctx, now + 0.72, 780, 1.1);
    }
  } catch (err) {
    console.warn('Audio play error (user interaction might be required):', err);
  }
}
