# Architecture Refactor Session

Execute the refactoring plan in `docs/superpowers/specs/2026-05-18-architecture-audit-results.md`. That file contains the full strategic audit with problem areas ranked by severity, decomposition plans, dependency order, and risk assessment. Read it first.

## What Was Audited

A full graphify knowledge graph (1514 nodes, 2342 edges, 109 communities) was built on `src/`, followed by 5 parallel deep-dive agents that read actual code. This is not guesswork — every finding cites specific files and line numbers.

## Critical Context

**Space Shooter (`src/components/game/space-shooter.tsx`):**
- 6,820 lines, 14 systems in one file, 0.02 cohesion
- Universal coupling via 115-field `GameRefs` mutable ref bag
- Decomposition plan: 11 modules across 3 phases
- Phase 1 is mechanical (cut-paste + imports), Phase 2 needs interface design, Phase 3 involves shared state refactoring
- `SoundManager` (990 lines) is the best first extraction — largest self-contained block, zero inbound deps
- Extract `types.ts` second — every other extraction depends on shared types being importable
- `boss-behaviors.ts` third — 580 lines, clean boundary (each function takes GameRefs + BossState)

**Leaderboard Duplication:**
- `src/app/api/leaderboard/route.ts` and `src/app/api/password-game/leaderboard/route.ts` share ~70% identical code
- Extract `src/lib/leaderboard-store.ts` with `createLeaderboardStore<T>(config)` factory
- Both routes' `readAll()` silently returns `[]` for ALL errors including corrupted JSON — add error logging
- Leaderboard GET has no cache headers — add `s-maxage=10, stale-while-revalidate=30`

**Social Links Quadruplication:**
- LinkedIn/Contra SVGs duplicated in: `site-footer.tsx`, `contact.tsx`, `navbar.tsx`, `reviews-client.tsx`
- Rendering loop duplicated 3 times
- Extract `src/components/ui/social-links.tsx` with `SocialLinks` component (accepts `size` + `limit` props)

**Dead Code:**
- `src/components/ui/page-transition.tsx` — zero imports anywhere. Delete it.

## What NOT to Change

- **Password Game architecture** — It's exemplary. 50+ rules, uniform `RuleDef` interface, clean DAG deps, no circular imports. The 12+ graph communities are real module boundaries, not fragmentation.
- **Three.js background system** — Clean separation, correct lazy loading. Leave it.
- **Super Voltorb Flip CSS** — Do NOT replace CSS legend/scoreboard with chrome PNG sprites. Other cleanup is fine.
- **Homepage section patterns** — Consistent. Spacing variations are intentional design choices.

## Execution Order

Follow the 5 waves in the audit doc. Each wave is independently shippable:

**Wave 1 — Quick wins (<1hr each):** Delete PageTransition, extract SocialLinks, extract leaderboard-store, add cache headers, clean blog.ts re-exports.

**Wave 2 — Space Shooter Phase 1 (mechanical, ~2.5hr):** Extract types.ts, sound-manager.ts, boss-behaviors.ts, spawning.ts, difficulty.ts. These are cut-paste + update imports. No interface redesign.

**Wave 3 — Space Shooter Phase 2 (~2hr):** Extract game-tick.ts, shop-previews.tsx, run-init.ts. Needs explicit import wiring.

**Wave 4 — Space Shooter Phase 3 (~5hr, hard):** Extract scene-components.tsx, hud-ui.tsx. Introduce useSpaceShooterState() hook. Shared state refactoring.

**Wave 5 — Polish:** Fix sacrificeRule purity violation, standardize API errors, freeze data modules, add error logging to github.ts.

## Rules

- Commit directly to main (no feature branches)
- After any UI change, open stealth-browser-mcp to screenshot and verify before reporting done
- No emojis in code or UI — use real SVG icons/logos
- Run tests after each wave to catch regressions
- Each wave should be a separate commit with a clear message
