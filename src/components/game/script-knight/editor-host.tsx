"use client";

import { type ComponentType, useEffect, useRef, useState } from "react";

import { gameCrashToReport } from "@/lib/report-game-error";

import type { CodeEditorProps } from "./code-editor";
import { type EditorProps, TextareaEditor } from "./textarea-editor";

/** What the textarea hands over: where its caret was and whether it had focus. */
function handover(
  box: HTMLElement | null,
): Pick<CodeEditorProps, "initialSelection" | "focusOnMount"> {
  const field = box?.querySelector("textarea") ?? null;
  if (!field) return {};
  return {
    initialSelection: { anchor: field.selectionStart, head: field.selectionEnd },
    focusOnMount: document.activeElement === field,
  };
}

/**
 * The editor slot's default. The textarea is always the first paint and the phone editor. On a
 * fine pointer (a mouse or trackpad) it loads CodeMirror with a dynamic import after mount and
 * swaps it in with the same text, caret and focus; a coarse pointer never fetches the chunk, and
 * a failed load keeps the textarea (reported once).
 */
export function EditorHost(props: EditorProps) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    Editor: ComponentType<CodeEditorProps>;
    extra: Pick<CodeEditorProps, "initialSelection" | "focusOnMount">;
  } | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let cancelled = false;
    import("./code-editor").then(
      (module) => {
        if (cancelled) return;
        setLoaded({ Editor: module.CodeEditor, extra: handover(box.current) });
      },
      (error: unknown) => {
        const crash = gameCrashToReport("script-knight-editor", error);
        if (crash) reportError(crash);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (loaded) {
    const { Editor, extra } = loaded;
    return <Editor {...props} {...extra} />;
  }
  return (
    <div ref={box}>
      <TextareaEditor {...props} />
    </div>
  );
}
