import type { TypingRun } from "./engine/types";

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

function letterState(word: string, typed: string, j: number, committed: boolean): LetterState {
  if (j >= word.length) return "extra";
  if (j < typed.length) return typed[j] === word[j] ? "correct" : "wrong";
  return committed ? "skipped" : "untyped";
}

/**
 * The words of a run, one inline-block span per word so a word never breaks
 * mid-way. Letters carry data-state; the caret sits on the next letter, or on
 * the space after a fully typed word. A screen reader gets the plain text.
 */
export function TextView({ run, caret }: { run: TypingRun; caret: boolean }) {
  const playing = caret && run.status !== "done";
  const nodes = run.words.map((word, i) => {
    const typed = run.typed[i] ?? "";
    const committed = i < run.cursor;
    const letters = [...word, ...typed.slice(word.length)];
    const caretAt = playing && i === run.cursor ? typed.length : -1;
    return (
      <span key={i}>
        <span className="inline-block">
          {letters.map((ch, j) => {
            const state = letterState(word, typed, j, committed);
            const shown = state === "extra" ? (typed[j] ?? ch) : ch;
            return (
              <span
                key={j}
                data-state={state}
                data-ts-caret={j === caretAt ? "" : undefined}
                className={
                  j === caretAt ? [LETTER_CLASS[state], CARET_CLASS].join(" ") : LETTER_CLASS[state]
                }
              >
                {shown}
              </span>
            );
          })}
        </span>
        {i < run.words.length - 1 && (
          <span
            data-ts-caret={caretAt >= letters.length ? "" : undefined}
            className={caretAt >= letters.length ? CARET_CLASS : undefined}
          >
            {" "}
          </span>
        )}
      </span>
    );
  });
  return (
    <div data-testid="ts-target" className="relative tracking-wide">
      <div data-ts-visual aria-hidden="true">
        {nodes}
      </div>
      <span className="sr-only">{run.words.join(" ")}</span>
    </div>
  );
}
