import { useEffect, useRef, useState } from "react";
import type { GhostSpot } from "./engine/ghost";
import { LOOKAHEAD_WORDS } from "./engine/run";
import type { TypingRun } from "./engine/types";
import { nextTrim } from "./line-window";

type LetterState = "correct" | "wrong" | "untyped" | "skipped" | "extra";

const LETTER_CLASS: Record<LetterState, string> = {
  correct: "text-accent-green transition-colors duration-100",
  wrong: "rounded bg-red-500/15 text-red-400 transition-colors duration-100",
  untyped: "text-(--muted)/50 transition-colors duration-100",
  skipped: "text-red-400/60 underline transition-colors duration-100",
  extra: "rounded bg-red-500/15 text-red-400 line-through transition-colors duration-100",
};

const CARET_CLASS =
  "border-b-2 border-accent-blue shadow-[0_2px_8px_rgba(96,165,250,0.6)] animate-pulse";

// The ghost is a dimmer marker than the caret: a soft block behind the letter, not an underline.
const GHOST_CLASS = "rounded bg-(--muted)/30";

function letterState(word: string, typed: string, j: number, committed: boolean): LetterState {
  if (j >= word.length) return "extra";
  if (j < typed.length) return typed[j] === word[j] ? "correct" : "wrong";
  return committed ? "skipped" : "untyped";
}

/**
 * The words of a run, one inline-block span per word so a word never breaks
 * mid-way unless it is wider than the box. Only three lines show: when the caret reaches the third line, the
 * first line's words leave the DOM (Monkeytype's approach), which keeps a
 * 120 s run small. Letters carry data-state; the caret sits on the next
 * letter, or on the space after a fully typed word. A screen reader gets the
 * plain full text. A ghost, when there is one, is marked on the letter (or the
 * space) where your best run stood at this moment; it is decoration only.
 */
export function TextView({
  run,
  caret,
  ghost = null,
}: {
  run: TypingRun;
  caret: boolean;
  ghost?: GhostSpot | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Words before `from` are out of the DOM; a new run starts again at zero.
  const [trim, setTrim] = useState<{ run: TypingRun; from: number }>({ run, from: 0 });
  const from = Math.min(trim.run === run ? trim.from : 0, run.cursor);

  // Bumped when the box changes size, so line positions are measured again.
  const [layout, setLayout] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setLayout((n) => n + 1));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const cursor = run.cursor;
  useEffect(() => {
    // Measured after paint, then applied in a frame callback: a line scroll is never urgent.
    const id = requestAnimationFrame(() => {
      const els = rootRef.current?.querySelectorAll<HTMLElement>("[data-ts-word]");
      if (!els || els.length === 0) return;
      const drop = nextTrim(
        Array.from(els, (el) => el.offsetTop),
        cursor - from,
      );
      if (drop > 0 || trim.run !== run || trim.from !== from) {
        setTrim({ run, from: from + drop });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [run, cursor, from, trim, layout]);

  const playing = caret && run.status !== "done";
  const end = Math.min(run.words.length, run.cursor + LOOKAHEAD_WORDS);
  const nodes = run.words.slice(from, end).map((word, k) => {
    const i = from + k;
    const typed = run.typed[i] ?? "";
    const committed = i < run.cursor;
    const letters = [...word, ...typed.slice(word.length)];
    const caretAt = playing && i === run.cursor ? typed.length : -1;
    // A ghost on the space after the last word (the end of the text) rests on its last letter.
    const spaceAfter = i < run.words.length - 1;
    const ghostAt = ghost && ghost.word === i ? Math.min(ghost.letter, word.length) : -1;
    const ghostLetter = ghostAt === word.length ? (spaceAfter ? -1 : word.length - 1) : ghostAt;
    const spaceClasses: string[] = [];
    if (caretAt >= letters.length) spaceClasses.push(CARET_CLASS);
    if (ghostAt === word.length) spaceClasses.push(GHOST_CLASS);
    return (
      <span key={i} data-ts-word={i}>
        <span className="inline-block max-w-full break-words">
          {letters.map((ch, j) => {
            const state = letterState(word, typed, j, committed);
            const shown = state === "extra" ? (typed[j] ?? ch) : ch;
            const classes: string[] = [LETTER_CLASS[state]];
            if (j === caretAt) classes.push(CARET_CLASS);
            if (j === ghostLetter) classes.push(GHOST_CLASS);
            return (
              <span
                key={j}
                data-state={state}
                data-ts-caret={j === caretAt ? "" : undefined}
                data-testid={j === ghostLetter ? "ts-ghost" : undefined}
                aria-hidden={j === ghostLetter ? "true" : undefined}
                className={classes.join(" ")}
              >
                {shown}
              </span>
            );
          })}
        </span>
        {spaceAfter && (
          <span
            data-ts-caret={caretAt >= letters.length ? "" : undefined}
            data-testid={ghostAt === word.length ? "ts-ghost" : undefined}
            aria-hidden={ghostAt === word.length ? "true" : undefined}
            className={spaceClasses.length > 0 ? spaceClasses.join(" ") : undefined}
          >
            {" "}
          </span>
        )}
      </span>
    );
  });
  return (
    <div ref={rootRef} data-testid="ts-target" className="relative tracking-wide">
      <div data-ts-visual aria-hidden="true" className="h-[4.875em] overflow-hidden">
        {nodes}
      </div>
      <span className="sr-only">{run.words.join(" ")}</span>
    </div>
  );
}
