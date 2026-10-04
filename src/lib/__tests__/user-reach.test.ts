import { describe, it, expect } from "vitest";
import { combinedMonthlyUsers, usersFloorInThousands, formatUsersFloor } from "../user-reach";
import { projects } from "@/data/projects";

describe("combinedMonthlyUsers", () => {
  it("sums every project's fallback when no live data is given", () => {
    const expected = projects.reduce((sum, p) => sum + p.mauFallback, 0);
    expect(combinedMonthlyUsers()).toBe(expected);
  });

  it("prefers a live figure per slug and falls back for null or missing slugs", () => {
    const [first, second] = projects;
    if (!first || !second) throw new Error("expected at least two projects");
    const live = { [first.slug]: 1000, [second.slug]: null };
    const expected = projects.reduce(
      (sum, p) => sum + (p.slug === first.slug ? 1000 : p.mauFallback),
      0,
    );
    expect(combinedMonthlyUsers(live)).toBe(expected);
  });
});

describe("usersFloorInThousands", () => {
  it("rounds down to the nearest 10K at or above 100K", () => {
    expect(usersFloorInThousands(203_500)).toBe(200);
    expect(usersFloorInThousands(219_999)).toBe(210);
    expect(usersFloorInThousands(100_000)).toBe(100);
  });

  it("rounds down to the nearest 1K below 100K", () => {
    expect(usersFloorInThousands(99_999)).toBe(99);
    expect(usersFloorInThousands(31_900)).toBe(31);
  });
});

describe("formatUsersFloor", () => {
  it("renders the floor with a K+ suffix", () => {
    expect(formatUsersFloor(203_500)).toBe("200K+");
  });
});
