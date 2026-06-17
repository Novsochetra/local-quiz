let enabled = true;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function initAudio() {
  // Ensure audio context is ready after user interaction
  getAudioContext();
}

export function setAudioEnabled(value) {
  enabled = value;
}

function playTone({ frequency = 440, type = 'sine', duration = 0.15, volume = 0.1 }) {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playChord(frequencies, duration = 0.3) {
  frequencies.forEach((freq, i) => {
    setTimeout(() => playTone({ frequency: freq, duration, volume: 0.08 }), i * 50);
  });
}

export function playSound(name) {
  if (!enabled) return;

  switch (name) {
    case 'join':
      playTone({ frequency: 880, duration: 0.2, type: 'sine' });
      break;
    case 'tick':
      playTone({ frequency: 600, duration: 0.08, type: 'square', volume: 0.05 });
      break;
    case 'correct':
      playChord([523.25, 659.25, 783.99], 0.3);
      break;
    case 'wrong':
      playTone({ frequency: 150, duration: 0.4, type: 'sawtooth', volume: 0.1 });
      break;
    case 'winner':
      playChord([523.25, 659.25, 783.99, 1046.5], 0.6);
      break;
    default:
      break;
  }
}
