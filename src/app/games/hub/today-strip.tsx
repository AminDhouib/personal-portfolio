"use client";

import Link from "next/link";
import { GAMES_BY_SLUG } from "@/app/games/games-meta";
import { formatHubValue, type HubBoardResult } from "./hub-boards";
import { useResetCountdown } from "./reset-countdown";
import { TODAY_SOURCES, type TodaySource } from "./today-sources";
import { useHubBoards } from "./use-hub-boards";

const DASH = "\u2014";
const PLACEHOLDER_RANKS = [1, 2, 3] as const;

type TileState = "idle" | "ready" | "empty" | "error";

const TILE_COPY: Record<TodaySource["kind"], { kicker: string; note: string }> = {
  // The PG2 board is "today" by the database's UTC day; the seed is still the visitor's
  // local day until T3 (DESIGN.md, Games hub), so the tile says what the board is.
  pg2: { kicker: "Daily run", note: "Fastest daily runs posted today (UTC)" },
  arcade: { kicker: "Daily top scores", note: "Highest scores posted today (UTC)" },
};

function tileState(result: HubBoardResult | undefined): TileState {
  if (result === undefined) return "idle";
  if (result.status === "error") return "error";
  return result.rows.length === 0 ? "empty" : "ready";
}

function TileBody({
  kind,
  state,
  result,
}: {
  kind: TodaySource["kind"];
  state: TileState;
  result: HubBoardResult | undefined;
}) {
  // The body is always exactly three 24px rows tall, so loading, populated, empty and error
  // tiles are the same height and the page never shifts when a read lands.
  return (
    <div data-tile-body="" aria-busy={state === "idle"} className="mt-3 h-18">
      {state === "idle" && (
        <>
          <p className="sr-only">Loading</p>
          <ol role="list" aria-hidden="true">
            {PLACEHOLDER_RANKS.map((rank) => (
              <li key={rank} className="flex h-6 items-center gap-2 text-sm text-(--muted)">
                <span className="w-4 shrink-0 tabular-nums">{rank}</span>
                <span>{DASH}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {state === "ready" && result?.status === "ok" && (
        <ol role="list">
          {result.rows.map((row) => (
            <li key={row.rank} className="flex h-6 items-center gap-2 text-sm">
              <span className="w-4 shrink-0 text-(--muted) tabular-nums">{row.rank}</span>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatHubValue(kind, row.value)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {state === "empty" && (
        <p className="flex h-full items-center text-sm text-(--muted)">
          No runs yet today. Be the first.
        </p>
      )}
      {state === "error" && (
        <p className="flex h-full items-center text-sm text-(--muted)">
          Board unavailable right now
        </p>
      )}
    </div>
  );
}

function TodayTile({
  source,
  state,
  result,
}: {
  source: TodaySource;
  state: TileState;
  result: HubBoardResult | undefined;
}) {
  const title = GAMES_BY_SLUG[source.slug].title;
  const copy = TILE_COPY[source.kind];
  return (
    <div
      data-testid="today-tile"
      data-slug={source.slug}
      data-state={state}
      className="flex h-full flex-col rounded-2xl border border-(--border) bg-(--card) p-4"
    >
      <h3 className="truncate font-display text-base font-black tracking-tight">{title}</h3>
      <p className="truncate text-xs text-(--muted)">{copy.kicker}</p>
      <TileBody kind={source.kind} state={state} result={result} />
      <p className="mt-3 text-xs text-(--muted)">{copy.note}</p>
      <Link
        href={`/games/${source.slug}`}
        className="mt-1 inline-flex min-h-11 items-center self-start text-sm font-medium underline-offset-4 hover:underline"
      >
        Play {title}
      </Link>
    </div>
  );
}

export function TodayStrip() {
  const { ref, boards } = useHubBoards(TODAY_SOURCES);
  const countdown = useResetCountdown();
  const tiles = TODAY_SOURCES.map((source) => {
    const result = boards[source.slug];
    return { source, result, state: tileState(result) };
  });
  const settled = tiles.every((tile) => tile.state !== "idle");
  return (
    <section
      ref={ref}
      aria-labelledby="hub-today-heading"
      data-testid="hub-today"
      data-state={settled ? "settled" : "loading"}
      className="mt-10"
    >
      <h2
        id="hub-today-heading"
        className="font-display text-xl font-black tracking-tight sm:text-2xl"
      >
        Today
      </h2>
      <p className="mt-1 text-sm text-(--muted)">The top three on each daily board.</p>
      <ul role="list" className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.source.slug} className="min-w-0">
            <TodayTile source={tile.source} state={tile.state} result={tile.result} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-(--muted)" data-testid="hub-today-reset">
        {countdown === null ? "Resets at 00:00 UTC" : `${countdown} (00:00 UTC)`}
      </p>
    </section>
  );
}
