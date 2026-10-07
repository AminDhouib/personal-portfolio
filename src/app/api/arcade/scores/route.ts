import { NextResponse } from "next/server";
import { z } from "zod";
import { BOARD_PERIODS, boardKey } from "@/lib/arcade/boards";
import { getArcadePool } from "@/lib/arcade/db";
import { ARCADE_GAME_SLUGS, ARCADE_SCORE_CAP, validateArcadeSubmission } from "@/lib/arcade/games";
import { readBoard, submitScore } from "@/lib/arcade/store";
import { captureException } from "@/lib/log";
import { sanitizePlayerName } from "@/lib/player-name";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { guardedJsonRoute } from "@/lib/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLE_MAX = 12;

const readQuerySchema = z.object({
  game: z.enum(ARCADE_GAME_SLUGS),
  board: z.enum(BOARD_PERIODS),
  player: z.uuid().optional(),
});

// Strict on purpose: an unknown key (for example the legacy "region") is a 400, not ignored.
// The per-game detail is validated separately, with the game's own strict schema.
const submitBodySchema = z.strictObject({
  game: z.enum(ARCADE_GAME_SLUGS),
  playerId: z.uuid(),
  // base64url of 32 random bytes, minted by the browser on first submit.
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  handle: z.string().max(200),
  score: z.number().int().min(0).max(ARCADE_SCORE_CAP),
  detail: z.record(z.string(), z.unknown()),
});

export async function GET(req: Request) {
  // Rate limit only: reads stay open to any origin (the public response is CDN-cacheable and
  // carries no secret), but each read can cost two indexed queries, so one client is capped.
  const rate = checkRateLimit(`arcade-read:${getClientIp(req)}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const params = new URL(req.url).searchParams;
  const parsed = readQuerySchema.safeParse({
    game: params.get("game") ?? undefined,
    board: params.get("board") ?? undefined,
    player: params.get("player") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }
  const { game, board: period, player } = parsed.data;
  // The board key always comes from the server clock, never from the client.
  const board = boardKey(period, new Date());
  try {
    const pool = await getArcadePool();
    const { entries, you } = await readBoard(pool, { game, board, playerId: player ?? null });
    // A response that carries the caller's own rank is per-player: never share it.
    const cache = player ? "private, no-store" : "s-maxage=10, stale-while-revalidate=30";
    return NextResponse.json(
      { game, board, entries, you },
      { headers: { "Cache-Control": cache } },
    );
  } catch (err) {
    captureException("api:arcade-scores.read", err);
    return NextResponse.json({ error: "could not read leaderboard" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await guardedJsonRoute(req, { key: "arcade-scores", limit: 10, windowMs: 60_000 });
  if (!guard.ok) return guard.response;

  const parsed = submitBodySchema.safeParse(guard.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const body = parsed.data;

  // One instant for the whole request: the validator's day check and the board keys the
  // store writes must agree on it.
  const now = new Date();
  const verdict = validateArcadeSubmission(body.game, body.score, body.detail, now);
  if (!verdict.ok) {
    if (verdict.kind === "detail") {
      return NextResponse.json({ error: "invalid detail" }, { status: 400 });
    }
    return NextResponse.json({ error: "implausible", reason: verdict.reason }, { status: 422 });
  }

  const handle = sanitizePlayerName(body.handle, { maxLength: HANDLE_MAX, fallback: "Pilot" });

  try {
    const pool = await getArcadePool();
    const outcome = await submitScore(
      pool,
      {
        game: body.game,
        playerId: body.playerId,
        token: body.token,
        handle,
        score: body.score,
        detail: verdict.detail,
      },
      now,
    );
    if (!outcome.ok) {
      return NextResponse.json({ error: "identity" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, boards: outcome.boards });
  } catch (err) {
    captureException("api:arcade-scores.write", err);
    return NextResponse.json({ error: "could not save score" }, { status: 500 });
  }
}
