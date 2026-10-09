"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { SENTINEL, REJECTED_TYPES, diffInput } from "./engine/input";
import type { Op } from "./engine/types";
import { createRain, rainTarget, tickRain, typeRain, type RainState } from "./engine/rain";

/** A frame never advances the rain by more than this, so a stall cannot drop words on the floor. */
const MAX_DT_MS = 50;

export interface RainOptions {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Called once per run, when the last life goes. */
  onOver: (rain: RainState, bulk: number) => void;
}

export interface RainApi {
  rain: RainState;
  /** Bumps on every change; the view re-renders from it. */
  version: number;
  /** What has been typed towards a falling word. */
  buffer: string;
  /** The last letter matched no falling word. */
  invalid: boolean;
  /** Input events that put several letters in at once (suggestions, swipe typing). */
  bulk: number;
  /** The input has had focus at least once this run. */
  started: boolean;
  /** Ticking: started, the input is focused, the tab is visible, and the run is on. */
  active: boolean;
  /** Types a letter as if it had come through the input; for the key that resumes a run. */
  press: (ch: string) => void;
  /** A fresh run from a seed. `keepStarted` carries "started" over, as Play again does. */
  reset: (seed: number, keepStarted: boolean) => void;
}

/**
 * Holds one rain run: the rAF loop, the hidden input and the buffer. The loop stops while the
 * tab is hidden or the input has lost focus, so a paused run can neither bank nor lose
 * anything. The run mutates in place; `version` is what re-renders the view.
 */
export function useRain(initialSeed: number, { inputRef, onOver }: RainOptions): RainApi {
  const [rain, setRain] = useState(() => createRain(initialSeed));
  const rainRef = useRef(rain);
  const [version, setVersion] = useState(0);
  const bufferRef = useRef("");
  const [buffer, setBuffer] = useState("");
  const [invalid, setInvalid] = useState(false);
  const invalidRef = useRef(false);
  const bulkRef = useRef(0);
  const [bulk, setBulk] = useState(0);
  const [started, setStarted] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const overRef = useRef(false);
  const lastValue = useRef(SENTINEL);
  // Between compositionstart and compositionend the keyboard owns the input value.
  const composingRef = useRef(false);
  const onOverRef = useRef(onOver);

  useEffect(() => {
    onOverRef.current = onOver;
  }, [onOver]);

  const setBuf = useCallback(
    (next: string, bad: boolean) => {
      bufferRef.current = next;
      invalidRef.current = bad;
      setBuffer(next);
      setInvalid(bad);
      // While composing the keyboard owns the value (writing it makes some keyboards re-insert
      // text), so it is left alone and re-synced at compositionend.
      if (composingRef.current) return;
      const el = inputRef.current;
      const value = SENTINEL + next;
      if (el && el.value !== value) {
        el.value = value;
        el.setSelectionRange(value.length, value.length);
      }
      lastValue.current = value;
    },
    [inputRef],
  );

  const reset = useCallback(
    (seed: number, keepStarted: boolean) => {
      const fresh = createRain(seed);
      rainRef.current = fresh;
      overRef.current = false;
      composingRef.current = false;
      bulkRef.current = 0;
      setBulk(0);
      setRain(fresh);
      if (!keepStarted) setStarted(false);
      setBuf("", false);
      setVersion((v) => v + 1);
    },
    [setBuf],
  );

  // Focus starts the run and blur pauses it; the tab being hidden pauses it too.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onFocus = () => {
      setFocused(true);
      setStarted(true);
    };
    const onBlur = () => setFocused(false);
    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    if (document.activeElement === el) onFocus();
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
    };
  }, [inputRef]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const applyOps = useCallback(
    (ops: Op[], bulkInsert: boolean) => {
      const r = rainRef.current;
      let buf = bufferRef.current;
      let bad = invalidRef.current;
      for (const op of ops) {
        if (op.kind === "char") {
          buf += op.ch;
          const result = typeRain(r, buf);
          if (result.cleared) {
            buf = "";
            bad = false;
          } else {
            bad = !result.valid;
          }
        } else if (op.kind === "back") {
          buf = buf.slice(0, -1);
          bad = buf !== "" && rainTarget(r, buf) === null;
        } else {
          buf = "";
          bad = false;
        }
      }
      if (bulkInsert && ops.length > 0) {
        bulkRef.current++;
        setBulk(bulkRef.current);
      }
      setBuf(buf, bad);
      setVersion((v) => v + 1);
    },
    [setBuf],
  );

  // A printable key that wakes a paused run is typed input, as in the timed modes. A fresh run
  // has nothing on screen yet, so its starting key would only be a miss and is dropped.
  const press = useCallback(
    (ch: string) => {
      const r = rainRef.current;
      if (r.status === "over" || r.words.length === 0) return;
      applyOps([ch === " " ? { kind: "space" } : { kind: "char", ch }], false);
    },
    [applyOps],
  );

  // The hidden input holds SENTINEL plus the buffer, so Backspace on an empty buffer still fires.
  // While an IME composes, letters score live from the diff against the last value seen, but the
  // value itself is never written; compositionend settles any remainder and re-syncs the value.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const settle = (inputType: string) => {
      const r = rainRef.current;
      const diff = diffInput(lastValue.current, el.value, inputType);
      if (diff.rejected || r.status === "over") {
        setBuf(bufferRef.current, invalidRef.current);
        return;
      }
      applyOps(diff.ops, diff.bulk);
      // The value was not rewritten while composing, so it is what the next diff starts from.
      if (composingRef.current) lastValue.current = el.value;
    };
    const onInput = (e: Event) => {
      settle((e as InputEvent).inputType || "insertText");
    };
    const onCompositionStart = () => {
      composingRef.current = true;
    };
    const onCompositionEnd = () => {
      composingRef.current = false;
      settle("insertCompositionText");
    };
    const onBeforeInput = (e: Event) => {
      if (REJECTED_TYPES.includes((e as InputEvent).inputType)) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !composingRef.current && !e.isComposing) setBuf("", false);
    };
    const refuse = (e: Event) => e.preventDefault();
    el.addEventListener("input", onInput);
    el.addEventListener("compositionstart", onCompositionStart);
    el.addEventListener("compositionend", onCompositionEnd);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("paste", refuse);
    el.addEventListener("drop", refuse);
    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionend", onCompositionEnd);
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("paste", refuse);
      el.removeEventListener("drop", refuse);
    };
  }, [inputRef, setBuf, applyOps]);

  const active = started && focused && visible && rain.status === "running";
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    let id = 0;
    const frame = () => {
      const now = performance.now();
      const r = rainRef.current;
      tickRain(r, Math.min(MAX_DT_MS, now - last));
      last = now;
      // A buffer whose word has fallen away is dropped, unless the last letter was a typo.
      if (
        !composingRef.current &&
        bufferRef.current !== "" &&
        !invalidRef.current &&
        rainTarget(r, bufferRef.current) === null
      ) {
        setBuf("", false);
      }
      setVersion((v) => v + 1);
      if (r.status === "over") {
        if (!overRef.current) {
          overRef.current = true;
          onOverRef.current(r, bulkRef.current);
        }
        return;
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [active, setBuf]);

  return { rain, version, buffer, invalid, bulk, started, active, press, reset };
}
