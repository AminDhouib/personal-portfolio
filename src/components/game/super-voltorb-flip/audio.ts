let music: HTMLAudioElement | null = null;
let gameOverAudio: HTMLAudioElement | null = null;
let levelWinAudio: HTMLAudioElement | null = null;
let globalMuted = false;

// Authentic HG/SS Voltorb-Flip sound effects, rendered directly from the
// game's own gs_sound_data.sdat (pret/pokeheartgold). The SE constants used
// by src/voltorb_flip/voltorb_flip.c are mapped 1:1 here:
//   SEQ_SE_GS_PANERU_MEKURU    → tile-flip
//   SEQ_SE_GS_COIN_PAYOUT_ONE  → coin-payout-one
//   SEQ_SE_GS_COIN_PAYOUT_LAST → coin-payout-last
//   SEQ_SE_GS_COIN_HAZURE      → voltorb-pop
//   SEQ_SE_GS_OKOZUKAI         → level-clear
//   SEQ_SE_DP_SELECT           → memo-select
const SFX_PATH = "/games/super-voltorb-flip/sfx";

// Pool of preloaded Audio elements per file so rapid repeat clicks don't
// step on each other (each call clones from the template).
const sfxCache = new Map<string, HTMLAudioElement>();
function playSample(file: string, volume = 0.6): Promise<void> {
  // Resolves when the clone fires `ended` (or errors / safety-timeouts)
  // so gameplay code can `await sfx.foo()` when timing matters. Existing
  // fire-and-forget callers just ignore the returned promise.
  return new Promise((resolve) => {
    if (globalMuted || typeof window === "undefined") return resolve();
    let template = sfxCache.get(file);
    if (!template) {
      template = new Audio(`${SFX_PATH}/${file}`);
      template.preload = "auto";
      sfxCache.set(file, template);
    }
    // cloneNode lets the SFX overlap with itself on rapid input.
    const node = template.cloneNode(true) as HTMLAudioElement;
    node.volume = volume;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    node.addEventListener("ended", finish, { once: true });
    node.addEventListener("error", finish, { once: true });
    node.play().catch(finish);
    // Safety net in case neither event fires.
    window.setTimeout(finish, 8000);
  });
}

// Sample-accurate names following the in-game C source (PlaySE call sites in
// pret/pokeheartgold/src/voltorb_flip/voltorb_flip.c). See docs/voltorb-flip-audio-audit.md
// for the full mapping.
export const sfx = {
  /** Tile flip animation start — every tile, even voltorbs. */
  flip: () => playSample("tile-flip.mp3", 0.55),

  /** Voltorb hit. In HG/SS the flip SE plays first, then this overlaps shortly after. */
  voltorbPop: () => playSample("voltorb-pop.mp3", 0.65),

  /** Played per ~4 ticks while the "you earned X coins" counter scrolls up. */
  payoutTickEarn: () => playSample("level-clear.mp3", 0.55),

  /** Played per ~4 ticks while the earned coins drain into the player's wallet. */
  payoutTickBank: () => playSample("coin-payout-one.mp3", 0.55),

  /** Final closing chime of the payout chain. */
  payoutFinal: () => playSample("coin-payout-last.mp3", 0.6),

  /** Memo open / close — same SE for both transitions in HG/SS. */
  memoSlide: () => playSample("card-flip.mp3", 0.55),

  /** Memo flag toggled on a tile (DP_BOX01). */
  memoToggle: () => playSample("memo-toggle.mp3", 0.55),

  /** Cursor moved between memo buttons or board cells (DP_SELECT). */
  cursorMove: () => playSample("memo-select.mp3", 0.55),

  /** Tap on an already-flipped tile / disallowed action (DP_BOX03). */
  invalidTap: () => playSample("invalid-tap.mp3", 0.5),

  /** Final-decision tone — quit confirmations etc. (DP_DECIDE). */
  decide: () => playSample("decide.mp3", 0.55),

  /** Memo "Back" / "Clear" button (DP_BUTTON3). */
  backButton: () => playSample("back-button.mp3", 0.55),

  /** Round-start: level went up. (GS_SLOT01) */
  levelUp: () => playSample("level-up.mp3", 0.6),

  /** Round-start: level went down. (GS_SLOT03) */
  levelDown: () => playSample("level-down.mp3", 0.6),

  /** "Is this what you're expecting?!" risk warning (ME_CARDGAME1). */
  riskWarning: () => playSample("warning-fanfare.mp3", 0.55),

  // ── Legacy/back-compat aliases (used by existing call sites until the
  // gameplay code is migrated to the explicit names above).
  click: () => playSample("tile-flip.mp3", 0.55),
  coin: () => {
    // HG/SS does NOT play a per-flip coin SE — coin chimes only fire during
    // the post-round payout banner. Until the win flow is rewired, keep
    // this as a no-op so x2/x3 reveals stop double-bleeping.
  },
  win: () => playSample("level-clear.mp3", 0.6),
  lose: () => playSample("voltorb-pop.mp3", 0.65),
};

export function playMusic() {
  if (music) return;
  music = new Audio("/games/super-voltorb-flip/audio/music_loop.mp3");
  music.loop = true;
  music.volume = 0.3;
  music.muted = globalMuted;
  // silent-ok: autoplay is commonly blocked until a user gesture; a rejected play() must not surface
  music.play().catch(() => undefined);
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
  // silent-ok: autoplay is commonly blocked until a user gesture; a rejected play() must not surface
  gameOverAudio.play().catch(() => undefined);
}

export function stopGameOver() {
  gameOverAudio?.pause();
  gameOverAudio = null;
}

export function playLevelWin(onEnded?: () => void): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  levelWinAudio?.pause();
  levelWinAudio = new Audio("/games/super-voltorb-flip/audio/music_level_win.mp3");
  levelWinAudio.volume = 0.5;
  levelWinAudio.muted = globalMuted;
  if (onEnded) levelWinAudio.addEventListener("ended", onEnded, { once: true });
  // silent-ok: autoplay is commonly blocked until a user gesture; a rejected play() must not surface
  levelWinAudio.play().catch(() => undefined);
  return levelWinAudio;
}

export function stopLevelWin() {
  levelWinAudio?.pause();
  levelWinAudio = null;
}

// (Note: HG/SS JP swaps to BGM scene 64 during the coin-payout chain
// (voltorb_flip.c:1047). The NA Voltorb Flip doesn't use a separate
// payout track — the gameplay loop continues — so we omit it here.)

export function setMusicMuted(muted: boolean) {
  globalMuted = muted;
  if (music) music.muted = muted;
  if (gameOverAudio) gameOverAudio.muted = muted;
  if (levelWinAudio) levelWinAudio.muted = muted;
}
