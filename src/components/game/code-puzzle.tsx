"use client";

import { useState, useCallback } from "react";
import { RotateCcw, Trophy, CheckCircle, XCircle, ArrowRight } from "lucide-react";

interface Puzzle {
  label: string;
  description: string;
  broken: string; // code with a bug highlighted via [BUG]marker[/BUG]
  options: string[];
  correct: number; // index into options
  explanation: string;
}

const PUZZLES: Puzzle[] = [
  {
    label: "Off-by-one in slice",
    description: "This function should return the last N items from an array. What's wrong?",
    broken: `function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(arr.length - n + 1);
                              // ^^^
}`,
    options: [
      "arr.slice(arr.length - n + 1)",
      "arr.slice(arr.length - n)",
      "arr.slice(-n + 1)",
      "arr.slice(0, n)",
    ],
    correct: 1,
    explanation:
      "`arr.length - n` gives the correct start index. Adding `+ 1` skips the first of the last N elements.",
  },
  {
    label: "Missing await",
    description: "Why does this always log 'undefined'?",
    broken: `async function getUser(id: string) {
  const user = fetchUser(id); // no await
  console.log(user.name);    // always undefined
}`,
    options: [
      "fetchUser() needs to be called with await",
      "console.log should be inside a .then()",
      "The function isn't declared async",
      "user.name needs optional chaining",
    ],
    correct: 0,
    explanation:
      "`fetchUser(id)` returns a Promise, not the resolved value. Without `await`, `user` is a pending Promise object, so `user.name` is always `undefined`.",
  },
  {
    label: "React stale closure",
    description:
      "The count never increments correctly — clicking multiple times fast stays at 1. Why?",
    broken: `const [count, setCount] = useState(0);

function increment() {
  setCount(count + 1); // stale closure
}`,
    options: [
      "useState should be initialized to null",
      "setCount should use the updater function form: setCount(c => c + 1)",
      "increment needs useCallback()",
      "count should be a ref, not state",
    ],
    correct: 1,
    explanation:
      "`count` is captured in the closure at render time. Multiple rapid calls all see `count = 0`. The updater form `setCount(c => c + 1)` always uses the latest queued value.",
  },
  {
    label: "SQL injection risk",
    description: "This query will work but has a critical security issue. What is it?",
    broken: `const result = await db.query(
  \`SELECT * FROM users WHERE email = '\${email}'\`
);`,
    options: [
      "Template literals can't be used for SQL queries",
      "User input is directly interpolated — SQL injection vulnerability",
      "Missing LIMIT clause",
      "Should use double quotes around the column name",
    ],
    correct: 1,
    explanation:
      "Injecting raw user input into SQL strings allows attackers to terminate the query and run arbitrary SQL. Use parameterized queries: `db.query('SELECT * FROM users WHERE email = $1', [email])`.",
  },
  {
    label: "useEffect infinite loop",
    description: "This effect runs on every render, causing an infinite loop. What's wrong?",
    broken: `useEffect(() => {
  setData(processData(data));
}); // missing dependency array`,
    options: [
      "processData should be memoized with useMemo",
      "setData should be replaced with a ref",
      "Missing [] or [data] as the dependency array",
      "useEffect can't call state setters",
    ],
    correct: 2,
    explanation:
      "Without a dependency array, `useEffect` runs after every render. `setData` triggers a re-render, which triggers the effect again — infinite loop. Adding `[]` (once) or `[data]` (on data change) fixes it.",
  },
  {
    label: "Docker CMD vs ENTRYPOINT",
    description: "This Dockerfile runs find but ignores CLI arguments passed to `docker run`. Why?",
    broken: `FROM node:20-alpine
COPY . .
RUN npm ci
CMD ["node", "server.js"]`,
    options: [
      "CMD should be on the same line as RUN",
      "Should use ENTRYPOINT instead of CMD to set the executable",
      "node should be in the PATH declaration",
      "Missing EXPOSE instruction",
    ],
    correct: 1,
    explanation:
      "`CMD` sets default arguments that are replaced entirely when you pass args to `docker run`. `ENTRYPOINT` sets the executable that always runs, and `CMD` then provides default args that can be appended or overridden.",
  },
];

type Answer = { selected: number; correct: boolean } | null;

// PUZZLES is a fixed non-empty literal and `idx` is always kept in bounds by
// `next()` below, so this fallback is a type-safety guard that never actually
// fires at runtime.
function firstOf<T>(arr: T[]): T {
  const first = arr[0];
  if (!first) throw new Error("expected a non-empty array");
  return first;
}
const FIRST_PUZZLE = firstOf(PUZZLES);

export function CodePuzzleGame() {
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<Answer>(null);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [finished, setFinished] = useState(false);

  const puzzle = PUZZLES[idx] ?? FIRST_PUZZLE;

  const handleSelect = useCallback(
    (optionIdx: number) => {
      if (answer !== null) return; // already answered
      const correct = optionIdx === puzzle.correct;
      setAnswer({ selected: optionIdx, correct });
      setTotal((t) => t + 1);
      if (correct) setScore((s) => s + 1);
    },
    [answer, puzzle.correct],
  );

  const next = useCallback(() => {
    if (idx + 1 >= PUZZLES.length) {
      setFinished(true);
    } else {
      setIdx((i) => i + 1);
      setAnswer(null);
    }
  }, [idx]);

  const reset = useCallback(() => {
    setIdx(0);
    setAnswer(null);
    setScore(0);
    setTotal(0);
    setFinished(false);
  }, []);

  if (finished) {
    const pct = Math.round((score / total) * 100);
    return (
      <div className="space-y-3 rounded-xl border border-(--border) bg-(--card) p-8 text-center">
        <div className="font-display text-5xl font-black text-accent-amber">
          {score}/{total}
        </div>
        <div className="text-base text-(--muted)">{pct}% correct</div>
        <div className="text-sm text-(--muted)">
          {pct === 100
            ? "Perfect score! You're the 10x."
            : pct >= 70
              ? "Solid. A few bugs snuck through."
              : "Bugs happen. That's why we have code review."}
        </div>
        <button
          onClick={reset}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-(--border) px-4 py-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-(--muted)">
        <span>
          Puzzle {idx + 1} / {PUZZLES.length}
        </span>
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-accent-amber" />
          <span className="font-mono text-accent-amber">
            {score}/{total}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 overflow-hidden rounded-full bg-(--surface)">
        <div
          className="h-full rounded-full bg-accent-amber transition-all"
          style={{ width: `${(idx / PUZZLES.length) * 100}%` }}
        />
      </div>

      {/* Puzzle */}
      <div className="space-y-3 rounded-xl border border-(--border) bg-(--card) p-5">
        <div className="text-xs font-medium tracking-wider text-(--muted) uppercase">
          {puzzle.label}
        </div>
        <p className="text-sm text-(--foreground)">{puzzle.description}</p>
        <pre className="overflow-x-auto rounded-lg bg-(--surface) p-4 font-mono text-xs leading-relaxed whitespace-pre text-(--foreground)/80">
          {puzzle.broken}
        </pre>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {puzzle.options.map((option, i) => {
          let cls =
            "w-full text-left rounded-lg border border-(--border) bg-(--card) px-4 py-3 text-sm transition-all hover:border-(--muted)/40 hover:bg-(--surface)";

          if (answer !== null) {
            if (i === puzzle.correct) {
              cls =
                "w-full text-left rounded-lg border border-accent-green/40 bg-accent-green/5 px-4 py-3 text-sm text-accent-green";
            } else if (i === answer.selected && !answer.correct) {
              cls =
                "w-full text-left rounded-lg border border-red-400/40 bg-red-400/5 px-4 py-3 text-sm text-red-400";
            }
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={cls}
              disabled={answer !== null}
            >
              <div className="flex items-start gap-2">
                {answer !== null && i === puzzle.correct && (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
                )}
                {answer !== null && i === answer.selected && !answer.correct && (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                )}
                <span>{option}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {answer !== null && (
        <div className="rounded-lg border border-(--border) bg-(--surface) p-4 text-sm leading-relaxed text-(--muted)">
          <span className="font-semibold text-(--foreground)">Why: </span>
          {puzzle.explanation}
        </div>
      )}

      {/* Next button */}
      {answer !== null && (
        <button
          onClick={next}
          className="rounded-lg bg-accent-blue px-5 py-2 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          {idx + 1 >= PUZZLES.length ? (
            "See results"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              Next puzzle <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
