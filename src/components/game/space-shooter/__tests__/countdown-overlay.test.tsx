import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CountdownOverlay, countdownVisible } from "../countdown-overlay";

afterEach(cleanup);

describe("CountdownOverlay", () => {
  it("shows the step in a status region on the armed screen", () => {
    render(<CountdownOverlay step={2} status="armed" panelOpen={false} />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("assertive");
    expect(region.textContent).toBe("2");
    expect(region.className).toContain("pointer-events-none");
  });

  it("is absent when not counting, off the armed screen, or behind a panel", () => {
    for (const [step, status, panel] of [
      [null, "armed", false],
      [3, "playing", false],
      [3, "dead", false],
      [3, "armed", true],
    ] as const) {
      const { container } = render(
        <CountdownOverlay step={step} status={status} panelOpen={panel} />,
      );
      expect(container.firstChild).toBeNull();
      expect(countdownVisible(step, status, panel)).toBe(false);
      cleanup();
    }
  });

  it("is mounted in the game outside the playing-only HUD fragment", () => {
    const src = readFileSync(join(__dirname, "..", "..", "space-shooter.tsx"), "utf8");
    const hud = src.indexOf("In-canvas HUD");
    const at = src.indexOf("<CountdownOverlay");
    expect(hud).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(hud);
    // The run-only HUD fragment has closed before the overlay is mounted.
    expect(src.slice(hud, at)).toMatch(/<\/>\s*\)\}/);
  });
});
