# Password Game 2: Daily Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add a daily challenge — every day, a globally shared seed everyone can compete on. Resets at midnight UTC. Surfaces a "Daily Challenge" button on the game page and tab on the leaderboard.

**Architecture:** Daily seed = deterministic hash of today's UTC date string. Implemented client-side (no server round-trip). Leaderboard already supports seed filtering → daily scores are just filtered by today's daily seed.

---

## Tasks

### Task 1: Daily seed helper + tests

**Create:** `src/components/game/password-game/daily.ts`
**Create:** `src/components/game/password-game/__tests__/daily.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// daily.test.ts
import { describe, it, expect } from "vitest";
import { dailySeed, todayDateString } from "../daily";

describe("dailySeed", () => {
  it("produces the same seed for the same date string", () => {
    expect(dailySeed("2026-04-15")).toBe(dailySeed("2026-04-15"));
  });

  it("produces different seeds for different dates", () => {
    expect(dailySeed("2026-04-15")).not.toBe(dailySeed("2026-04-16"));
    expect(dailySeed("2026-01-01")).not.toBe(dailySeed("2026-12-31"));
  });

  it("returns a non-negative 32-bit integer", () => {
    const s = dailySeed("2026-04-15");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("todayDateString", () => {
  it("returns a UTC YYYY-MM-DD string", () => {
    const str = todayDateString();
    expect(str).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts an optional date argument", () => {
    expect(todayDateString(new Date("2026-04-15T00:00:00Z"))).toBe("2026-04-15");
    expect(todayDateString(new Date("2026-04-15T23:59:59Z"))).toBe("2026-04-15");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- daily.test.ts`

- [ ] **Step 3: Implement**

Create `src/components/game/password-game/daily.ts`:

```typescript
/**
 * Deterministic seed derived from a YYYY-MM-DD date string. Uses the FNV-1a
 * hash truncated to 32 bits so the output fits the mulberry32 PRNG input.
 */
export function dailySeed(dateString: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < dateString.length; i++) {
    hash ^= dateString.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/** UTC YYYY-MM-DD string for the given date (defaults to now). */
export function todayDateString(date: Date = new Date()): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/game/password-game/daily.ts src/components/game/password-game/__tests__/daily.test.ts
git commit -m "feat(password-game): add daily seed derivation"
```

---

### Task 2: Daily challenge button on game page

**Modify:** `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Import daily helpers**

Add at the top imports section:

```typescript
import { dailySeed, todayDateString } from "./daily";
import { CalendarDays } from "lucide-react";
```

- [ ] **Step 3: Add callback to start daily challenge**

After the `reset` callback, add:

```typescript
  const startDaily = useCallback(() => {
    setSeed(dailySeed(todayDateString()));
    setPassword("");
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);
```

- [ ] **Step 4: Add a "Daily" button in the header**

Find the header section with `New seed` button:

```typescript
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New seed
        </button>
```

Replace with:

```typescript
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startDaily}
            className="inline-flex items-center gap-1 text-xs text-accent-amber hover:text-accent-amber/80 transition-colors"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Daily
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New seed
          </button>
        </div>
```

- [ ] **Step 5: Run tests**

Run: `npm test -- password-game`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): add daily challenge button"
```

---

### Task 3: Daily tab on leaderboard

**Modify:** `src/app/games/password-game/leaderboard/leaderboard-client.tsx`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Add tab state and daily auto-filter**

Add imports:
```typescript
import { dailySeed, todayDateString } from "@/components/game/password-game/daily";
```

Change the component to manage tab state. Find the `const [seedFilter, setSeedFilter] = useState("");` line and add below it:

```typescript
  const [tab, setTab] = useState<"all" | "daily">("all");
```

Add a `useEffect` to fetch daily entries when the tab switches, after the existing `useEffect`:

```typescript
  useEffect(() => {
    if (tab === "daily") {
      fetchEntries(String(dailySeed(todayDateString())));
    } else {
      fetchEntries("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
```

- [ ] **Step 3: Add tab switcher UI**

Right before the `<div className="flex flex-col sm:flex-row gap-2 mb-4">` wrapper, add:

```typescript
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            tab === "all"
              ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
              : "border-(--border) text-(--muted) hover:text-(--foreground)"
          }`}
        >
          All time
        </button>
        <button
          type="button"
          onClick={() => setTab("daily")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            tab === "daily"
              ? "border-accent-amber/50 bg-accent-amber/10 text-accent-amber"
              : "border-(--border) text-(--muted) hover:text-(--foreground)"
          }`}
        >
          Today's Daily
        </button>
      </div>
```

- [ ] **Step 4: Hide the seed filter input when Daily tab is active**

Wrap the existing `<div className="flex flex-col sm:flex-row gap-2 mb-4">` with a condition. Change:

```typescript
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
```

to:

```typescript
      {tab === "all" && <div className="flex flex-col sm:flex-row gap-2 mb-4">
```

And its closing `</div>` to `</div>}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/games/password-game/leaderboard/leaderboard-client.tsx
git commit -m "feat(password-game): add daily-challenge tab on leaderboard"
```

---

### Task 4: Verify

- [ ] **Step 1: Run all tests**

Run: `npm test -- password-game`
Expected: 89 passing (86 existing + 3 daily tests).

- [ ] **Step 2: Manual browser test**

- Visit `/games/password-game` → click "Daily" → URL remains the game, but seed is set to today's daily seed
- Complete the run → submit → verify entry appears when you visit `/games/password-game/leaderboard` and click "Today's Daily"
