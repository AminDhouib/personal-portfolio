"use client";

import { useEffect, useState } from "react";
import type { GameState } from "../engine/types";

/**
 * Password Game 2 — the end-run receipt.
 *
 * The screenshot-bait payoff: a monospace store receipt itemizing the run's damage,
 * printed on victory. Below the tear line it wires the leaderboard — post the time,
 * read back the seed board (or the daily board for a daily run) with the player's row
 * lit up — and the race-this-seed / play-again controls. Every network call is
 * best-effort: a leaderboard that is down must never break the receipt.
 */

interface ReceiptCardProps {
  g: GameState;
  seed: number;
  daily: boolean;
  onCopySeed: () => void;
  onPlayAgain: () => void;
  onPlayDaily: () => void;
}

interface BoardEntry {
  name: string;
  seed: number;
  timeMs: number;
  daily: boolean;
}

/** defId -> the crisis's receipt-facing name. */
const CRISIS_NAMES: Record<string, string> = {
  gerald: "Gerald’s appetite",
  campfire: "The campfire",
  garden: "The garden bear",
  infection: "The data corruption",
  "black-hole": "The storage compactor",
  parasite: "The parasite",
  galaga: "The invasion fleet",
  snake: "The snake",
  tetris: "The falling garbage",
  "cookie-banner": "The cookie banners",
  autocorrect: "The autocorrect demon",
  "loading-bar": "The loading bar",
};

function formatTenths(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${t}`;
}

type PostState =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent"; rank: number } | { kind: "unavailable" };

export function ReceiptCard({
  g,
  seed,
  daily,
  onCopySeed,
  onPlayAgain,
  onPlayDaily,
}: ReceiptCardProps) {
  const [name, setName] = useState("");
  const [post, setPost] = useState<PostState>({ kind: "idle" });
  const [board, setBoard] = useState<BoardEntry[] | null>(null);
  const [posted, setPosted] = useState<{ name: string; timeMs: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const stats = g.stats;
  const timeMs = Math.round(g.elapsedMs);
  const crisis = CRISIS_NAMES[stats.biggestCrisis] ?? "None, somehow";
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

  // Read the board on mount, whenever the board identity changes (seed vs. daily),
  // and after a successful post (via refreshKey). The fetch lives in a nested async
  // callback so its setState is a response to an external system, not a synchronous
  // effect body — a best-effort read; a failure just leaves the board hidden.
  useEffect(() => {
    let cancelled = false;
    const query = daily ? "?daily=1" : `?seed=${seed}`;
    void (async () => {
      try {
        const res = await fetch(`/api/password-game-2/leaderboard${query}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { entries?: Array<Record<string, unknown>> };
        const entries = (body.entries ?? []).map((e) => ({
          name: String(e["name"] ?? ""),
          seed: Number(e["seed"]),
          timeMs: Number(e["timeMs"]),
          daily: e["daily"] === true,
        }));
        if (!cancelled) setBoard(entries.slice(0, 10));
      } catch {
        // silent-ok: expected-failure path (offline, timeout, board down) — the
        // board simply stays hidden. Reporting would spam Sentry with noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [daily, seed, refreshKey]);

  const submit = async () => {
    // Send the SAME normalized name we record locally: the server falls back to
    // "Anonymous" for a blank name, and isMine matches on the recorded value, so
    // posting a different string would break the own-row highlight.
    const postedName = name.trim() || "Anonymous";
    setPost({ kind: "sending" });
    setPosted({ name: postedName, timeMs });
    try {
      const res = await fetch("/api/password-game-2/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: postedName, seed, timeMs, daily }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        setPost({ kind: "unavailable" });
        return;
      }
      const body = (await res.json()) as { rank?: number };
      setPost({ kind: "sent", rank: body.rank ?? 0 });
      setRefreshKey((k) => k + 1); // re-read the board so the player's row appears
    } catch {
      // silent-ok: same expected-failure path as the board read — quiet fallback, no report.
      setPost({ kind: "unavailable" });
    }
  };

  const isMine = (e: BoardEntry): boolean =>
    post.kind === "sent" && posted !== null && e.timeMs === posted.timeMs && e.name === posted.name;

  const items: Array<[string, string]> = [
    ["Rules survived", String(g.rules.length)],
    ["Letters abducted", String(stats.lettersAbducted)],
    ["Letters rescued", String(stats.lettersRescued)],
    ["Infections cured", String(stats.infectionsCured)],
    ["Garbage cleared", String(stats.garbageCleared)],
    ["Missiles intercepted", String(stats.missilesIntercepted)],
    ["Aliens downed", String(stats.aliensDowned)],
    ["Creatures saved", String(stats.creaturesSaved)],
    ["Knockbacks", String(stats.knockbacks)],
  ];

  return (
    <div className="pg2-receipt-wrap">
      <div className="pg2-receipt" role="img" aria-label="Password Game 2 run receipt">
        <div className="pg2-receipt__edge pg2-receipt__edge--top" aria-hidden="true" />
        <div className="pg2-receipt__body">
          <p className="pg2-receipt__title">THE PASSWORD GAME 2</p>
          <p className="pg2-receipt__sub">* * * RECEIPT * * *</p>
          <p className="pg2-receipt__stamp">ACCOUNT CREATED</p>

          <div className="pg2-receipt__rule" />

          <div className="pg2-receipt__row pg2-receipt__row--total">
            <span>TOTAL TIME</span>
            <span>{formatTenths(g.elapsedMs)}</span>
          </div>

          <div className="pg2-receipt__rule pg2-receipt__rule--dashed" />

          {items.map(([k, v]) => (
            <div key={k} className="pg2-receipt__row">
              <span>{k}</span>
              <span className="pg2-receipt__dots" aria-hidden="true" />
              <span>{v}</span>
            </div>
          ))}

          <div className="pg2-receipt__row">
            <span>Biggest crisis</span>
            <span className="pg2-receipt__dots" aria-hidden="true" />
            <span>{crisis}</span>
          </div>

          <div className="pg2-receipt__rule pg2-receipt__rule--dashed" />

          <div className="pg2-receipt__row">
            <span>Seed</span>
            <span className="pg2-receipt__dots" aria-hidden="true" />
            <span>{seed}</span>
          </div>
          <div className="pg2-receipt__row">
            <span>{daily ? "Daily run" : "Mode"}</span>
            <span className="pg2-receipt__dots" aria-hidden="true" />
            <span>{daily ? dateStr : "Endless"}</span>
          </div>
          <div className="pg2-receipt__row">
            <span>Date</span>
            <span className="pg2-receipt__dots" aria-hidden="true" />
            <span>{dateStr}</span>
          </div>

          <div className="pg2-receipt__rule" />

          <p className="pg2-receipt__barcode" aria-hidden="true" />
          <p className="pg2-receipt__foot">CUSTOMER COPY — NO REFUNDS</p>
        </div>
        <div className="pg2-receipt__edge pg2-receipt__edge--bottom" aria-hidden="true" />
      </div>

      <div className="pg2-postrun">
        <div className="pg2-postrun__leaderboard">
          <p className="pg2-postrun__heading">{daily ? "Today’s daily board" : "Race this seed"}</p>

          {post.kind === "sent" ? (
            <p className="pg2-postrun__rank">
              Rank #{post.rank} {daily ? "on today’s board" : "for this seed"}.
            </p>
          ) : (
            <div className="pg2-postrun__entry">
              <input
                className="pg2-field pg2-postrun__name"
                value={name}
                maxLength={16}
                placeholder="Your name"
                aria-label="Name for the leaderboard"
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className="pg2-btn pg2-btn--primary px-4 py-2 text-sm"
                disabled={post.kind === "sending"}
                onClick={() => void submit()}
              >
                {post.kind === "sending" ? "Posting…" : "Post to leaderboard"}
              </button>
            </div>
          )}

          {post.kind === "unavailable" ? (
            <p className="pg2-postrun__note">Leaderboard unavailable — your run still counts.</p>
          ) : null}

          {board && board.length > 0 ? (
            <ol className="pg2-board">
              {board.map((e, i) => (
                <li
                  key={`${e.name}-${e.timeMs}-${i}`}
                  className={`pg2-board__row ${isMine(e) ? "pg2-board__row--mine" : ""}`}
                >
                  <span className="pg2-board__pos">{i + 1}</span>
                  <span className="pg2-board__name">{e.name}</span>
                  <span className="pg2-board__time">{formatTenths(e.timeMs)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pg2-postrun__note">No times posted yet. Be the first to set the pace.</p>
          )}
        </div>

        <div className="pg2-postrun__actions">
          <button
            type="button"
            className="pg2-btn pg2-btn--ghost px-4 py-2 text-sm"
            onClick={onCopySeed}
          >
            Copy race link
          </button>
          <button
            type="button"
            className="pg2-btn pg2-btn--primary px-4 py-2 text-sm"
            onClick={onPlayAgain}
          >
            Play again
          </button>
          <button
            type="button"
            className="pg2-btn pg2-btn--ghost px-4 py-2 text-sm"
            onClick={onPlayDaily}
          >
            Play the daily
          </button>
        </div>
      </div>
    </div>
  );
}
