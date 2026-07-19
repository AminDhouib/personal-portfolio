import { describe, it, expect } from "vitest";

import { GET } from "../route";
import { STATIC_CAPITALS } from "@/data/password-game/capitals-static";

describe("GET /api/password-game/countries", () => {
  it("serves the vendored static capital list with the week-long cache", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("static");
    expect(body.count).toBe(STATIC_CAPITALS.length);
    expect(body.count).toBeGreaterThan(200);
    expect(body.capitals).toEqual(STATIC_CAPITALS);
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=604800, stale-while-revalidate=86400",
    );
  });

  it("returns pairs shaped { country, capital } with non-empty values", async () => {
    const res = await GET();
    const body = await res.json();
    for (const entry of body.capitals) {
      expect(typeof entry.country).toBe("string");
      expect(entry.country.length).toBeGreaterThan(0);
      expect(typeof entry.capital).toBe("string");
      expect(entry.capital.length).toBeGreaterThan(0);
    }
  });
});
