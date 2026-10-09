"use client";

import type { KeyboardEvent } from "react";

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl or Cmd + Enter. */
  onRun: () => void;
  disabled: boolean;
}

/**
 * The first editor, and the phone one: a monospace textarea. Tab inserts two spaces instead of
 * leaving the field, and Ctrl or Cmd + Enter runs. T7-4 swaps in CodeMirror through the stage's
 * `editor` slot with these same props.
 */
export function TextareaEditor({ value, onChange, onRun, disabled }: EditorProps) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
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
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      rows={14}
      className="block min-h-48 w-full resize-y rounded-lg border border-(--border) bg-black/50 p-3 font-mono text-[13px] leading-5 text-(--foreground) outline-none focus-visible:border-[#4ade80]"
    />
  );
}
