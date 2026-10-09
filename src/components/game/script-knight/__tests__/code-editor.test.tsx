import { EditorView } from "@codemirror/view";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "../code-editor";
import { STARTER } from "../starter";

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof CodeEditor>[0]> = {}) {
  const onChange = vi.fn();
  const onRun = vi.fn();
  const onSyntaxError = vi.fn();
  const props = { value: STARTER, onChange, onRun, onSyntaxError, disabled: false, ...overrides };
  const view = render(<CodeEditor {...props} />);
  const dom = view.container.querySelector(".cm-editor") as HTMLElement;
  const editor = EditorView.findFromDOM(dom) as EditorView;
  return {
    ...view,
    props,
    onChange,
    onRun,
    onSyntaxError,
    editor,
    rerenderWith: (next: object) => view.rerender(<CodeEditor {...props} {...next} />),
  };
}

describe("CodeEditor", () => {
  it("shows the text, labelled like the textarea, with line numbers", () => {
    const { editor, container } = setup();
    expect(editor.state.doc.toString()).toBe(STARTER);
    expect(screen.getByLabelText("Your Player code (JavaScript)")).toBeTruthy();
    expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
  });

  it("reports a user edit, but not a value written in from the props", () => {
    const { editor, onChange, rerenderWith } = setup();
    act(() => {
      editor.dispatch({ changes: { from: 0, insert: "// hi\n" } });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(`// hi\n${STARTER}`);
    rerenderWith({ value: "const a = 1;" });
    expect(editor.state.doc.toString()).toBe("const a = 1;");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("runs on Ctrl or Cmd + Enter", () => {
    const { container, onRun } = setup();
    const content = container.querySelector(".cm-content") as HTMLElement;
    fireEvent.keyDown(content, { key: "Enter", code: "Enter", ctrlKey: true });
    // "Mod" is Ctrl off a Mac and Cmd on one; jsdom reports no Mac, so Ctrl is what binds here.
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("marks the first syntax error, reports its line and clears it when fixed", () => {
    const { editor, onSyntaxError, container } = setup();
    expect(onSyntaxError).toHaveBeenLastCalledWith(null);
    act(() => {
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: "class Player {\n  playTurn(w) {\n    let x = ;\n  }\n}\n",
        },
      });
    });
    expect(onSyntaxError).toHaveBeenLastCalledWith(expect.objectContaining({ line: 3 }));
    expect(container.querySelector(".cm-syntax-mark")).not.toBeNull();
    expect(container.querySelector(".cm-syntax-line")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Syntax error on line 3");
    act(() => {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: STARTER } });
    });
    expect(onSyntaxError).toHaveBeenLastCalledWith(null);
    expect(container.querySelector(".cm-syntax-mark")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("starts with the caret the textarea had", () => {
    const { editor } = setup({ initialSelection: { anchor: 3, head: 7 } });
    expect(editor.state.selection.main.anchor).toBe(3);
    expect(editor.state.selection.main.head).toBe(7);
  });

  it("is read-only while a run is going", () => {
    const { editor, rerenderWith } = setup();
    expect(editor.state.readOnly).toBe(false);
    rerenderWith({ disabled: true });
    expect(editor.state.readOnly).toBe(true);
    rerenderWith({ disabled: false });
    expect(editor.state.readOnly).toBe(false);
  });

  it("tells the page there is no syntax error left when it unmounts", () => {
    const { unmount, onSyntaxError } = setup({ value: "let = ;" });
    expect(onSyntaxError).toHaveBeenLastCalledWith(expect.objectContaining({ line: 1 }));
    unmount();
    expect(onSyntaxError).toHaveBeenLastCalledWith(null);
  });
});
