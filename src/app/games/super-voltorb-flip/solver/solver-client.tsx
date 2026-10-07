"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  formatOdds,
  solve,
  type Revealed,
  type SolverInput,
} from "@/components/game/super-voltorb-flip/solver";
import { COLORS } from "@/components/game/super-voltorb-flip/types";

// The interactive half of the solver page: ten clue pairs and up to 25 flipped
// tiles in, per-tile odds out. Everything stays in component state; nothing is
// stored, sent or tracked.

type ClueBox = { coins: string; voltorbs: string };
type Kind = "Row" | "Column";

const EMPTY_CLUE: ClueBox = { coins: "", voltorbs: "" };
const emptyClues = (): ClueBox[] => Array.from({ length: 5 }, () => ({ ...EMPTY_CLUE }));
const emptyRevealed = (): Revealed[] => Array<Revealed>(25).fill(null);

const NEXT_REVEALED: Record<string, Revealed> = { null: 1, "1": 2, "2": 3, "3": null };

function parseClues(boxes: readonly ClueBox[]) {
  const parsed = boxes.map((box) => ({
    coins: box.coins === "" ? NaN : Number(box.coins),
    voltorbs: box.voltorbs === "" ? NaN : Number(box.voltorbs),
  }));
  return parsed.every((c) => Number.isInteger(c.coins) && Number.isInteger(c.voltorbs))
    ? parsed
    : null;
}

function statusText(result: ReturnType<typeof solve> | null): string {
  if (result === null) return "Enter all ten clues to see the odds.";
  switch (result.status) {
    case "invalid":
      if (result.reason === "line") {
        return "A clue does not fit: a line's coins must be between 5 minus its Voltorbs and 3 times that.";
      }
      if (result.reason === "totals") {
        return "The row and column clues disagree: their coin totals and Voltorb totals must match.";
      }
      return "No board fits these clues and flipped tiles.";
    case "too-many":
      return "Too many boards fit. Flip a tile in the game and enter it here.";
    case "solved": {
      const count = result.layouts === 1 ? "1 board fits" : `${result.layouts} boards fit`;
      return result.weighting === "uniform"
        ? `${count} these clues. They do not match any HeartGold and SoulSilver board recipe for this level, so each counts equally.`
        : `${count} these clues.`;
    }
  }
}

// Green at 0 through amber to red at 1.
const riskColor = (p: number) => `hsl(${Math.round(120 * (1 - p))} 70% 62%)`;

const FIELD =
  "h-11 w-11 rounded-sm border border-black/40 bg-white text-center text-base font-bold text-black";

export function SolverClient() {
  const [rows, setRows] = useState<ClueBox[]>(emptyClues);
  const [cols, setCols] = useState<ClueBox[]>(emptyClues);
  const [revealed, setRevealed] = useState<Revealed[]>(emptyRevealed);
  const [level, setLevel] = useState<number | null>(null);
  const fields = useRef(new Map<string, HTMLInputElement>());

  const input = useMemo<SolverInput | null>(() => {
    const r = parseClues(rows);
    const c = parseClues(cols);
    return r && c ? { rows: r, cols: c, revealed, level } : null;
  }, [rows, cols, revealed, level]);

  // The enumeration can take a moment on loose clue sets; deferring it keeps
  // typing in the boxes responsive.
  const deferred = useDeferredValue(input);
  const result = useMemo(() => (deferred ? solve(deferred) : null), [deferred]);
  const stale = deferred !== input;
  const solved = result?.status === "solved" ? result : null;

  const setClue = (kind: Kind, index: number, field: keyof ClueBox, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(0, field === "coins" ? 2 : 1);
    (kind === "Row" ? setRows : setCols)((prev) =>
      prev.map((box, i) => (i === index ? { ...box, [field]: value } : box)),
    );
    if (field === "voltorbs" && value !== "" && Number(value) <= 5) {
      // Typing a Voltorb count finishes that clue: move on to the next one.
      const order = kind === "Row" ? index : 5 + index;
      const next = order + 1;
      const key = `${next < 5 ? "Row" : "Column"} ${(next % 5) + 1} coins`;
      fields.current.get(key)?.focus();
    }
  };

  const clueCell = (kind: Kind, index: number, boxes: ClueBox[]) => {
    const box = boxes[index] ?? EMPTY_CLUE;
    const label = `${kind} ${index + 1}`;
    const bind = (suffix: string) => (el: HTMLInputElement | null) => {
      if (el) fields.current.set(`${label} ${suffix}`, el);
      else fields.current.delete(`${label} ${suffix}`);
    };
    return (
      <div
        key={`${kind}-${index}`}
        className="flex flex-col items-center justify-center gap-1 rounded-md p-1"
        style={{ backgroundColor: COLORS[index] }}
      >
        <input
          ref={bind("coins")}
          className={FIELD}
          inputMode="numeric"
          maxLength={2}
          autoComplete="off"
          aria-label={`${label} coins`}
          value={box.coins}
          onChange={(e) => setClue(kind, index, "coins", e.target.value)}
        />
        <input
          ref={bind("Voltorbs")}
          className={FIELD}
          inputMode="numeric"
          maxLength={1}
          autoComplete="off"
          aria-label={`${label} Voltorbs`}
          value={box.voltorbs}
          onChange={(e) => setClue(kind, index, "voltorbs", e.target.value)}
        />
      </div>
    );
  };

  const cycle = (i: number) =>
    setRevealed((prev) => prev.map((v, k) => (k === i ? (NEXT_REVEALED[String(v)] ?? null) : v)));

  const clear = () => {
    setRows(emptyClues());
    setCols(emptyClues());
    setRevealed(emptyRevealed());
    setLevel(null);
  };

  const tile = (i: number) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const where = `Row ${row + 1}, column ${col + 1}`;
    const shown = revealed[i] ?? null;
    const nextShown = NEXT_REVEALED[String(shown)] ?? null;
    const action =
      nextShown === null
        ? "Activate to mark it face down again."
        : `Activate to mark it flipped as ${nextShown}.`;

    if (shown !== null) {
      return (
        <button
          key={i}
          type="button"
          aria-label={`${where}: Flipped as ${shown}. ${action}`}
          onClick={() => cycle(i)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md border-2 border-[#8a4236] bg-[#bd8c84] text-2xl font-black text-black"
        >
          {shown}
        </button>
      );
    }

    const odds = solved?.tiles[i];
    if (!odds) {
      return (
        <button
          key={i}
          type="button"
          aria-label={`${where}: Face down. ${action}`}
          onClick={() => cycle(i)}
          className="min-h-11 min-w-11 rounded-md border border-(--border) bg-(--card)"
        />
      );
    }

    const multiplier = odds.two + odds.three;
    const isBest = solved?.best === i;
    const onlyOneOrVoltorb = multiplier === 0;
    const caption = isBest
      ? "Flip next"
      : onlyOneOrVoltorb
        ? odds.voltorb === 0
          ? "1"
          : "1 or V"
        : odds.voltorb === 0
          ? "Safe"
          : "";
    const name = `${where}: ${formatOdds(odds.voltorb)} Voltorb, ${formatOdds(multiplier)} two or three. Face down. ${action}`;
    return (
      <button
        key={i}
        type="button"
        aria-label={name}
        onClick={() => cycle(i)}
        className={`flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border-2 px-0.5 ${
          onlyOneOrVoltorb
            ? "border-(--border) bg-(--card) text-(--muted)"
            : "border-transparent text-black"
        } ${isBest ? "outline-3 outline-offset-2 outline-(--foreground)" : ""}`}
        style={onlyOneOrVoltorb ? undefined : { backgroundColor: riskColor(odds.voltorb) }}
      >
        <span className="text-base leading-tight font-black">{formatOdds(odds.voltorb)}</span>
        <span className="text-[11px] leading-tight font-semibold">{caption}</span>
      </button>
    );
  };

  return (
    <div className="max-w-md">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          Level
          <select
            className="h-11 rounded-md border border-(--border) bg-(--card) px-2 text-sm"
            value={level === null ? "" : String(level)}
            onChange={(e) => setLevel(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Level: Not sure</option>
            {Array.from({ length: 8 }, (_, k) => (
              <option key={k + 1} value={String(k + 1)}>
                Level {k + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={clear}
          className="h-11 rounded-md border border-(--border) px-4 text-sm font-semibold transition-colors hover:bg-(--card)"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 5 }, (_, r) => [
          ...Array.from({ length: 5 }, (_, c) => tile(r * 5 + c)),
          clueCell("Row", r, rows),
        ])}
        {Array.from({ length: 5 }, (_, c) => clueCell("Column", c, cols))}
      </div>

      <p
        role="status"
        className={`mt-4 min-h-12 text-sm text-(--foreground)/85 ${stale ? "opacity-60" : ""}`}
      >
        {statusText(result)}
      </p>
    </div>
  );
}
