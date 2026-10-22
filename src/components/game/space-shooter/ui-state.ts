import type { BossId, BossPhase, GameRefs, GameStatus, PowerUpType } from "./types";

export interface UiState {
  status: GameStatus;
  score: number;
  seconds: number;
  kills: number;
  distance: number;
  combo: number;
  comboPeak: number;
  comboFlash: boolean;
  coinsThisRun: number;
  coinPickups: number;
  coinBoostBonus: number;
  active: { type: PowerUpType; remainingMs: number }[];
  objectCounts: {
    obstacles: number;
    bossProjectiles: number;
    explosions: number;
  };
  dashCooldown: {
    pct: number;
    onCooldown: boolean;
  };
  boss: {
    id: BossId;
    phase: BossPhase;
    hpPct: number;
    hasDrone: boolean;
  } | null;
  bossesDefeatedThisRun: number;
}

// How long the combo chip stays enlarged and glowing after a new tier.
export const COMBO_FLASH_MS = 300;

export function createInitialUiState(): UiState {
  return {
    status: "armed",
    score: 0,
    seconds: 0,
    kills: 0,
    distance: 0,
    combo: 1,
    comboPeak: 1,
    comboFlash: false,
    coinsThisRun: 0,
    coinPickups: 0,
    coinBoostBonus: 0,
    active: [],
    objectCounts: { obstacles: 0, bossProjectiles: 0, explosions: 0 },
    dashCooldown: { pct: 1, onCooldown: false },
    boss: null,
    bossesDefeatedThisRun: 0,
  };
}

export function createUiStateFromGame(g: GameRefs, now: number): UiState {
  let seconds = 0;
  if (g.startedAt > 0) {
    if (g.status === "dying" || g.status === "dead") {
      seconds = ((g.dyingAt || now) - g.startedAt) / 1000;
    } else if (g.status === "paused" && g.pausedAt > 0) {
      // Freeze the displayed clock at the pause instant; resumeRun shifts
      // startedAt so the count picks up where it left off.
      seconds = (g.pausedAt - g.startedAt) / 1000;
    } else {
      seconds = (now - g.startedAt) / 1000;
    }
  }

  const onCooldown = now < g.dash.cooldownUntil;
  const boss = g.boss;

  return {
    status: g.status,
    // Apply the score-multiplier upgrade live so the HUD matches the final
    // score computed on death instead of jumping at the last moment.
    score: Math.floor(g.score * g.scoreMultiplier),
    seconds,
    kills: g.kills,
    distance: Math.floor(g.distance),
    combo: g.combo,
    comboPeak: g.comboPeak,
    comboFlash: g.comboTierUpAt > 0 && now - g.comboTierUpAt < COMBO_FLASH_MS,
    coinsThisRun: g.coinsThisRun,
    coinPickups: g.coinPickupsThisRun,
    coinBoostBonus: g.coinBoostBonusThisRun,
    active: g.activePowerUps.map((p) => ({
      type: p.type,
      remainingMs: Math.max(0, p.expiresAt - now),
    })),
    objectCounts: {
      obstacles: g.obstacles.length,
      bossProjectiles: g.bossProjectiles.length,
      explosions: g.explosions.length,
    },
    dashCooldown: {
      pct: onCooldown ? Math.max(0, 1 - (g.dash.cooldownUntil - now) / 2000) : 1,
      onCooldown,
    },
    boss: boss
      ? {
          id: boss.id,
          phase: boss.phase,
          hpPct: Math.max(0, (boss.hp / boss.hpMax) * 100),
          hasDrone: boss.subEntities.some((s) => s.type === "drone"),
        }
      : null,
    bossesDefeatedThisRun: g.bossesDefeatedThisRun,
  };
}
