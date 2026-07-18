# The Password Game 2: Terms and Conditions Apply — Design Spec

Date: 2026-07-18
Status: Approved (design walkthrough approved in session; this document is the written record)
Replaces: the v1 password game at `/games/password-game`

## 1. Premise and goals

You are trying to sign up for a website. The form has other plans. Over a roughly 25-minute,
five-act run, the password field becomes a living world: creatures move in, disasters strike,
arcade fleets invade, and the form chrome itself turns hostile — all while password rules keep
stacking. Everything you keep alive returns to help you in the finale.

Goals, in priority order:

1. **Stream-worthy.** Every design decision is judged by "does this make a great clip and a
   great watch at 1080p?" The viewer experience is a first-class requirement, not a byproduct.
2. **A proper sequel.** Same verbs as v1 (type a password, satisfy stacking rules, survive
   hazards), but a ground-up recreation with set pieces, a cast, and a payoff structure.
   The Uncharted 1 to Uncharted 2 analogy: the base is recognizable, the experience is new.
3. **One epic run.** A single 20-30 minute session with an authored arc, not an endless
   score-chaser. Score is completion time; the leaderboard ranks runs of the same seed.

Non-goals: mobile-first play (playable but degraded, stated openly), multiplayer, persistence
of mid-run state across reloads, v1 save-data migration.

## 2. Core loop

Two layers run simultaneously:

- **Rules** (the spine, inherited from v1): numbered requirements that appear one at a time and
  must all stay satisfied. Roughly 20 revealed across the run, curated from v1's best plus new
  ones written to couple with events.
- **Events** (the sequel's new layer): timed set pieces that inhabit, attack, or haunt the
  password box and the form around it. Events are scheduled by a seeded Director and belong to
  four families (section 5).

The two layers interlock: some rules reference live event state ("the campfire must be burning
when you submit"), and some events attack rule compliance (an abduction can drop you below the
length minimum). The player is never just typing and never just playing a minigame — the tension
is always between the two.

### Failure model

**No hard game-over.** Disasters cost time (the score) and transform the situation; they never
erase minutes of progress. "Failure = transformation, never deletion" is a law: a neglected
creature becomes a sadder creature, an abducted letter orbits and can be rescued, an infected
character mutates rather than vanishing. The only knockback mechanic lives inside the finale
(section 4), and it is checkpointed at the finale's start.

## 3. Run structure

Five acts, target 25 minutes total (band: 20-30 depending on player skill):

| Act      | Title           | Target | Content                                                                                                                  |
| -------- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| Prologue | The Sign-Up     | ~2 min | 4-5 snappy rules, polite form, jokes land fast. One frame-flicker at the end telegraphs doom.                            |
| Act 1    | Move-In         | ~6 min | Rules stack; the first Inhabitant arrives (seed-dependent). Player learns tending. One Chrome comedy beat.               |
| Act 2    | The Infestation | ~7 min | Forces of nature (infection, black hole, parasite). First engineered two-crisis moment.                                  |
| Act 3    | The Invasion    | ~7 min | The Galaga set piece plus a second Invasion event, layered over whatever the player is still tending.                    |
| Finale   | The Submission  | ~5 min | The submit gauntlet and boss (section 4). Victory: the password is actually submitted. "Account created." Receipt rolls. |

Acts open with a full-screen title card (clip marker for streamers). The Director (section 6)
schedules events into act-specific slots with engineered valleys between spikes.

## 4. The finale and the creature payoff

The finale is the sequel's signature. When the player finally clicks Submit, the button refuses,
and a three-phase boss gauntlet begins. **Every Inhabitant kept alive through the run joins the
player's side**, giving three acts of tending an emotional and mechanical payoff:

- **Phase 1 — Missile Command:** rule-missiles rain toward the password. The player clicks to
  intercept; a living Gerald surfaces and douses missiles automatically.
- **Phase 2 — The EULA Final Form:** a giant terms-and-conditions scroll walls off the form; the
  player must find the real "I agree" checkbox hidden in the text. A burning campfire ignites
  the scroll and shortcuts the search.
- **Phase 3 — The Runaway Button:** the Submit button dodges the cursor. The player corners it;
  a surviving bear (or bee swarm) tackles it.

Fail-state inside the finale: getting overwhelmed in a phase knocks the player back to the start
of that phase (never out of the finale). Time keeps ticking — the clock is the only punishment.
With zero creatures alive the finale is fully beatable, just slower and lonelier, which is its
own story for the stream.

## 5. Events

### Framework

Every event is a self-contained module implementing one interface:

```ts
EventDef {
  id, family,                  // family: inhabitant | force | invasion | chrome
  telegraph,                   // how doom is foreshadowed before onset (viewer sees it first)
  phases,                      // arc: telegraph -> onset -> peak -> resolve (20-60s shaped for clips)
  onTick(state, dt, rng),      // pure state mutation, no DOM access
  resolveConditions,           // how the player ends or survives it
  finaleContribution?          // inhabitants only: what a survivor does in the finale
}
```

Event logic is pure and seeded (unit-testable without a browser); rendering is a separate layer
keyed off event state. This mirrors v1's `RuleDef` split, which worked.

### Launch roster: 12 events plus the boss

**Inhabitants** (move in, need tending, pay off in the finale):

1. **Gerald the fish** — an aquarium fills the lower half of the password box; Gerald swims
   between characters and has a hunger meter and a mood ("Gerald — thirsty" name tag). Feed him
   on schedule or the tank murks and he sulks (transformation, not death). Finale: water cannon.
2. **The campfire** — burns inside the box, consuming a character as fuel every interval unless
   fed the right characters. Coupled rule: "the campfire must be burning when you submit."
   Finale: burns the EULA.
3. **The garden and the bear** — flowers grow between characters, bees pollinate them, and a
   bear periodically lumbers in after the honey and must be distracted. Finale: the bear (or
   swarm) tackles the Submit button.

**Forces** (natural disasters inside the box):

4. **The infection** — one character turns green and pulsing; it spreads to neighbors on a
   timer. Quarantine by isolating with spaces or cure by typing the shown antidote sequence.
   Untreated characters mutate (legible transformation) rather than vanish.
5. **The black hole** — a singularity opens at an index and pulls nearby characters into orbit
   one by one. Collapse it by feeding it the shown "heavy" word; orbiting letters are then
   recoverable.
6. **The parasite** — a mimic glyph hides in the password, rendered identically but counting
   for nothing, so every length/sum rule reads one off. Telegraph: a subtle wiggle a sharp
   viewer spots before the player does (engineered dramatic irony). Click it to evict it.

**Invasions** (arcade fleets attack from outside the box):

7. **The Galaga invasion** (marquee) — a fleet assembles above the form in formation, then
   dive-bombs with tractor beams that abduct characters. The player fires back by pressing the
   key of the letter an alien is carrying; rescued letters drop back into place. Final wave is
   coupled to a rule: "every alien must be shot down before submitting."
8. **The snake** — slithers into the box and starts eating characters from the tail; the player
   redirects it by typing food pellets in safe spots until it is sated and leaves.
9. **Tetris garbage** — junk blocks rain into the box, inserting garbage characters at random
   indices under time pressure while all standing rules keep validating.

**Chrome** (the form itself turns hostile — comedy beats):

10. **The cookie banner from hell** — escalating consent dialogs cover the box; declining
    spawns more; the real "reject all" is hidden. Pure comedy pacing beat.
11. **The autocorrect demon** — the form "helpfully" rewrites password words into wrong ones;
    disable it via a toggle buried in a fake settings menu.
12. **The fake loading bar** — "Uploading password... 97%" locks input at the worst moment;
    mashing keys speeds it up.

### Scheduling variety

The Director draws a per-seed subset (not all 12 fire every run; roughly 8-10 do, with the
Galaga invasion and at least one Inhabitant guaranteed), so runs differ and the daily seed is a
shared episode everyone can compare.

## 6. The Director

A pure, seeded scheduler that owns pacing:

- **Slot scripts per act** — e.g. Act 2 = one Force at minute 1, one Chrome beat at minute 4,
  second Force at minute 5 overlapping the first's resolution (the engineered two-crisis
  moment). Slots reference families, the seed picks the concrete events.
- **Valleys** — enforced quiet windows between spikes so peaks read as peaks on stream.
- **Telegraph lead time** — every event's telegraph fires 5-15 seconds before onset so viewers
  see it coming while the player is heads-down typing.
- **Determinism** — same seed, same schedule, same event parameters. This is what makes
  race-this-seed and the daily fair.

## 7. Rules roster (~20 at launch)

Curated v1 returners: minimum length; contains a number, an uppercase letter, a special
character; digits sum to 25; roman numeral rules with the multiplication escalation; contains a
month of the year; today's Wordle answer (API); best move in the shown chess position (API);
the name of the shown country (API); a sponsor logo pick (comedy); maximum length cap of 40 to
create tension against additive rules.

New, event-coupled: the campfire must be burning at submit; Gerald must have been fed within the
last 60 seconds; no infected characters may remain; every alien in the final wave shot down;
contains the antidote formula shown during the infection; contains the current time (HH:MM,
live-revalidating); the "prove you are human" captcha whose answer is literally typing
"I am human".

Exact copy and final ordering are implementation-plan detail; the roster contract is: about 20
rules total, revealed in a fixed authored order interleaved with the Director's schedule, every
rule legible in a screenshot, and at least 5 rules coupled to event state.

## 8. Viewer-experience layer (the seven laws, as features)

1. **1080p legibility** — the password renders center-stage, large; rules and event UI are
   readable at stream compression. No critical information in small corner text.
2. **Dramatic irony is engineered** — telegraphs (sirens, shadows, wiggles, formation assembly)
   fire before onset, tuned so chat sees doom before the player.
3. **Anticipation over surprise** — nothing important happens in frame one; everything winds up.
4. **Failure transforms, never deletes** — no wiped passwords, no dead runs; disasters produce
   funnier state, not lost minutes.
5. **Clip-shaped arcs** — every event resolves in a 20-60 second arc with a clear peak.
6. **A cast, not mechanics** — creatures have names, name tags, and mood lines ("Gerald —
   disappointed"). The stream can root for them.
7. **Valleys between spikes** — the Director enforces breathing room so peaks land.

Concrete features: act title cards; an end-run **receipt card** (total time, rules survived,
letters abducted and rescued, creatures saved, biggest crisis) formatted as a printable receipt
for screenshots; a **race-this-seed** button that copies a seeded URL; a daily seed shared by
everyone; a subtle run timer always visible.

## 9. Scoring and leaderboard

- Score = completion time (lower is better). The clock runs from first keystroke to accepted
  submit. All penalties are time, applied diegetically (dealing with the disaster takes time).
- Leaderboard: new Postgres table `pg2_leaderboard_entries` (columns: id, name, time_ms, seed,
  daily flag, created_at), created if absent at first use, following the v1 store pattern. The
  v1 table is left untouched in the database; it simply loses its UI.
- Boards shown: today's daily seed, and all-time for the current seed. Name entry on the
  receipt card, same guarded-route validation pattern as v1 (zod, length caps, profanity-safe).

## 10. Architecture

- **Route**: `/games/password-game` — the sequel replaces v1 in place. v1 component code,
  styles, and rules are deleted in the same change; the games hub card is updated. The v1 API
  data routes that the new roster still uses (wordle, chess-puzzle, countries) are kept as-is;
  the leaderboard route is rewritten against the new table.
- **Engine** (`src/components/game/password-game-2/engine/`): pure TypeScript — game state,
  rule registry, event registry, the Director, the seeded RNG (mulberry32 + FNV-1a daily seed,
  reused from v1), and the tick loop. No DOM, no React. Fully unit-tested.
- **Stage** (`.../stage/`): React rendering — per-character DOM nodes (evolved from v1's
  rich-input) so individual characters can be abducted, frozen, infected, webbed, or orbited,
  plus a single canvas overlay above the box for creatures, fleets, and projectiles at 60fps.
  DOM for text and layout, canvas for motion — no three.js; this game is 2D.
- **Events** (`.../events/<id>.ts` + `.../events/render/<id>.tsx`): one logic module and one
  render module per event, registered in a manifest. Adding a post-launch event touches no
  engine code.
- **Sound** (`.../sound/`): procedural Web Audio behind a limiter bus (the architecture proven
  in the space-shooter overhaul): per-family motifs, telegraph stingers, a finale theme.
  Muted by default until the player interacts with the sound toggle, respecting the site
  pattern.
- **Server**: guarded JSON routes (existing `guardedJsonRoute` + zod pattern) for leaderboard
  read/write; existing data routes for wordle/chess/countries feeds.
- **Accessibility**: honors `prefers-reduced-motion` (screen shake and canvas flourishes off,
  events still legible), full keyboard play for everything except click-to-target events, which
  get keyboard fallbacks where feasible.

## 11. Art direction

A clean, boring, aggressively corporate sign-up form — invaded by CRT-flavored pixel/SVG sprite
creatures. The contrast is the joke: the calmer and more "enterprise" the form looks, the
funnier the bear is. All creature and effect art is real SVG/sprite assets (house rule: no emoji
glyphs anywhere). Palette: form neutrals plus one saturated accent per event family so viewers
learn to read incoming event types by color.

## 12. Testing

- Engine, Director, rules, and every event's logic module: vitest unit tests (pure and seeded,
  so deterministic). Coverage ratchets respected per DESIGN.md.
- Seed determinism test: same seed twice produces identical schedules and event parameters.
- Rule/event coupling tests: e.g. campfire-out fails the coupled rule; parasite present makes
  length reads differ by exactly one.
- Leaderboard store: temp-dir/ephemeral-DB harness per the persistence-tests-first house rule.
- Visual verification in a real browser (house rule) for each act's set pieces before any
  "done" claim, and before deploy.

## 13. Out of scope for launch (explicitly)

Mobile-optimized layouts; additional events beyond the 12 + boss (the manifest makes these
cheap post-launch drops); spectator/ghost mode; localization; replay export.

## 14. Open items resolved

- Route: replace v1 in place at `/games/password-game`. Decided.
- Roster size: 12 events + boss. Decided.
- Finale fail-state: phase-level knockback inside the finale only, clock as sole punishment.
  Decided.
- Title: "The Password Game 2: Terms and Conditions Apply" — working title, cheap to change
  before launch if a better subtitle lands.
