# Codebase Architecture Audit — Strategic Results

**Date:** 2026-05-18
**Scope:** Full `src/` — 173 files, 121K words, 1514 graph nodes, 2342 edges
**Method:** Graphify knowledge graph + 5 targeted deep-dive agents

---

## Architecture Map (Current State)

```
src/
  app/                    # Next.js 16 App Router pages + API routes
    api/
      copilotkit/         # AI chat backend (OpenRouter proxy)
      leads/              # Contact form -> Resend email
      leaderboard/        # Generic game leaderboard (file-based JSON)
      password-game/      # PG-specific APIs (chess, countries, wordle, leaderboard)
    blog/, games/, reviews/, work/   # Content pages
    ai/                   # Full-page AI chat
  components/
    chat/                 # ChatWidget + panel (CopilotKit)
    game/                 # 6 games + shared game infra
      password-game/      # Well-factored: engine, rules/, hazards/, UI
      super-voltorb-flip/ # Clean subsystem: audio, effects, memo-button
      space-shooter.tsx   # **6,820-line monolith** (14 systems in 1 file)
    layout/               # SiteFooter
    sections/             # 11 homepage sections
    three/                # R3F background (well-separated)
    ui/                   # Primitives (section-heading, tech-icon, page-transition)
    blog/, navbar.tsx
  data/                   # Static data (nav, projects, reviews, services, password-game/)
  lib/                    # Server utils (blog, github, ga4, date-utils)
```

---

## Problem Areas (Ranked by Severity)

### CRITICAL: Space Shooter Monolith

**File:** `src/components/game/space-shooter.tsx` — 6,820 lines
**Impact:** Unmaintainable, untestable, impossible to reason about in isolation

14 distinct systems in one file: types, boss AI (8 bosses, 580 lines), SoundManager (990 lines procedural audio), game loop (780 lines), 17 3D rendering components (1,650 lines), shop preview system (365 lines), HUD/overlay UI (1,545 lines), spawning, difficulty, VFX, state management (115-field `GameRefs` mutable ref bag).

The 0.02 cohesion score is explained by the `GameRefs` bag — every system reads/writes the same 115-field object. This is the universal coupling point.

**Decomposition plan exists:** 11 proposed modules, ~9hr total effort. Phase 1 (mechanical extractions of types, sound-manager, boss-behaviors, spawning, difficulty) delivers 28% reduction with zero interface risk in ~2.5hr.

### HIGH: Leaderboard System Duplication

**Files:** `src/app/api/leaderboard/route.ts` + `src/app/api/password-game/leaderboard/route.ts`
**Impact:** ~70% code duplication, silent error swallowing, no data persistence guarantee

Identical infrastructure: `readAll()`, `writeAll()`, `nextTmp()`, `withWriteLock()`, `sanitizeName()` — all copy-pasted with only filenames and field names changed.

Additional issues:
- `readAll()` silently returns `[]` for ALL errors including corrupted JSON
- No error logging in write path — disk-full failures are invisible
- No Docker volume mount — leaderboard data lost on container recreation
- Leaderboard GET has zero cache headers (`force-dynamic` + no `s-maxage`)
- No rate limiting on POST

**Fix:** Extract `src/lib/leaderboard-store.ts` with generic `createLeaderboardStore<T>(config)` factory. Each route shrinks to ~40 lines.

### HIGH: Social Links Quadruplication

**Files:** `site-footer.tsx`, `contact.tsx`, `navbar.tsx`, `reviews-client.tsx`
**Impact:** 4 copies of LinkedIn/Contra SVG paths, 3 copies of social link rendering loop

The SVG path data is byte-for-byte identical across all 4 files. The rendering loop (`socialLinks.map(...)`) is duplicated 3 times with trivial variations (icon size, slice limit).

Footer already returns `null` on `/` to avoid visual duplication with Contact — confirming these ARE the same concept.

**Fix:** Extract `src/components/ui/social-links.tsx` with `SocialLinks` component accepting `size` and `limit` props. Move LinkedIn/Contra SVG icons into `tech-icon.tsx` alongside `SiIcon`.

### MEDIUM: Dead Code

| Item | File | Evidence |
|------|------|----------|
| `PageTransition` component | `src/components/ui/page-transition.tsx` | Zero imports anywhere in codebase |

### MEDIUM: API Route Inconsistencies

- Error response shapes vary: `{error: "invalid json"}` vs `{error: "Invalid JSON"}` vs `{error: "OPENROUTER_KEY not configured"}`
- `copilotkit/route.ts` uses fragile `as never` type cast (line 28) for CopilotKit SDK compat
- `blog.ts` re-exports `formatDate`/`formatRelativeDate` from `date-utils.ts` — consumers split between importing from each

### LOW: Minor Code Smells

| Issue | Location | Notes |
|-------|----------|-------|
| `sacrificeRule` mutates closure in `validate()` | `password-game/rules/tier4-sacrifice.ts:29-65` | Violates purity contract; should use `onTick` + `ruleState` |
| `rule-card.tsx` has 13 inline media renderers | `password-game/rule-card.tsx` (636 lines) | Could extract to `media/` subdir |
| Top-level data modules skip `Object.freeze()` | `src/data/nav.ts`, `projects.ts`, `reviews.ts`, `services.ts` | Inconsistent with password-game data convention |
| Silent error swallowing in `github.ts` | `src/lib/github.ts` | Both fetch functions catch and discard errors |
| GA4 client bypasses Next.js fetch cache | `src/lib/ga4.ts` | Uses gRPC, not `fetch()`. Caching depends on page-level ISR |
| 21 hardcoded `WireframeShape` entries | `three/geometric-background.tsx` | Could be config array, ~100 lines saved |

---

## What's Actually Good (Don't Touch)

- **Password Game architecture** — Exemplary. 50+ rules implementing uniform `RuleDef` interface, clean DAG dependencies, no circular imports, well-factored tier system. The 12+ graph communities reflect real module boundaries.
- **Three.js background system** — Clean separation: CSS effects (background-fx), R3F canvas (geometric-background), SSR-safe loader. Correct lazy loading.
- **Homepage sections** — Consistent patterns: SectionHeading usage, animation conventions, container widths. Minor variations are intentional design choices.
- **Password-game data layer** — 17 files all following frozen-readonly-array convention with typed interfaces. No dead exports.
- **Super Voltorb Flip subsystem** — Clean extraction with effects context/provider pattern.

---

## Refactoring Strategy (Dependency Order)

Ordered so each step is independently shippable and later steps don't depend on earlier ones being complete.

### Wave 1: Quick Wins (< 1hr each, no risk)

1. **Delete `PageTransition`** — dead code removal
2. **Extract `SocialLinks` component** — eliminates 4x SVG duplication + 3x loop duplication
3. **Extract `leaderboard-store.ts`** — eliminates 70% duplication between 2 API routes
4. **Add cache headers to leaderboard GET** — `s-maxage=10, stale-while-revalidate=30`
5. **Remove blog.ts re-exports of date-utils** — update consumers to import directly

### Wave 2: Space Shooter Phase 1 (2.5hr, mechanical)

6. **Extract `space-shooter/types.ts`** — all interfaces + GameRefs (~200 lines)
7. **Extract `space-shooter/sound-manager.ts`** — SoundManager class (~990 lines, largest self-contained block)
8. **Extract `space-shooter/boss-behaviors.ts`** — 8 boss AI functions (~580 lines)
9. **Extract `space-shooter/spawning.ts`** — entity spawning + VFX helpers (~250 lines)
10. **Extract `space-shooter/difficulty.ts`** — pure combat math functions (~70 lines)

### Wave 3: Space Shooter Phase 2 (2hr, interface design needed)

11. **Extract `space-shooter/game-tick.ts`** — runTick() with explicit module imports (~780 lines)
12. **Extract `space-shooter/shop-previews.tsx`** — self-contained R3F preview components (~365 lines)
13. **Extract `space-shooter/run-init.ts`** — createRefs() + startRun() (~100 lines)

### Wave 4: Space Shooter Phase 3 (5hr, hard — shared state)

14. **Extract `space-shooter/scene-components.tsx`** — 17 R3F components, all read GameRefs via ref
15. **Extract `space-shooter/hud-ui.tsx`** — 30+ useState hooks, requires custom hook extraction
16. **Introduce `useSpaceShooterState()` hook** — intermediate step to decouple UI from game state

### Wave 5: Polish (low priority, do when touching these files)

17. **Fix `sacrificeRule` purity violation** — migrate to `onTick` + `ruleState`
18. **Standardize API error responses** — shared `createErrorResponse()` helper
19. **Freeze top-level data modules** — add `Object.freeze()` + `readonly` to nav, projects, reviews, services
20. **Add error logging to github.ts** — `console.warn` for silent fetch failures
21. **Extract rule-card media renderers** — optional, 636 -> ~100 lines

---

## Risk Assessment

| Change | Breakage Risk | Rollback Ease | Blast Radius |
|--------|--------------|---------------|--------------|
| Delete PageTransition | None | Trivial | 1 file |
| Extract SocialLinks | Low (visual regression) | Git revert | 4 files |
| Extract leaderboard-store | Low (API contract unchanged) | Git revert | 2 route files |
| Space Shooter Wave 1 | Low (import-only changes) | Git revert | 7 files |
| Space Shooter Wave 2 | Medium (interface contracts) | Harder | 3 files + consumers |
| Space Shooter Wave 3 | High (shared state refactor) | Difficult | 5+ files |
| Fix sacrificeRule | Low (behavior change in edge case) | Git revert | 1 file |
| API error standardization | Low | Git revert | 5 route files |

---

## Key Metric: Before/After

| Metric | Current | After Wave 1-3 |
|--------|---------|----------------|
| Largest file | 6,820 lines | ~2,500 lines (after extracting ~4,300) |
| Duplicated leaderboard code | ~70 lines | 0 (shared store) |
| Duplicated social SVGs | 4 copies | 1 source of truth |
| Dead code files | 1 | 0 |
| Space Shooter modules | 1 monolith + 6 helpers | 11 focused modules + 6 helpers |
