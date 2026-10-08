import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createRun } from "../../engine/engine";
import type { EventInstance, GameState } from "../../engine/types";
import { EVENT_DEFS } from "../../engine/events/index";
import { TelegraphBanner } from "../telegraph-banner";
import { FAMILY_TINT, telegraphLabel } from "../telegraph";

afterEach(() => cleanup());

const FAMILY = new Map(EVENT_DEFS.map((d) => [d.id, d.family]));

function instance(over: Partial<EventInstance> & { defId: string }): EventInstance {
  return {
    family: FAMILY.get(over.defId)!,
    act: "act1",
    phase: "telegraph",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data: {},
    ...over,
  };
}

/** Just enough run state for the banner: it reads the event list only. */
function gameWith(...insts: (Partial<EventInstance> & { defId: string })[]): GameState {
  return { events: insts.map(instance), elapsedMs: 0 } as unknown as GameState;
}

const banner = () => screen.getByTestId("pg2-telegraph");
const announcer = () => screen.getByRole("status");
const countdown = () => banner().querySelector(".pg2-telegraph__count")!.textContent;

describe("TelegraphBanner", () => {
  it("names the incoming event with a countdown and its family", () => {
    render(<TelegraphBanner g={gameWith({ defId: "galaga", phaseElapsedMs: 4_000 })} />);
    expect(countdown()).toBe("6"); // 10s telegraph - 4s elapsed
    expect(banner().textContent).toContain(telegraphLabel("galaga"));
    expect(banner().getAttribute("data-family")).toBe("invasion");
    expect(banner().className).toContain("pg2-telegraph");
    expect(banner().style.getPropertyValue("--pg2-tg")).toBe(FAMILY_TINT.invasion);
  });

  it("shows the event that strikes soonest", () => {
    render(
      <TelegraphBanner
        g={gameWith(
          { defId: "galaga", phaseElapsedMs: 0 },
          { defId: "cookie-banner", phaseElapsedMs: 1_000 },
        )}
      />,
    );
    expect(banner().textContent).toContain(telegraphLabel("cookie-banner"));
    expect(banner().getAttribute("data-family")).toBe("chrome");
  });

  it("renders no banner and says nothing when no event is telegraphing", () => {
    render(<TelegraphBanner g={createRun({ seed: 1, daily: false })} />);
    expect(screen.queryByTestId("pg2-telegraph")).toBeNull();
    expect(announcer().textContent).toBe("");
  });

  it("announces the event once: the countdown is visual only", () => {
    const { rerender } = render(
      <TelegraphBanner g={gameWith({ defId: "infection", phaseElapsedMs: 1_000 })} />,
    );
    const said = announcer().textContent;
    expect(said).toContain(telegraphLabel("infection"));
    expect(said).not.toMatch(/\d/);
    // A later heartbeat moves the countdown but leaves the spoken text untouched.
    rerender(<TelegraphBanner g={gameWith({ defId: "infection", phaseElapsedMs: 3_000 })} />);
    expect(countdown()).toBe("5"); // 8s - 3s
    expect(announcer().textContent).toBe(said);
    expect(announcer().getAttribute("aria-live")).toBe("polite");
    // The visual banner is hidden from assistive tech so the ticking number is never read.
    expect(banner().getAttribute("aria-hidden")).toBe("true");
    expect(announcer().closest("button")).toBeNull();
  });

  it("is not over the password: it sits beside the FUEL meter when the campfire is lit", () => {
    render(
      <TelegraphBanner
        g={gameWith({ defId: "campfire", phase: "peak" }, { defId: "galaga", phaseElapsedMs: 0 })}
      />,
    );
    expect(banner().className).toContain("pg2-telegraph--beside-meter");
  });

  it("takes the whole band when no meter shares it", () => {
    render(<TelegraphBanner g={gameWith({ defId: "galaga", phaseElapsedMs: 0 })} />);
    expect(banner().className).not.toContain("pg2-telegraph--beside-meter");
  });
});
