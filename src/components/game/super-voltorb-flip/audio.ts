let ctx: AudioContext | null = null;
let music: HTMLAudioElement | null = null;

function ensureCtx() {
  if (!ctx && typeof window !== "undefined")
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

function beep(freq: number, dur = 0.09, type: OscillatorType = "square", gain = 0.04) {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
}

export const sfx = {
  click: () => beep(740, 0.05, "square"),
  coin: () => {
    beep(988, 0.08);
    setTimeout(() => beep(1319, 0.1), 60);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => beep(f, 0.15, "triangle"), i * 90),
    );
  },
  lose: () => {
    const c = ensureCtx();
    if (!c) return;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start();
  },
};

export function playMusic() {
  if (music) return;
  music = new Audio("/games/super-voltorb-flip/audio/music_loop.mp3");
  music.loop = true;
  music.volume = 0.3;
  music.play().catch(() => {});
}

export function stopMusic() {
  music?.pause();
  music = null;
}

export function setMusicMuted(muted: boolean) {
  if (music) music.muted = muted;
}
