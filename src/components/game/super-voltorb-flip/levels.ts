export type LevelConfig = readonly [
  twos: number,
  threes: number,
  voltorbs: number,
  maxCoins: number,
];

/**
 * Level configurations from the original HGSS game.
 * Each level has 5 possible board configurations, randomly selected per round.
 * Format: [twos, threes, voltorbs, maxCoins]
 * maxCoins = 2^twos * 3^threes
 */
export const LEVELS: readonly (readonly LevelConfig[])[] = [
  // Level 1
  [
    [3, 1, 6, 24],
    [0, 3, 6, 27],
    [5, 0, 6, 32],
    [2, 2, 6, 36],
    [4, 1, 6, 48],
  ],
  // Level 2
  [
    [1, 3, 7, 54],
    [6, 0, 7, 64],
    [3, 2, 7, 72],
    [0, 4, 7, 81],
    [5, 1, 7, 96],
  ],
  // Level 3
  [
    [2, 3, 8, 108],
    [7, 0, 8, 128],
    [4, 2, 8, 144],
    [1, 4, 8, 162],
    [6, 1, 8, 192],
  ],
  // Level 4
  [
    [3, 3, 8, 216],
    [0, 5, 8, 243],
    [8, 0, 10, 256],
    [5, 2, 10, 288],
    [2, 4, 10, 324],
  ],
  // Level 5
  [
    [7, 1, 10, 384],
    [4, 3, 10, 432],
    [1, 5, 10, 486],
    [9, 0, 10, 512],
    [6, 2, 10, 576],
  ],
  // Level 6
  [
    [3, 4, 10, 648],
    [0, 6, 10, 729],
    [8, 1, 10, 768],
    [5, 3, 10, 864],
    [2, 5, 10, 972],
  ],
  // Level 7
  [
    [7, 2, 10, 1152],
    [4, 4, 10, 1296],
    [1, 6, 13, 1458],
    [9, 1, 13, 1536],
    [6, 3, 10, 1728],
  ],
  // Level 8
  [
    [0, 7, 10, 2187],
    [8, 2, 10, 2304],
    [5, 4, 10, 2592],
    [2, 6, 10, 2916],
    [7, 3, 10, 3456],
  ],
] as const;
