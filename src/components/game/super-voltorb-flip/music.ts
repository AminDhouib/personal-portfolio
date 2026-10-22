// The original HeartGold/SoulSilver Voltorb Flip music, restored on the owner's instruction
// (T-6535, 2026-10-22). The background music is the original intro played once and then the
// original loop, at every level; the round-cleared and round-lost jingles are the original
// files too. The music belongs to Nintendo, Game Freak and Creatures Inc., used in an unofficial
// non-commercial fan recreation (credits in public/games/super-voltorb-flip/music/CREDITS.md).
// Sound effects and the risk-warning fanfare are still synthesized (sound-cues.ts).

export interface MusicTrack {
  src: string;
  volume: number;
}

const BASE = "/games/super-voltorb-flip/audio";

export const MUSIC_INTRO: MusicTrack = { src: `${BASE}/music_intro.mp3`, volume: 0.3 };
export const MUSIC_LOOP: MusicTrack = { src: `${BASE}/music_loop.mp3`, volume: 0.3 };

/** Background music in order: the intro once, then the loop for as long as the game plays. */
export const MUSIC_SEQUENCE: readonly MusicTrack[] = [MUSIC_INTRO, MUSIC_LOOP];

/** Round cleared. Plays alongside the level-clear cue's timing (LEVEL_WIN_MS), which stays the contract. */
export const LEVEL_WIN_JINGLE: MusicTrack = { src: `${BASE}/music_level_win.mp3`, volume: 0.5 };

/** Round lost. Plays alongside the game-over cue's timing (GAME_OVER_MS), which stays the contract. */
export const GAME_OVER_JINGLE: MusicTrack = { src: `${BASE}/game_over.mp3`, volume: 0.5 };
