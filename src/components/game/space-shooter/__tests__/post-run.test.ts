import { describe, it, expect } from "vitest";
import { coinBreakdown, countUp, postRunGoals, unownedCatalog } from "../post-run";
import { SHIPS, COSMETICS } from "../../shop-data";

describe("countUp", () => {
  it("is 0 at 0 ms and the target at or past the duration", () => {
    expect(countUp(1234, 0, 900)).toBe(0);
    expect(countUp(1234, 900, 900)).toBe(1234);
    expect(countUp(1234, 5000, 900)).toBe(1234);
  });

  it("is monotone and always an integer", () => {
    let prev = -1;
    for (let ms = 0; ms <= 900; ms += 30) {
      const v = countUp(777, ms, 900);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("eases out: more than half the target is shown at half the time", () => {
    expect(countUp(1000, 450, 900)).toBeGreaterThan(500);
  });

  it("handles a zero target and a zero duration", () => {
    expect(countUp(0, 300, 900)).toBe(0);
    expect(countUp(50, 0, 0)).toBe(50);
  });
});

describe("postRunGoals best bar", () => {
  const none = { wallet: 0, catalog: [] };

  it("shows no bar on a first run (no previous best)", () => {
    expect(postRunGoals({ score: 500, previousBest: null, ...none }).bar).toBeNull();
    expect(postRunGoals({ score: 500, previousBest: 0, ...none }).bar).toBeNull();
  });

  it("reports the distance to beat and the fraction of the best", () => {
    const { bar } = postRunGoals({ score: 600, previousBest: 800, ...none });
    expect(bar).toEqual({ fraction: 0.75, label: "200 to beat your best", beaten: false });
  });

  it("reports a new best by the margin and fills the bar", () => {
    const { bar } = postRunGoals({ score: 950, previousBest: 800, ...none });
    expect(bar).toEqual({ fraction: 1, label: "New best by 150", beaten: true });
  });

  it("calls an exact tie a tie", () => {
    const { bar } = postRunGoals({ score: 800, previousBest: 800, ...none });
    expect(bar).toEqual({ fraction: 1, label: "Tied your best", beaten: false });
  });
});

describe("postRunGoals next unlock", () => {
  const catalog = [
    { label: "Juggernaut", cost: 5000 },
    { label: "Crimson", cost: 150 },
    { label: "Phantom", cost: 8000 },
  ];

  it("picks the cheapest item above the wallet and the coins still needed", () => {
    expect(postRunGoals({ score: 1, previousBest: null, wallet: 400, catalog }).unlock).toEqual({
      label: "Juggernaut",
      coinsNeeded: 4600,
    });
  });

  it("names a ready item with 0 needed when everything left is affordable", () => {
    expect(postRunGoals({ score: 1, previousBest: null, wallet: 99_999, catalog }).unlock).toEqual({
      label: "Crimson",
      coinsNeeded: 0,
    });
  });

  it("is null when everything is owned", () => {
    expect(
      postRunGoals({ score: 1, previousBest: null, wallet: 0, catalog: [] }).unlock,
    ).toBeNull();
  });
});

describe("unownedCatalog", () => {
  it("lists every priced ship and cosmetic for a fresh profile, never the free falcon", () => {
    const cat = unownedCatalog([]);
    expect(cat.some((i) => i.label === "Falcon")).toBe(false);
    expect(cat.some((i) => i.label === "Juggernaut" && i.cost === 5000)).toBe(true);
    expect(cat.length).toBe(
      SHIPS.filter((x) => x.unlockCost > 0).length + COSMETICS.filter((x) => x.cost > 0).length,
    );
  });

  it("drops owned ships (ship: prefix) and owned cosmetics", () => {
    const cat = unownedCatalog(["ship:juggernaut", "hull-crimson"]);
    expect(cat.some((i) => i.label === "Juggernaut")).toBe(false);
    expect(cat.some((i) => i.label === "Crimson")).toBe(false);
  });
});

describe("coinBreakdown", () => {
  const sum = (rows: { amount: number }[]) => rows.reduce((n, r) => n + r.amount, 0);

  it("lists pickups only when no boost was active", () => {
    const rows = coinBreakdown({ total: 18, boostBonus: 0, pickups: 6 });
    expect(rows).toEqual([{ label: "6 pickups", amount: 18 }]);
  });

  it("splits out the coin boost and still sums to the total", () => {
    const rows = coinBreakdown({ total: 30, boostBonus: 10, pickups: 7 });
    expect(rows).toEqual([
      { label: "7 pickups", amount: 20 },
      { label: "Coin Boost", amount: 10 },
    ]);
    expect(sum(rows)).toBe(30);
  });

  it("singularises one pickup and is empty for a run with no coins", () => {
    expect(coinBreakdown({ total: 3, boostBonus: 0, pickups: 1 })[0]?.label).toBe("1 pickup");
    expect(coinBreakdown({ total: 0, boostBonus: 0, pickups: 0 })).toEqual([]);
  });
});
