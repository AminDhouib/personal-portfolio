# Password Game 2 — Improvement Pass: Legibility, Chaining, Playable Widgets

Date: 2026-07-20
Status: approved
Baseline: the shipped PG2 (docs/specs/2026-07-18-password-game-2-design.md), live at /games/password-game.

## Problem

Player feedback on the shipped game:

1. **Events are illegible.** The garden/bear event failed on all four axes — the player did not
   know the goal, did not know the available action, could not read cause/effect from the
   screen, and the event felt arbitrary in the fiction. Root cause (audit-confirmed): coupled
   rules live in the rule column, the encounter lives on the canvas, and nothing binds them.
   The honey pot is only painted at honey >= 40 (painters.ts:508) — visible exactly when the
   player no longer needs it. Four events (snake, tetris, parasite, black-hole) inject no
   coupled rule at all, so they have no persistent goal text anywhere.
2. **Events are isolated.** Each of the 12 events is its own encounter; nothing an event does
   changes another. The run reads as a checklist, not an escalation.
3. **Rule cards are inert.** Every payload (chess board, flag, sponsors, antidote) is a static
   picture with role="img". The original Password Game's bar — a pannable street view, a chess
   position you solve, a CAPTCHA — demands the player operate embedded content. PG2 should
   match or supersede that, per the user.

The chrome-family events (cookie-banner, loading-bar) score STRONG on every legibility axis
because their fiction and their mechanics are the same object — a real consent dialog IS the
goal, the action, and the theme. That property is the design target for everything below.

## Scope

Three workstreams over the existing architecture. No act restructure, no event removals, no
new heavy dependencies, no emojis (SVG/canvas art only), seed-determinism preserved
everywhere (daily seed + race-a-seed leaderboard must remain fair).

---

## Workstream A — Legibility layer

### A1. Crisis meter idiom (shared)

A shared painter helper draws, at the encounter site on the canvas: a name tag, a live goal
meter tied to the event's coupled-rule threshold (the campfire fuel gauge at painters.ts:372
is the reference rendering), and a threshold tick where the rule's pass/fail line sits.
Action chips (FEED / STOKE / BASKET) always render with a verb label and a dimmed state when
the action is unavailable, so availability is readable before clicking. This is a rendering
convention, not a framework — each painter calls the helper with its own numbers.

### A2. Per-event fixes (audit rework order)

1. **garden** — full rework, the exemplar:
   - Honey gauge always visible next to the hive, 0-100 with a tick at 40 and the current
     value as a number. Below-threshold rendering must be the _loud_ state, not the absent one.
   - Bear telegraph: countdown arc (8s) over the approaching bear; raid-in-progress shows
     honey visibly draining rather than snapping to zero behind a 5s mood pill.
   - Basket chip: labeled "THROW BASKET", lit only while the bear is telegraphed/raiding,
     dimmed otherwise with a "bear away" sub-label.
   - Fiction/copy: the coupled-rule description drops "Do not ask why the form wants honey"
     for copy that states the deal and foreshadows the payoff — the bear is a recurring
     visitor who remembers being fed: e.g. "Keep the hive at 40+ honey. Bears remember who
     packs a picnic." (exact copy at implementer's discretion; requirement: goal + action +
     foreshadow of the finale tackle in one or two sentences).
2. **snake** — gains a coupled rule at onset (intent: nothing may remain swallowed at submit;
   final wording/validation mirrors the galaga final-wave coupled-rule pattern) and an
   on-canvas instruction label in the black-hole "FEED IT:" style stating the feed action:
   the pellet character must be typed at the end of the box. The end-of-box precondition
   (snake.ts:94) must be stated on screen.
3. **tetris** — gains a coupled rule at onset (intent: no garbage characters left in the
   password at submit) and a one-time "CLICK TO SHATTER" signpost on the first landed block.
4. **parasite** — keeps its hidden-mimic nature and gets one honest tell: the mimic's
   periodic reveal flash also pulses a distinct color so an attentive player can find it.
   No coupled rule — sly, not unfair.
5. **gerald** — hunger gauge (same meter idiom) plus the coupled rule's live message showing
   a whole-seconds countdown ("fed 41s ago / 60s") instead of raw milliseconds (gerald.ts:82).
6. **autocorrect** — when correctOnce rewrites a word, the affected cells flash visibly for
   ~1s so the player sees exactly which word was mangled, in addition to the existing toast.
7. **black-hole** — mechanics untouched; refictioned via copy only (label, mood lines,
   receipt name) as the form's scheduled storage-compaction process.
8. **infection** — copy-only softening from biological plague toward data corruption /
   malware (mood lines + receipt name); mechanics and antidote flow untouched.

campfire, galaga, cookie-banner, loading-bar: no changes (benchmarks / already strong).

## Workstream B — Chaining layer

Cross-event reads use the one existing idiom: `ctx.state.events.find(e => e.defId === X)?.data`
cast to the source event's data type (there is no getEventData on EventContext — that is
RuleApi, rules-only). Every chain MUST have a visible beat — a mood line and a canvas
flourish at minimum — so the player sees the connection, not just experiences its math.
All chains are seed-deterministic side effects of already-deterministic events.

1. **Autocorrect sabotages the inhabitants.** When the rewrite source word is gerald / honey /
   fire (autocorrect.ts:33-41 already maps them), the matching inhabitant takes a hit:
   Gerald's hunger jumps, garden honey drains a fixed amount, campfire fuel drops. Beat:
   mood line on the victim ("The autocorrect demon ate Gerald's dinner").
2. **Campfire quarantines infection.** While fuel is above a threshold, the campfire cures
   the leftmost infected cell on a slow cadence (reusing its leftmost-scan, campfire.ts:49).
   Beat: sear flash on the cured cell.
3. **The bear fights invaders.** A basket toss while an invasion event (galaga / snake /
   tetris) is in peak makes the departing bear swipe at it: downs one alien / knocks the
   snake back one bite window / shatters one garbage block. Beat: bear lunge on canvas +
   mood line foreshadowing the finale ("The bear remembers this").
4. **Black hole eats garbage.** pullNearest biases toward garbage cells (black-hole.ts:31);
   collapse returns them as normal, value-bearing characters — cleanup with a tradeoff.
   Beat: existing spiral visuals carry it; add a mood line on first garbage capture.
5. **Campfire ignites a cookie banner.** While the campfire burns hot and the banner swarm
   is live, one banner ignites and is removed at a fuel cost (one-shot per swarm). Beat:
   burn animation on the banner (DOM chrome) + mood line previewing the finale EULA burn.
6. **Gerald slows the snake.** While Gerald is well-fed (hunger below a threshold), the
   snake's bite cadence slows (snake.onTick reads gerald hunger). Beat: mood line
   ("The snake keeps its distance from a fed fish").

Chains 1, 3, 5, 6 involve the persistent inhabitants and connect the acts to the finale
ally system — protecting a creature now has continuous, visible value.

## Workstream C — Playable rule widgets

### C1. Input channel architecture

Rule-card widgets get two sanctioned outputs, both engine-mediated:

- **Type into the password.** A widget resolves to text (SAN move, hex color, captcha token)
  and routes it through the same applyKey path as the keyboard, one char at a time, caret at
  end. Validators stay pure string checks; no validator reads widget internals.
- **Publish rule state.** Non-text outcomes (consent combination solved) write to
  `state.ruleStates[ruleId]` via a new engine helper that also bumps version; RuleApi gains
  `ruleState(id): unknown` so validators can read it. Mirrors the coupledRule convention.

Widgets live in rule-list payload renderers (client components), receive the seed-derived
payload plus callbacks from the shell, and must be fully operable by mouse/touch. They must
not capture keyboard focus in ways that break the global keydown game surface.

### C2. The four widgets

1. **Playable chess board** (upgrade of chess-best-move, act3). Click a piece: legal target
   squares highlight (chess.js — already a dependency — instantiated client-side from the
   puzzle position). Click a target: the move resolves to SAN and is typed into the
   password. Illegal clicks shake the board. The static glyph grid rendering is replaced;
   the feed-offline freebie path is unchanged. validate stays `includes(bestMove)` with the
   existing accept[] variants.
2. **Rejecting image CAPTCHA** (upgrade of captcha-human, prologue). A seeded 3x3 grid of
   inline-SVG primitive tiles (categories like traffic lights / crosswalks / storefronts,
   drawn as simple vector art — no external images). The player selects matching tiles and
   clicks Verify. The first CORRECT submission is rejected anyway with a fresh seeded grid
   (the dark-pattern joke; exactly one forced rejection so it cannot soft-lock). Solving the
   second reveals a seeded token (format like "OK-7F3A") which the widget types into the
   password. Grid, answer set, and token derive from subSeed(seed, "captcha").
3. **Consent-preference wall** (new act1 rule). An embedded "Manage your data preferences"
   panel with six labeled toggles (Analytics, Personalization, Partner sharing, ...).
   Turning a toggle off flips one seeded neighbor on. The puzzle is generated by walking
   backward from the solved (all-off) state so it is always solvable in a bounded number of
   moves. Reaching all-off enables "Save preferences", which reveals a seeded passphrase the
   widget types into the password. Solved-ness also publishes to ruleStates.
4. **RGB color match** (new act2 rule). A seeded target swatch plus three R/G/B sliders
   (step 17, so 16 positions per channel; the target sits on the same lattice — exact match
   is fair). A live preview swatch sits beside the target. On exact match the widget types
   the `#RRGGBB` hex into the password. Fiction: "confirm your workspace accent color."

Rule count rises 17 -> 19. The solvability CI test, max-length interplay, and receipt
"Rules survived" line must be re-verified with the new rules and the two new typed tokens
(passphrase, hex) plus captcha token and SAN in the worst case.

Bench (explicitly out of scope this pass): clickable world map (blocked on coordinate
data), TOTP authenticator tile, letter-sacrifice, sponsor carousel.

---

## Constraints and invariants

- Determinism: every widget and chain derives from the run seed via subSeed streams; a
  given seed replays identically. Feeds keep their existing best-effort/freebie semantics.
- Solvability: the CI solvability test must pass with all 19 rules under worst-case feeds;
  the forced-rejection CAPTCHA must reject exactly once per run.
- Legibility beats: every chain and every event state change the player must act on has an
  on-screen representation that persists as long as the state does (no 5s mood pill as the
  sole carrier of load-bearing information).
- House rules: no emojis anywhere; no drive-by refactors; pinning tests before behavior
  changes on touched events; gates never weakened; tests use temp dirs, never .data.
- The prettier-plugin-tailwindcss conditional-className idiom (separator space in static
  template text) applies to all new JSX.
- Mobile: widgets must be pointer-operable; the desktop-first stance of the game stands.

## Testing

- Engine: pinning tests for each touched event's current behavior FIRST, then chain tests
  (forced two-event states, deterministic seeds), coupled-rule injection tests for snake and
  tetris, gerald countdown message format test.
- Widgets: component tests (existing RTL + vitest harness) for chess move resolution and
  illegal-click rejection, captcha single-forced-rejection invariant, consent wall
  backward-generation solvability, color slider lattice match; plus ruleState publication.
- Integration: solvability run over the 19-rule set; receipt still renders; leaderboard
  post unchanged.
- Acceptance: full browser run (stealth-chrome with occlusion disabled, localhost) verifying
  the legibility layer visually — every crisis shows goal + action + state, chains produce
  their beats — before any deploy. Deploy to production only on user confirmation.

## Delivery

Same pipeline as the original build: opus implementer subagent per task, two-stage review
(spec compliance, then code quality) with fix loops, commits directly to main. Suggested
task grain: A1+garden first (establishes the meter idiom), then remaining A fixes, then B
chains (grouped by touched files), then C1 architecture, then each widget, then
solvability/acceptance.
