"use client";

import { type KeyboardEvent, useRef } from "react";
import { GAME_SURFACE } from "./surface";

import type { SyntaxIssue } from "./syntax-line";

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl or Cmd + Enter. */
  onRun: () => void;
  disabled: boolean;
  /**
   * The code editor reports where its own parse found a syntax error (null when there is none),
   * so a Run can name the line. The textarea never calls this.
   */
  onSyntaxError?: (issue: SyntaxIssue | null) => void;
}

/**
 * The first editor, and the phone one: a monospace textarea. Tab inserts two spaces instead of
 * leaving the field, unless Escape was pressed just before it (then Tab moves on, so the field is
 * not a keyboard trap), and Ctrl or Cmd + Enter runs. On a desktop pointer the editor host swaps
 * in CodeMirror with these same props once it has loaded.
 */
export function TextareaEditor({ value, onChange, onRun, disabled }: EditorProps) {
  // Set by Escape and cleared by the next key, so Escape then Tab leaves the field.
  const escapedRef = useRef(false);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const escaped = escapedRef.current;
    escapedRef.current = event.key === "Escape";
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun();
      return;
    }
    if (event.key === "Tab" && !escaped && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const field = event.currentTarget;
      const { selectionStart, selectionEnd } = field;
      onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`);
      // Put the caret after the two spaces once React has written the new value.
      requestAnimationFrame(() => {
        field.selectionStart = selectionStart + 2;
        field.selectionEnd = selectionStart + 2;
      });
    }
  }

  return (
    <textarea
      aria-label="Your Player code (JavaScript)"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        escapedRef.current = false;
      }}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      rows={14}
      className={`block min-h-48 w-full resize-y rounded-lg border border-(--border) p-3 font-mono text-[13px] leading-5 outline-none focus-visible:border-[#4ade80] ${GAME_SURFACE}`}
    />
  );
}
