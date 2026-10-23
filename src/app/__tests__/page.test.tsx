import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import Home, { revalidate } from "../page";
import { combinedMonthlyUsers, formatUsersFloor, usersFloorInThousands } from "@/lib/user-reach";

const { fetchAllMAU, seen } = vi.hoisted(() => ({
  fetchAllMAU: vi.fn(),
  seen: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("@/lib/ga4", () => ({ fetchAllMAU }));
vi.mock("@/lib/github", () => ({
  fetchRepoStats: vi.fn().mockResolvedValue({ stars: 1, forks: 1 }),
  fetchContributionGraph: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/blog", () => ({ getAllBlogPosts: vi.fn(() => []) }));
vi.mock("@/components/three/loader", () => ({ GeometricBackgroundLoader: () => null }));
vi.mock("@/components/three/background-fx", () => ({ BackgroundFX: () => null }));
// Each section records the props the page hands it; the markup is not under test.
vi.mock("@/components/sections", () => {
  const section = (name: string) => (props: Record<string, unknown>) => {
    seen[name] = props;
    return null;
  };
  return Object.fromEntries(
    [
      "Hero",
      "ProofBar",
      "Work",
      "Services",
      "Reviews",
      "OpenSource",
      "Background",
      "Experience",
      "Game",
      "Blog",
      "BeyondCode",
      "Faq",
      "Contact",
    ].map((name) => [name, section(name)]),
  );
});

const NO_READING = { shorty: null, unotes: null, caramel: null, upup: null, getitdone: null };

describe("home page", () => {
  beforeEach(() => {
    fetchAllMAU.mockReset();
    for (const key of Object.keys(seen)) delete seen[key];
  });

  // The build prerender has no GA4 or GitHub credentials, so it bakes mauFallback and
  // unauthenticated GitHub data. 300 s is shorter than the gap between a build and the first
  // request of the container it ships in, so that request regenerates the page with the runtime env.
  it("regenerates every five minutes so the build-time prerender is replaced soon after boot", () => {
    expect(revalidate).toBe(300);
  });

  it("hands the live GA4 readings to the Work cards and derives the hero and experience figures from them", async () => {
    const live = { shorty: 120000, unotes: 192100, caramel: 3000, upup: 10, getitdone: 5 };
    fetchAllMAU.mockResolvedValue(live);
    render(await Home());

    const total = 120000 + 192100 + 3000 + 10 + 5;
    expect(seen.Work).toEqual({ mauData: live });
    expect(seen.ProofBar).toEqual({ usersK: usersFloorInThousands(total) });
    expect(seen.Experience).toEqual({ combinedUsers: formatUsersFloor(total) });
    expect(usersFloorInThousands(total)).toBe(310);
  });

  it("falls back to the mauFallback totals when GA4 has no readings", async () => {
    fetchAllMAU.mockResolvedValue(NO_READING);
    render(await Home());

    const fallbackTotal = combinedMonthlyUsers();
    expect(seen.Work).toEqual({ mauData: NO_READING });
    expect(seen.ProofBar).toEqual({ usersK: usersFloorInThousands(fallbackTotal) });
    expect(seen.Experience).toEqual({ combinedUsers: formatUsersFloor(fallbackTotal) });
  });
});
