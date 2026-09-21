let context = null;

function audioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context) context = new AudioContext();
  return context;
}

function note(ctx, frequency, when, duration, peak, type = 'sine') {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.02);
}

export async function playNotificationSound() {
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const now = ctx.currentTime + 0.018;
    // A short, restrained two-note chime designed for repeated finance alerts.
    note(ctx, 659.25, now, 0.18, 0.055, 'sine');
    note(ctx, 987.77, now + 0.105, 0.24, 0.045, 'sine');
    note(ctx, 493.88, now + 0.02, 0.16, 0.018, 'triangle');
    return true;
  } catch {
    return false;
  }
}

export function armNotificationSound() {
  if (typeof window === 'undefined') return () => {};
  const prime = () => { playNotificationSound().then(() => {}).catch(() => {}); };
  // Prime the browser audio context on the first user gesture. The prime itself is
  // intentionally very quiet/short and subsequent alerts can then play reliably.
  const silentPrime = async () => {
    const ctx = audioContext();
    try { if (ctx?.state === 'suspended') await ctx.resume(); } catch {}
    window.removeEventListener('pointerdown', silentPrime, true);
    window.removeEventListener('keydown', silentPrime, true);
  };
  window.addEventListener('pointerdown', silentPrime, true);
  window.addEventListener('keydown', silentPrime, true);
  return () => {
    window.removeEventListener('pointerdown', silentPrime, true);
    window.removeEventListener('keydown', silentPrime, true);
  };
}
