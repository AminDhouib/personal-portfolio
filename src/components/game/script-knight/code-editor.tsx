"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  RangeSet,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef, useState } from "react";

import type { EditorProps } from "./textarea-editor";
import { SURFACE_COLORS } from "./surface";
import { findSyntaxError } from "./syntax-check";
import type { SyntaxIssue } from "./syntax-line";

// This module and syntax-check.ts are the only ones that import CodeMirror, and the editor host
// loads this one with a dynamic import() on a fine pointer: it is its own chunk. A test pins that.

export interface CodeEditorProps extends EditorProps {
  /** Where the textarea's caret was when it handed over. */
  initialSelection?: { anchor: number; head: number } | null;
  /** The textarea had focus when it handed over. */
  focusOnMount?: boolean;
}

/** Marks a transaction that writes the prop back into the editor, which is not a user edit. */
const fromProps = Annotation.define<boolean>();

class SyntaxMarker extends GutterMarker {
  constructor(private readonly className: string) {
    super();
  }

  override toDOM(): Node {
    const mark = document.createElement("span");
    mark.className = this.className;
    mark.textContent = "!";
    mark.title = "Syntax error";
    return mark;
  }
}
const MARKER = new SyntaxMarker("cm-syntax-mark");
/** Reserves the gutter's width while no line is marked. */
const SPACER = new SyntaxMarker("cm-syntax-spacer cm-syntax-mark-width");
const LINE_ERROR = Decoration.line({ class: "cm-syntax-line" });

interface SyntaxState {
  issue: SyntaxIssue | null;
  markers: RangeSet<GutterMarker>;
}

function checkSyntax(state: EditorState): SyntaxState {
  const issue = findSyntaxError(state.doc.toString());
  if (!issue) return { issue: null, markers: RangeSet.empty };
  const line = state.doc.lineAt(Math.min(issue.from, state.doc.length));
  return { issue, markers: RangeSet.of([MARKER.range(line.from)]) };
}

const syntaxField = StateField.define<SyntaxState>({
  create: checkSyntax,
  update: (value, tr) => (tr.docChanged ? checkSyntax(tr.state) : value),
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const { issue } = state.field(field);
      if (!issue) return Decoration.none;
      const line = state.doc.lineAt(Math.min(issue.from, state.doc.length));
      return Decoration.set([LINE_ERROR.range(line.from)]);
    }),
});

/** Every colour the editor draws, so a test can hold them to 4.5:1 on the game surface. */
export const CODE_COLORS = {
  background: SURFACE_COLORS.background,
  text: SURFACE_COLORS.text,
  lineNumbers: SURFACE_COLORS.muted,
  caret: "#4ade80",
  keyword: "#c4b5fd",
  string: "#86efac",
  number: "#fcd34d",
  comment: "#8b949e",
  functionName: "#7dd3fc",
  definition: "#fda4af",
  property: "#e5e7eb",
  punctuation: "#a1a1aa",
  error: "#f87171",
} as const;

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword],
    color: CODE_COLORS.keyword,
  },
  { tag: [tags.string, tags.special(tags.string)], color: CODE_COLORS.string },
  { tag: [tags.number, tags.bool, tags.null], color: CODE_COLORS.number },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: CODE_COLORS.comment,
    fontStyle: "italic",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: CODE_COLORS.functionName,
  },
  { tag: [tags.definition(tags.variableName), tags.className], color: CODE_COLORS.definition },
  { tag: tags.propertyName, color: CODE_COLORS.property },
  { tag: [tags.operator, tags.punctuation], color: CODE_COLORS.punctuation },
]);

// The same fixed dark surface as the textarea and the rest of the game (surface.ts), in both site
// themes, so the editor never inherits the page's light tokens.
const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: CODE_COLORS.background,
      color: CODE_COLORS.text,
      fontSize: "13px",
      border: `1px solid ${SURFACE_COLORS.border}`,
      borderRadius: "0.5rem",
    },
    "&.cm-focused": { outline: "none", borderColor: CODE_COLORS.caret },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: "20px",
      minHeight: "280px",
      maxHeight: "60vh",
    },
    ".cm-content": { caretColor: CODE_COLORS.caret, padding: "12px 0" },
    ".cm-cursor": { borderLeftColor: CODE_COLORS.caret },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: CODE_COLORS.lineNumbers,
      border: "none",
    },
    ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
      { backgroundColor: "rgb(74 222 128 / 0.25)" },
    ".cm-syntax-line": {
      textDecoration: `underline wavy ${CODE_COLORS.error}`,
      textUnderlineOffset: "3px",
    },
    ".cm-syntax-mark, .cm-syntax-spacer": {
      color: CODE_COLORS.error,
      fontWeight: "700",
      paddingLeft: "4px",
    },
    ".cm-syntax-gutter": { width: "14px" },
  },
  { dark: true },
);

/**
 * CodeMirror 6, the minimal set: line numbers, history, bracket matching, indent on input,
 * highlighting, the JavaScript language, Tab indents (Escape then Tab leaves the editor, which
 * CodeMirror handles itself), Ctrl or Cmd + Enter runs, and a gutter marker with a wavy line on
 * the first syntax error. The text lives in the page: `value` is written in when it differs and
 * `onChange` fires on every user edit.
 */
export function CodeEditor({
  value,
  onChange,
  onRun,
  disabled,
  onSyntaxError,
  initialSelection,
  focusOnMount,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onRun, onSyntaxError });
  const lock = useRef(new Compartment());
  const [issue, setIssue] = useState<SyntaxIssue | null>(null);

  useEffect(() => {
    handlers.current = { onChange, onRun, onSyntaxError };
  });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const selection = initialSelection
      ? EditorSelection.single(
          Math.min(initialSelection.anchor, value.length),
          Math.min(initialSelection.head, value.length),
        )
      : undefined;
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        selection,
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  handlers.current.onRun();
                  return true;
                },
              },
            ]),
          ),
          lineNumbers(),
          gutter({
            class: "cm-syntax-gutter",
            markers: (v) => v.state.field(syntaxField).markers,
            initialSpacer: () => SPACER,
          }),
          history(),
          bracketMatching(),
          indentOnInput(),
          syntaxHighlighting(highlightStyle),
          javascript(),
          syntaxField,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          theme,
          EditorView.contentAttributes.of({
            "aria-label": "Your Player code (JavaScript)",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          lock.current.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((t) => t.annotation(fromProps))) {
              handlers.current.onChange(update.state.doc.toString());
            }
            const before = update.startState.field(syntaxField).issue;
            const after = update.state.field(syntaxField).issue;
            if (before !== after) {
              setIssue(after);
              handlers.current.onSyntaxError?.(after);
            }
          }),
        ],
      }),
    });
    view.current = editor;
    const first = editor.state.field(syntaxField).issue;
    setIssue(first);
    handlers.current.onSyntaxError?.(first);
    if (focusOnMount) editor.focus();
    return () => {
      handlers.current.onSyntaxError?.(null);
      editor.destroy();
      view.current = null;
    };
    // Mounted once: later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: fromProps.of(true),
    });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: lock.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
  }, [disabled]);

  return (
    <div>
      <div ref={host} data-testid="code-editor" />
      <p role="status" className={issue ? "mt-1 text-xs text-red-300" : "sr-only"}>
        {issue ? `Syntax error on line ${issue.line}` : ""}
      </p>
    </div>
  );
}
