import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { emptyStats, recordRun } from "../../stats/stats";
import { StatsPanel } from "../stats-panel";

afterEach(cleanup);

describe("StatsPanel", () => {
  it("says no runs yet for empty stats", () => {
    const { container } = render(<StatsPanel stats={emptyStats()} today="2026-10-08" />);
    expect(container.textContent).toContain("No runs yet");
  });

  it("shows the best time as mm:ss and the streak with a singular label", () => {
    const s = recordRun(emptyStats(), { ms: 731_000, daily: true, day: "2026-10-08", seed: 1 });
    const { container } = render(<StatsPanel stats={s} today="2026-10-08" />);
    expect(container.textContent).toContain("12:11");
    expect(container.textContent).toContain("1-day streak");
  });

  it("pluralizes the streak and drops it once a day is missed", () => {
    let s = recordRun(emptyStats(), { ms: 5000, daily: true, day: "2026-10-07", seed: 1 });
    s = recordRun(s, { ms: 5000, daily: true, day: "2026-10-08", seed: 2 });
    const live = render(<StatsPanel stats={s} today="2026-10-08" />);
    expect(live.container.textContent).toContain("2-day streak");
    live.unmount();
    const dead = render(<StatsPanel stats={s} today="2026-10-12" />);
    expect(dead.container.textContent).toContain("0-day streak");
  });
});
