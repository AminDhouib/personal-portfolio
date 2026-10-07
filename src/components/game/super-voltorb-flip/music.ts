// Which background loop plays at which level. The tracks are CC0 chiptunes
// (attribution in public/games/super-voltorb-flip/music/CREDITS.md). Volumes
// equalize loudness: measured mean levels were rookie -16.1 dB, veteran
// -9.4 dB and master -19.6 dB, and the old loop sat at -16.3 dB played at 0.3,
// so each track is trimmed to land at the same output level.

export interface MusicTrack {
  src: string;
  volume: number;
}

interface MusicBand {
  /** Highest level (inclusive) this band covers. */
  maxLevel: number;
  track: MusicTrack;
}

const BASE = "/games/super-voltorb-flip/music";

export const MUSIC_BANDS: readonly MusicBand[] = [
  { maxLevel: 3, track: { src: `${BASE}/rookie.mp3`, volume: 0.29 } },
  { maxLevel: 6, track: { src: `${BASE}/veteran.mp3`, volume: 0.14 } },
  { maxLevel: Number.POSITIVE_INFINITY, track: { src: `${BASE}/master.mp3`, volume: 0.44 } },
];

export function musicTrackForLevel(level: number): MusicTrack {
  const l = Number.isFinite(level) ? level : 1;
  const band = MUSIC_BANDS.find((b) => l <= b.maxLevel) ?? MUSIC_BANDS[MUSIC_BANDS.length - 1];
  // MUSIC_BANDS is a non-empty constant; the fallback only satisfies the index type.
  return (band ?? MUSIC_BANDS[0]!).track;
}
