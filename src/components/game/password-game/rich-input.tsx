"use client";

import { useCallback, useRef, useState } from "react";
import type { CharFormatting, FormattingMap } from "./types";
import { Bold, Italic } from "lucide-react";

export interface RichInputChangeEvent {
  value: string;
  formatting: FormattingMap;
}

interface Props {
  value: string;
  formatting: FormattingMap;
  onChange: (e: RichInputChangeEvent) => void;
  placeholder?: string;
  onDestructiveKey?: () => void;
}

export function RichInput({ value, formatting, onChange, placeholder, onDestructiveKey }: Props) {
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Fire callback only when the key would actually remove text (there's
      // something to delete), not on empty-input Backspace spam.
      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        value.length > 0 &&
        onDestructiveKey
      ) {
        onDestructiveKey();
      }
    },
    [value.length, onDestructiveKey]
  );

  const handleSelect = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    setSelection({ start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      // If the password got longer, pad formatting with empty entries.
      // If shorter, truncate.
      const nextLen = [...next].length;
      const nextFmt = formatting.slice(0, nextLen);
      while (nextFmt.length < nextLen) nextFmt.push({});
      onChange({ value: next, formatting: nextFmt });
    },
    [formatting, onChange]
  );

  const applyAttr = useCallback(
    (attr: "bold" | "italic") => {
      const sel = selection ?? { start: 0, end: [...value].length };
      const start = Math.min(sel.start, sel.end);
      const end = Math.max(sel.start, sel.end);
      if (start === end) return;

      // Determine toggle: if every char in range already has the attribute, clear it.
      const allHave = [...Array(end - start)].every(
        (_, i) => formatting[start + i]?.[attr]
      );
      const next = applyFormatRange(formatting, start, end, {
        [attr]: allHave ? false : true,
      });
      onChange({ value, formatting: next });
    },
    [selection, value, formatting, onChange]
  );

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => applyAttr("bold")}
          className="inline-flex items-center gap-1 rounded border border-(--border) px-2 py-1 text-xs hover:bg-(--background)"
          title="Bold selection (or all)"
        >
          <Bold className="h-3.5 w-3.5" />
          Bold
        </button>
        <button
          type="button"
          onClick={() => applyAttr("italic")}
          className="inline-flex items-center gap-1 rounded border border-(--border) px-2 py-1 text-xs hover:bg-(--background)"
          title="Italic selection (or all)"
        >
          <Italic className="h-3.5 w-3.5" />
          Italic
        </button>
      </div>
      <div className="relative">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleTextChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-(--border) bg-(--background) px-4 py-3 font-mono text-base text-transparent caret-(--foreground) focus:outline-none focus:border-accent-pink/60 resize-none"
          style={{ color: "transparent", caretColor: "var(--foreground)" }}
        />
        <div
          aria-hidden
          className="pg-formatted-text pointer-events-none absolute inset-0 px-4 py-3 font-mono text-base whitespace-pre-wrap break-words"
        >
          <FormattedText value={value} formatting={formatting} />
        </div>
      </div>
    </div>
  );
}

function FormattedText({ value, formatting }: { value: string; formatting: FormattingMap }) {
  const chars = [...value];
  return (
    <>
      {chars.map((ch, i) => {
        const f = formatting[i] ?? {};
        const style: React.CSSProperties = {
          fontWeight: f.bold ? 700 : 400,
          fontStyle: f.italic ? "italic" : "normal",
          color: "var(--foreground)",
        };
        return (
          <span key={i} style={style}>
            {ch}
          </span>
        );
      })}
    </>
  );
}

export function applyFormatRange(
  fmt: FormattingMap,
  start: number,
  end: number,
  attrs: Partial<CharFormatting>
): CharFormatting[] {
  const out: CharFormatting[] = [];
  const neededLen = Math.max(fmt.length, end);
  for (let i = 0; i < neededLen; i++) {
    const existing: CharFormatting = { ...(fmt[i] ?? {}) };
    if (i >= start && i < end) {
      for (const [k, v] of Object.entries(attrs) as [keyof CharFormatting, boolean | undefined][]) {
        if (v === true) existing[k] = true;
        else if (v === false) delete existing[k];
      }
    }
    out.push(existing);
  }
  return out;
}

export function countFormatted(fmt: FormattingMap, attr: keyof CharFormatting): number {
  let count = 0;
  for (const f of fmt) {
    if (f[attr]) count++;
  }
  return count;
}
