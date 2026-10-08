export type Content = "words" | "quotes";
export type Seconds = 15 | 30 | 60 | 120;
export type RunConfig =
  | { kind: "time"; seconds: Seconds; content: Content; seed: number }
  | { kind: "text"; text: string };
export type Op =
  { kind: "char"; ch: string } | { kind: "space" } | { kind: "back" } | { kind: "backWord" };
export interface Keystroke {
  /** ms since the first keystroke (the first is 0). */
  t: number;
  kind: Op["kind"];
  /** The typed character (char ops). */
  ch?: string;
  /** What was expected: a letter, " " for a space, "" for an extra letter. Absent for back ops. */
  expected?: string;
  /** Char and space ops only; back ops are never counted for accuracy. */
  correct?: boolean;
  word: number;
}
export interface TypingRun {
  config: RunConfig;
  words: string[];
  typed: string[];
  cursor: number;
  startedAt: number | null;
  endedAt: number | null;
  status: "ready" | "running" | "done";
  log: Keystroke[];
  /** Input events that inserted more than one letter at once (phone suggestions, autocorrect). */
  bulk: number;
  /** Next index to draw from a timed run's seeded stream (a word or a passage). */
  supply: number;
}
