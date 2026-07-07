/**
 * Server-only zod schemas mirroring the CURRENT hand-rolled shapes of the
 * three persisted record types (audit/plans/P1.md section 2d / QUALITY-
 * GATES.md section 6.3). Each schema intentionally accepts exactly what its
 * route accepts today -- these are behavior-preserving, not a tightening.
 * In particular the leaderboard schema must NOT require `game`: the
 * reject/require-`game` fix (DD1-001) is refactor batch P2, sequenced under
 * this file's own characterization tests so it can be verified as a
 * preservation, not a guess.
 */
import { z } from "zod";

/** Mirrors the Entry shape in src/app/api/leaderboard/route.ts. */
export const leaderboardEntrySchema = z.object({
  name: z.string(),
  score: z.number(),
  level: z.number(),
  seconds: z.number().optional(),
  kills: z.number().optional(),
  distance: z.number().optional(),
  region: z.string().optional(),
  game: z.string().optional(),
  createdAt: z.string(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

/** Mirrors the Entry shape in src/app/api/password-game/leaderboard/route.ts. */
export const pgLeaderboardEntrySchema = z.object({
  name: z.string(),
  seed: z.number(),
  time: z.number(),
  rules: z.number(),
  createdAt: z.string(),
});
export type PgLeaderboardEntry = z.infer<typeof pgLeaderboardEntrySchema>;

/**
 * Mirrors the record shape written by src/app/api/leads/route.ts. leads.jsonl
 * has no in-app reader (leads are read via the mounted volume, not a route),
 * so this schema's only current consumer is its own pinning test; the
 * restore-drill validator (scripts/validate-data-files.mjs) mirrors it
 * structurally rather than importing it, matching that script's
 * dependency-free design.
 */
export const leadRecordSchema = z.object({
  name: z.string(),
  email: z.string(),
  note: z.string(),
  source: z.string(),
  timestamp: z.string(),
});
export type LeadRecord = z.infer<typeof leadRecordSchema>;
