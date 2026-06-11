# Codebase Architecture Audit — Design Spec

**Date:** 2026-05-18
**Approach:** Hybrid (Graph signals + targeted deep dives)
**Priority:** Code organization first, performance secondary
**Scope:** Full codebase, no exclusions

## Audit Dimensions

| Dimension | Graph Signal | Target |
|-----------|-------------|--------|
| Duplication | `semantically_similar_to` edges, parallel leaderboard systems | Copy-pasted logic, parallel implementations |
| Cohesion | Communities with score < 0.10 | Modules doing too many things |
| Coupling | God nodes (degree > 20), cross-community edges | Over-centralized abstractions |
| Dead Code | 527 weakly-connected nodes | Unused exports, orphaned components |
| Boundary Violations | Unexpected cross-community edges | Wrong-layer access patterns |
| Convention Drift | File naming, export patterns | Inconsistent patterns |

## Deep Dives (5 parallel)

1. **Leaderboard Duplication** — Two parallel file-based JSON + write-lock systems
2. **Space Shooter Monolith** — 100 nodes, 0.02 cohesion, single massive file
3. **Password Game Architecture** — 12+ communities, assess healthy decomposition vs fragmentation
4. **Shared UI / Layout Layer** — Footer/Contact duplication, missing shared abstractions
5. **Data Layer & API Routes** — Pattern consistency, error handling, caching coherence

## Output

Strategic architecture doc with:
- Architecture map (current state)
- Problem areas ranked by severity
- Refactoring strategy with dependency order
- Risk assessment per change area
