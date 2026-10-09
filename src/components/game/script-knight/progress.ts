import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { TOWER_IDS, type TowerId } from "./engine/towers";
import { storedVersionIsNewer } from "./stored-version";

// Tower progress. Its own key, never uploaded, display-only (DESIGN.md: forgeable, so nothing
// reads it to gate anything but the Powder Keep door, which the player could open by editing
// their own storage anyway). Versioned like tower:stats; a newer build's record is left alone.
export const PROGRESS_KEY = "knight:progress";

/** Both towers have nine floors. */
export const FLOORS_PER_TOWER = 9;

export type LevelBest = { score: number; grade: number; turns: number };
export type EpicBest = { score: number; grades: number[] };
export type TowerProgress = {
  /** The highest floor the player may open (1..9). */
  reached: number;
  /** Best clear per floor, keyed "1".."9". */
  best: Record<string, LevelBest>;
  epic: EpicBest | null;
};
export type ProgressAt = { tower: TowerId; level: number; epic: boolean };
export type Progress = {
  v: 1;
  towers: Record<TowerId, TowerProgress>;
  at: ProgressAt;
};

function emptyTower(): TowerProgress {
  return { reached: 1, best: {}, epic: null };
}

export function emptyProgress(): Progress {
  return {
    v: 1,
    towers: { "narrow-path": emptyTower(), "powder-keep": emptyTower() },
    at: { tower: "narrow-path", level: 1, epic: false },
  };
}

const floorNumber = z
  .number()
  .finite()
  .transform((n) => Math.min(FLOORS_PER_TOWER, Math.max(1, Math.floor(n))));

const levelBestSchema = z.object({
  score: z.number().finite().min(0).transform(Math.floor),
  grade: z.number().finite().min(0),
  turns: z.number().int().min(1).max(200),
});

const epicSchema = z.object({
  score: z.number().finite().min(0).transform(Math.floor),
  grades: z.array(z.number().finite().min(0)).max(FLOORS_PER_TOWER),
});

/** Keeps the entries that are a floor number with a well-formed best; drops the rest. */
function parseBest(raw: unknown): Record<string, LevelBest> {
  const best: Record<string, LevelBest> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return best;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[1-9]$/.test(key)) continue;
    const parsed = levelBestSchema.safeParse(value);
    if (parsed.success) best[key] = parsed.data;
  }
  return best;
}

const towerSchema = z
  .object({
    reached: floorNumber.catch(1),
    best: z.unknown().transform(parseBest),
    epic: epicSchema.nullable().catch(null),
  })
  .catch(emptyTower());

const progressSchema = z.object({
  v: z.literal(1),
  towers: z
    .object({
      "narrow-path": towerSchema,
      "powder-keep": towerSchema,
    })
    .catch({ "narrow-path": emptyTower(), "powder-keep": emptyTower() }),
  at: z
    .object({
      tower: z.enum(TOWER_IDS).catch("narrow-path"),
      level: z.number().int().min(1).max(FLOORS_PER_TOWER).catch(1),
      epic: z.boolean().catch(false),
    })
    .catch({ tower: "narrow-path", level: 1, epic: false }),
});

export function parseProgress(raw: unknown): Progress {
  const result = progressSchema.safeParse(raw);
  if (!result.success) return emptyProgress();
  return result.data;
}

export function loadProgress(): Progress {
  let text: string | null;
  try {
    text = window.localStorage.getItem(PROGRESS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means empty progress
    return emptyProgress();
  }
  if (text === null) return emptyProgress();
  return parseProgress(safeJsonParse<unknown>(text, "knight:progress"));
}

export function saveProgress(progress: Progress): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(PROGRESS_KEY)) return;
  safeLocalSet(PROGRESS_KEY, JSON.stringify(progress));
}

function withTower(progress: Progress, tower: TowerId, next: TowerProgress): Progress {
  return { ...progress, towers: { ...progress.towers, [tower]: next } };
}

/**
 * Folds a cleared floor in: the best per floor rises only on a strictly higher score, and the
 * next floor opens. `reached` never drops and never passes the ninth floor.
 */
export function recordClear(
  progress: Progress,
  tower: TowerId,
  level: number,
  clear: LevelBest,
): Progress {
  if (!Number.isInteger(level) || level < 1 || level > FLOORS_PER_TOWER) return progress;
  const current = progress.towers[tower];
  const old = current.best[String(level)];
  const best =
    old && old.score >= clear.score ? current.best : { ...current.best, [String(level)]: clear };
  const reached = Math.max(current.reached, Math.min(FLOORS_PER_TOWER, level + 1));
  return withTower(progress, tower, { ...current, reached, best });
}

/** Keeps the higher epic run. */
export function recordEpic(progress: Progress, tower: TowerId, epic: EpicBest): Progress {
  const current = progress.towers[tower];
  if (current.epic && current.epic.score >= epic.score) return progress;
  return withTower(progress, tower, { ...current, epic });
}

/** Remembers where the player was, so a reload lands on the same floor. */
export function setAt(progress: Progress, at: ProgressAt): Progress {
  const same =
    progress.at.tower === at.tower &&
    progress.at.level === at.level &&
    progress.at.epic === at.epic;
  return same ? progress : { ...progress, at };
}

/** The Narrow Path is always open; Powder Keep opens once its ninth floor has been cleared. */
export function isTowerUnlocked(progress: Progress, tower: TowerId): boolean {
  if (tower === "narrow-path") return true;
  return progress.towers["narrow-path"].best[String(FLOORS_PER_TOWER)] !== undefined;
}
