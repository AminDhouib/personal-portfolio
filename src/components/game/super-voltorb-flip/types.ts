// src/components/game/super-voltorb-flip/types.ts

export type TileValue = 0 | 1 | 2 | 3;

export type MemoMarks = readonly [boolean, boolean, boolean, boolean];
// [voltorb?, one?, two?, three?]

export type Tile = {
  value: TileValue;
  flipped: boolean;
  animFrame: number | null;
  memos: MemoMarks;
};

export type LineHint = { points: number; voltorbs: number };

export type GameMode = "classic" | "super";

export type GamePhase =
  | "mode-select"
  | "loading"
  | "ready"
  | "playing"
  | "memo"
  | "revealing"
  | "won"
  | "lost"
  | "transition";

export type ThemeId =
  | "classic"
  | "meadow"
  | "twilight"
  | "thunder"
  | "rainbow";

export type WeatherKind =
  | "clear"
  | "sunny"
  | "rainy"
  | "snow"
  | "sandstorm"
  | "fog";

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export type Stats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  bestStreak: number;
  currentStreak: number;
  highestSingleRoundCoins: number;
  highestLevelCleared: number;
  lifetimeCoins: number;
};

export type PersistedSave = {
  mode: GameMode | null;
  totalCoins: number;
  unlockedThemes: ThemeId[];
  activeTheme: ThemeId;
  autoMemoEnabled: boolean;
  speedMode: boolean;
  musicVolume: number;
  sfxVolume: number;
  stats: Stats;
};

export type GameState = {
  mode: GameMode;
  phase: GamePhase;
  level: number;
  board: Tile[][];
  rowHints: LineHint[];
  colHints: LineHint[];
  currentCoins: number;
  totalCoins: number;
  maxCoins: number;
  activeTheme: ThemeId;
  unlockedThemes: Set<ThemeId>;
  autoMemoEnabled: boolean;
  speedMode: boolean;
  weather: WeatherKind;
  timeOfDay: TimeOfDay;
  shieldArmed: boolean;
  shieldedLoss: boolean;
  voltorbRevealsUsed: number;
  successfulFlipsThisRound: number;
  requiredFlipsThisRound: number;
  selectedMemoTile: { row: number; col: number } | null;
  memoCopyMode: boolean;
  stats: Stats;
};

export const EMPTY_MEMOS: MemoMarks = [false, false, false, false];

export const INITIAL_STATS: Stats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  bestStreak: 0,
  currentStreak: 0,
  highestSingleRoundCoins: 0,
  highestLevelCleared: 0,
  lifetimeCoins: 0,
};
