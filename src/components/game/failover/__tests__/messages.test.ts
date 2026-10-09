// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAIL_REASONS, SOFT_BADGES } from "../sim/failure-reasons";
import { BADGE_TEXT, WARNING_TEXT, alertText, badgeText } from "../ui/messages";

// Every key the sim can emit has words, and every warning in the map is one the
// sim actually emits.

const SIM = path.resolve(__dirname, "../sim");

function simSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : simSources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** The literal keys of every warning the sim emits: emit({ kind: "warning", key }) and fireAlert(). */
function emittedWarningKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of simSources(SIM)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/kind:\s*"warning",\s*key:\s*"([a-z0-9_]+)"/g)) keys.add(m[1]!);
    for (const m of text.matchAll(/kind:\s*"warning",\s*\n\s*key:\s*"([a-z0-9_]+)"/g))
      keys.add(m[1]!);
    for (const m of text.matchAll(/fireAlert\([^,]+,\s*"[^"]+",\s*"([a-z0-9_]+)"/g))
      keys.add(m[1]!);
  }
  return keys;
}

describe("the sim's keys in words", () => {
  it("names every failure reason and soft badge", () => {
    for (const key of [...Object.values(FAIL_REASONS), ...Object.values(SOFT_BADGES)]) {
      expect(BADGE_TEXT[key].length).toBeGreaterThan(0);
      expect(badgeText(key)).toBe(BADGE_TEXT[key]);
    }
    expect(badgeText("fail_from_the_future")).toBe("fail_from_the_future");
  });

  it("has words for exactly the warnings the sim emits", () => {
    const emitted = emittedWarningKeys();
    expect(emitted.size).toBeGreaterThan(10);
    expect([...emitted].sort()).toEqual(Object.keys(WARNING_TEXT).sort());
  });

  it("fills a warning's parameters, and names a service type", () => {
    expect(
      alertText({ key: "alert_high_load", level: "warning", params: { type: "compute" } }),
    ).toBe("High load: Compute");
    expect(
      alertText({ key: "rps_surge_warning", level: "danger", params: { multiplier: "1.5" } }),
    ).toBe("RPS SURGE! Traffic x1.5");
    expect(alertText({ key: "no_such_warning", level: "info", params: {} })).toBeNull();
  });
});
