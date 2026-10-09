import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextareaEditor } from "../textarea-editor";

afterEach(cleanup);

function setup() {
  const onChange = vi.fn();
  const onRun = vi.fn();
  render(<TextareaEditor value="ab" onChange={onChange} onRun={onRun} disabled={false} />);
  return { field: screen.getByLabelText("Your Player code (JavaScript)"), onChange, onRun };
}

describe("TextareaEditor", () => {
  it("inserts two spaces on Tab", () => {
    const { field, onChange } = setup();
    expect(fireEvent.keyDown(field, { key: "Tab" })).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("lets Tab leave the field right after Escape, and goes back to indenting after", () => {
    const { field, onChange } = setup();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(fireEvent.keyDown(field, { key: "Tab" })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(field, { key: "Tab" })).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("forgets the Escape when another key comes between it and Tab", () => {
    const { field, onChange } = setup();
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.keyDown(field, { key: "a" });
    expect(fireEvent.keyDown(field, { key: "Tab" })).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("forgets the Escape when the field loses focus", () => {
    const { field } = setup();
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(fireEvent.keyDown(field, { key: "Tab" })).toBe(false);
  });

  it("runs on Ctrl or Cmd + Enter", () => {
    const { field, onRun } = setup();
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    expect(onRun).toHaveBeenCalledTimes(2);
  });
});
