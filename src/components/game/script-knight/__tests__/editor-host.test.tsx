import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CodeEditorProps } from "../code-editor";
import { EditorHost } from "../editor-host";
import type { EditorProps } from "../textarea-editor";

vi.mock("../code-editor", () => ({
  CodeEditor: (props: CodeEditorProps) => (
    <div
      data-testid="fake-cm"
      data-selection={JSON.stringify(props.initialSelection ?? null)}
      data-focus={String(props.focusOnMount ?? false)}
    >
      {props.value}
    </div>
  ),
}));

function finePointer() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: fine)",
    media: query,
  }));
}

function props(overrides: Partial<EditorProps> = {}): EditorProps {
  return {
    value: "class Player {}",
    onChange: vi.fn(),
    onRun: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EditorHost on a fine pointer", () => {
  it("paints the textarea first, then swaps in the code editor with the same text", async () => {
    finePointer();
    render(<EditorHost {...props({ value: "let a = 1;" })} />);
    const first = screen.getByLabelText("Your Player code (JavaScript)") as HTMLTextAreaElement;
    expect(first.value).toBe("let a = 1;");
    const swapped = await screen.findByTestId("fake-cm");
    expect(swapped.textContent).toBe("let a = 1;");
    expect(screen.queryByLabelText("Your Player code (JavaScript)")).toBeNull();
  });

  it("hands the caret and focus over", async () => {
    finePointer();
    const { container } = render(<EditorHost {...props({ value: "abcdef" })} />);
    const field = container.querySelector("textarea") as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(2, 4);
    const swapped = await screen.findByTestId("fake-cm");
    expect(JSON.parse(swapped.dataset.selection ?? "null")).toEqual({ anchor: 2, head: 4 });
    expect(swapped.dataset.focus).toBe("true");
  });

  it("does not swap after it has unmounted", async () => {
    finePointer();
    const view = render(<EditorHost {...props()} />);
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("fake-cm")).toBeNull();
  });
});
