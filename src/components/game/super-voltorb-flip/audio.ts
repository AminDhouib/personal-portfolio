let ctx: AudioContext | null = null;
let music: HTMLAudioElement | null = null;
let gameOverAudio: HTMLAudioElement | null = null;
let globalMuted = false;

function ensureCtx() {
  if (!ctx && typeof window !== "undefined")
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

function beep(freq: number, dur = 0.09, type: OscillatorType = "square", gain = 0.04) {
  if (globalMuted) return;
  const c = ensureCtx();
  if (!c) return;
  c.resume();
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
  // Money earned — pattern scales with the tile's coin multiplier.
  // x2 = 2-note chime, x3 = 4-note triumphant arpeggio.
  coin: (value: number = 2) => {
    if (value >= 3) {
      beep(1047, 0.06, "triangle", 0.05);
      setTimeout(() => beep(1319, 0.06, "triangle", 0.05), 55);
      setTimeout(() => beep(1568, 0.06, "triangle", 0.05), 110);
      setTimeout(() => beep(2093, 0.16, "triangle", 0.055), 165);
    } else {
      beep(988, 0.07, "square", 0.045);
      setTimeout(() => beep(1319, 0.1, "square", 0.045), 60);
    }
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => beep(f, 0.15, "triangle"), i * 90),
    );
  },
  lose: () => {
    if (globalMuted) return;
    const c = ensureCtx();
    if (!c) return;
    c.resume();
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
  music.muted = globalMuted;
  music.play().catch(() => {});
}

export function stopMusic() {
  music?.pause();
  music = null;
}

export function fadeOutMusic(ms = 400) {
  if (!music) return;
  const m = music;
  music = null;
  const startVol = m.volume;
  const startTime = performance.now();
  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / ms);
    m.volume = Math.max(0, startVol * (1 - t));
    if (t < 1) requestAnimationFrame(tick);
    else m.pause();
  };
  requestAnimationFrame(tick);
}

export function playGameOver() {
  if (typeof window === "undefined") return;
  gameOverAudio?.pause();
  gameOverAudio = new Audio("/games/super-voltorb-flip/audio/game_over.mp3");
  gameOverAudio.volume = 0.5;
  gameOverAudio.muted = globalMuted;
  gameOverAudio.play().catch(() => {});
}

export function stopGameOver() {
  gameOverAudio?.pause();
  gameOverAudio = null;
}

export function setMusicMuted(muted: boolean) {
  globalMuted = muted;
  if (music) music.muted = muted;
  if (gameOverAudio) gameOverAudio.muted = muted;
}
