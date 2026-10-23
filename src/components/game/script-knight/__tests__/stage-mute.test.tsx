import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SOUND_KEY } from "../audio";
import { Stage } from "../stage";

// The Sound on / Sound off button reads the stored preference ("knight:sound" = "0" is muted)
// once the stage is on the page, and a toggle writes it back. The real audio facade runs; it
// opens no AudioContext until a run starts.
beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("Stage sound toggle", () => {
  it("starts on when nothing is stored", () => {
    render(<Stage />);
    expect(screen.getByRole("button", { name: "Sound on" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("starts off when the stored preference is muted", () => {
    localStorage.setItem(SOUND_KEY, "0");
    render(<Stage />);
    expect(screen.getByRole("button", { name: "Sound off" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggles off and on, writing the preference each time", () => {
    render(<Stage />);
    fireEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(screen.getByRole("button", { name: "Sound off" })).toBeInTheDocument();
    expect(localStorage.getItem(SOUND_KEY)).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Sound off" }));
    expect(screen.getByRole("button", { name: "Sound on" })).toBeInTheDocument();
    expect(localStorage.getItem(SOUND_KEY)).toBe("1");
  });

  it("keeps the toggle's state after the page's stored value changes underneath it", () => {
    localStorage.setItem(SOUND_KEY, "0");
    render(<Stage />);
    fireEvent.click(screen.getByRole("button", { name: "Sound off" }));
    expect(screen.getByRole("button", { name: "Sound on" })).toBeInTheDocument();
    localStorage.setItem(SOUND_KEY, "0");
    fireEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(screen.getByRole("button", { name: "Sound off" })).toBeInTheDocument();
  });

  it("renders the server markup as sound on, whatever is stored", () => {
    localStorage.setItem(SOUND_KEY, "0");
    const html = renderToString(<Stage />);
    expect(html).toContain("Sound on");
    expect(html).not.toContain("Sound off");
  });
});
