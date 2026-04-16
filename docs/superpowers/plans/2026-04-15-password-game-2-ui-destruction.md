# Password Game 2: Progressive UI Destruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game's UI visually deteriorate as the player progresses — pristine at Tier 1, hairline cracks at Tier 3, structural damage at Tier 4, total chaos at Tier 5. This creates "clip moments" for streamers and reinforces the escalating difficulty.

**Architecture:** A single `--pg-chaos` CSS custom property (0-5) drives all visual effects. Effects are pure CSS with SVG overlays — no new React state, no animation libraries. The game component derives the chaos level from the highest tier of satisfied rules.

**Tech Stack:** Tailwind CSS 4 (with CSS custom properties), SVG for cracks, CSS animations for shake/glitch/flicker.

---

## Scope

**In scope:**
- `--pg-chaos` level computed from game progression (0 baseline → 5 all tiers)
- SVG crack overlay (intensifies with level)
- Background color drift
- Container shake on new rule reveal (intensifies with level)
- Rule card jitter at high levels
- Screen flicker at level 5
- Text glitch effect on rule descriptions at level 5

**Out of scope:**
- Sound effects (separate plan)
- Submit button dodging cursor (Tier 5 mechanic, lives in adversarial plan)
- Particle effects (dust, sparks)

---

## File Structure

**Create:**
- `src/components/game/password-game/destruction.css` — all chaos-level CSS
- `src/components/game/password-game/destruction.tsx` — `<DestructionOverlay>` component (SVG cracks)

**Modify:**
- `src/components/game/password-game/password-game.tsx` — compute chaos level, inject CSS variable, render overlay
- `src/app/globals.css` — import the destruction stylesheet

---

## Task 1: Destruction CSS

**Files:**
- Create: `src/components/game/password-game/destruction.css`

- [ ] **Step 1: Write the CSS**

Create `src/components/game/password-game/destruction.css`:

```css
/*
 * Password Game 2 — Progressive UI Destruction
 * Controlled by --pg-chaos (0-5). Level 0 is pristine; level 5 is total chaos.
 * All effects are additive: higher levels stack on top of lower ones.
 */

.pg-chaos-root {
  --pg-chaos: 0;
  --pg-shake-x: 0px;
  --pg-shake-y: 0px;
  --pg-hue-shift: 0deg;
  --pg-saturate: 1;
  position: relative;
  transition: filter 600ms ease-out, background-color 600ms ease-out;
  filter: hue-rotate(var(--pg-hue-shift)) saturate(var(--pg-saturate));
}

/* Level 1-2: pristine. No effects beyond baseline. */

/* Level 3: hairline fractures and subtle shake on rule reveal. */
.pg-chaos-root[data-chaos="3"] {
  --pg-hue-shift: 3deg;
  animation: pg-drift 12s ease-in-out infinite;
}

/* Level 4: structural damage. */
.pg-chaos-root[data-chaos="4"] {
  --pg-hue-shift: -6deg;
  --pg-saturate: 0.85;
  animation: pg-drift 8s ease-in-out infinite;
}

/* Level 5: total chaos. */
.pg-chaos-root[data-chaos="5"] {
  --pg-hue-shift: 12deg;
  --pg-saturate: 0.7;
  animation: pg-drift 4s ease-in-out infinite, pg-flicker 7s steps(1) infinite;
}

@keyframes pg-drift {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(1px, -1px); }
  50% { transform: translate(-1px, 1px); }
  75% { transform: translate(1px, 1px); }
}

@keyframes pg-flicker {
  0%, 4%, 100% { opacity: 1; filter: invert(0); }
  2% { opacity: 0.92; filter: invert(0.05); }
  3% { opacity: 1; filter: invert(0); }
}

/* Rule card jitter for level 4+ */
.pg-chaos-root[data-chaos="4"] .pg-rule-card,
.pg-chaos-root[data-chaos="5"] .pg-rule-card {
  animation: pg-card-jitter 3.5s ease-in-out infinite;
  animation-delay: calc(var(--pg-card-idx, 0) * -0.2s);
}

@keyframes pg-card-jitter {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  50% { transform: translate(0.5px, -0.5px) rotate(-0.15deg); }
}

/* Text glitch overlay for level 5 on rule descriptions */
.pg-chaos-root[data-chaos="5"] .pg-rule-description {
  position: relative;
  animation: pg-glitch-color 4s steps(1) infinite;
}

@keyframes pg-glitch-color {
  0%, 97%, 100% { text-shadow: none; }
  98% { text-shadow: 1px 0 #ff003c, -1px 0 #00f0ff; }
  99% { text-shadow: -1px 0 #ff003c, 1px 0 #00f0ff; }
}

/* Crack overlay — positioned absolute inside .pg-chaos-root. */
.pg-cracks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 800ms ease-out;
  mix-blend-mode: multiply;
}

.pg-chaos-root[data-chaos="3"] .pg-cracks { opacity: 0.18; }
.pg-chaos-root[data-chaos="4"] .pg-cracks { opacity: 0.42; }
.pg-chaos-root[data-chaos="5"] .pg-cracks { opacity: 0.75; }

/* Reveal pulse — one-shot shake when a new rule appears. */
.pg-chaos-root[data-chaos="3"] .pg-rule-card[data-new="true"] { animation: pg-pulse 280ms ease-out; }
.pg-chaos-root[data-chaos="4"] .pg-rule-card[data-new="true"] { animation: pg-pulse-hard 320ms ease-out; }
.pg-chaos-root[data-chaos="5"] .pg-rule-card[data-new="true"] { animation: pg-pulse-chaotic 360ms ease-out; }

@keyframes pg-pulse {
  0% { transform: translate(0, 0); }
  30% { transform: translate(2px, -1px); }
  60% { transform: translate(-2px, 1px); }
  100% { transform: translate(0, 0); }
}

@keyframes pg-pulse-hard {
  0% { transform: translate(0, 0) rotate(0); }
  20% { transform: translate(-4px, 2px) rotate(-0.5deg); }
  40% { transform: translate(4px, -2px) rotate(0.5deg); }
  60% { transform: translate(-2px, 1px) rotate(-0.25deg); }
  100% { transform: translate(0, 0) rotate(0); }
}

@keyframes pg-pulse-chaotic {
  0% { transform: translate(0, 0); filter: blur(0); }
  15% { transform: translate(-6px, 3px); filter: blur(1px); }
  30% { transform: translate(6px, -3px); filter: blur(1px); }
  50% { transform: translate(-3px, -4px); filter: blur(0.5px); }
  70% { transform: translate(4px, 2px); filter: blur(0); }
  100% { transform: translate(0, 0); filter: blur(0); }
}

/* Container — progressive border damage via box-shadow layering. */
.pg-chaos-root[data-chaos="4"] .pg-container {
  box-shadow:
    inset 0 0 0 1px rgba(255, 0, 60, 0.08),
    inset 0 0 16px rgba(255, 0, 60, 0.06);
}

.pg-chaos-root[data-chaos="5"] .pg-container {
  box-shadow:
    inset 0 0 0 1px rgba(255, 0, 60, 0.2),
    inset 0 0 24px rgba(255, 0, 60, 0.15),
    0 0 0 1px rgba(0, 240, 255, 0.08);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/destruction.css
git commit -m "feat(password-game): add progressive UI destruction stylesheet"
```

---

## Task 2: Import destruction CSS globally

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Read the current file**

Read `src/app/globals.css` to see its top-of-file imports/structure.

- [ ] **Step 2: Append the import**

At the very bottom of `src/app/globals.css`, add:

```css
@import "../components/game/password-game/destruction.css";
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(password-game): wire destruction stylesheet into globals"
```

---

## Task 3: Crack overlay component

**Files:**
- Create: `src/components/game/password-game/destruction.tsx`

- [ ] **Step 1: Implement**

Create `src/components/game/password-game/destruction.tsx`:

```typescript
"use client";

/**
 * Decorative SVG overlay that renders progressively more cracks as the chaos
 * level rises. The opacity is driven by the data-chaos attribute on the
 * enclosing .pg-chaos-root (see destruction.css).
 *
 * Cracks are pure SVG paths — no external assets, no state.
 */
export function CracksOverlay() {
  return (
    <svg
      className="pg-cracks"
      viewBox="0 0 400 400"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g stroke="currentColor" strokeLinecap="round" fill="none" opacity="0.9">
        {/* Short cracks — visible from level 3 (via CSS opacity). */}
        <path d="M 60 20 L 72 40 L 70 60" strokeWidth="0.6" />
        <path d="M 330 25 L 340 48 L 332 68" strokeWidth="0.6" />
        <path d="M 20 150 L 45 165 L 55 190" strokeWidth="0.5" />
        <path d="M 370 180 L 355 200 L 360 225" strokeWidth="0.5" />

        {/* Medium cracks — more visible at level 4. */}
        <path d="M 100 10 L 120 45 L 115 85 L 135 120" strokeWidth="0.9" />
        <path d="M 280 380 L 265 340 L 280 300 L 270 260" strokeWidth="0.9" />
        <path d="M 380 60 L 350 100 L 360 140" strokeWidth="0.8" />

        {/* Large jagged cracks — dominant at level 5. */}
        <path
          d="M 0 90 L 30 100 L 60 85 L 95 110 L 130 95 L 170 130 L 200 115 L 240 150 L 280 135 L 320 165 L 360 150 L 400 175"
          strokeWidth="1.1"
        />
        <path
          d="M 200 0 L 210 35 L 195 70 L 215 105 L 200 140 L 220 175 L 205 210 L 225 245"
          strokeWidth="1"
        />
        <path
          d="M 0 300 L 40 290 L 80 310 L 120 295 L 160 315 L 200 300 L 240 320 L 280 305"
          strokeWidth="0.9"
        />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/password-game/destruction.tsx
git commit -m "feat(password-game): add SVG cracks overlay component"
```

---

## Task 4: Compute chaos level and wire overlay

**Files:**
- Modify: `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Add imports**

At the top of the file, add:

```typescript
import { CracksOverlay } from "./destruction";
```

- [ ] **Step 3: Compute chaos level**

In the `PasswordGame` component body, after the `const satisfiedCount = ...` line (and before the `useForeshadowTrigger` call), add:

```typescript
  // Chaos level = the highest tier the player has unlocked, bumped by 1 per
  // fully cleared tier. We floor at 0 and cap at 5 to keep CSS contracts stable.
  const chaosLevel = useMemo(() => {
    let max = 0;
    for (const rule of rules) {
      // A tier's effect kicks in as soon as one rule from that tier is revealed
      // (i.e. any prior rule was satisfied). Revealed = earlier rule passed.
      const idx = rules.indexOf(rule);
      const earlierAllPassed = idx === 0 || results.slice(0, idx).every((r) => r.passed);
      if (earlierAllPassed) {
        max = Math.max(max, rule.tier);
      }
    }
    return Math.min(5, Math.max(0, max));
  }, [rules, results]);
```

- [ ] **Step 4: Apply chaos data attribute and class**

Find the outer wrapper div:
```typescript
    <div
      ref={containerRef}
      className="w-full rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6"
    >
```

Replace with:
```typescript
    <div
      ref={containerRef}
      className="pg-chaos-root w-full relative"
      data-chaos={chaosLevel}
    >
      <CracksOverlay />
      <div className="pg-container relative rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6">
```

The closing `</div>` structure needs one extra closing tag at the end. Find the final `</div>` that closes the outer wrapper and add a matching inner `</div>` immediately before it:

Find the existing closing sequence:
```typescript
      <ForeshadowOverlay
        kind={foreshadowKind}
        active={foreshadowFired}
        containerRef={containerRef}
      />
    </div>
  );
}
```

Replace with:
```typescript
      <ForeshadowOverlay
        kind={foreshadowKind}
        active={foreshadowFired}
        containerRef={containerRef}
      />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add chaos class to rule cards**

Find the `<RuleCard ... />` call inside `visibleRules.map`. The rule card lives in a separate file. To avoid changing the `RuleCard` API (and re-reviewing every caller), wrap the rendered card with a div that carries the chaos class:

Find:
```typescript
        {visibleRules.map((rule, i) => (
          <RuleCard
            key={`${rule.id}-${i}`}
            rule={rule}
            result={visibleResults[i]}
            index={i}
            isActive={i === activeIdx}
          />
        ))}
```

Replace with:
```typescript
        {visibleRules.map((rule, i) => (
          <div
            key={`${rule.id}-${i}`}
            className="pg-rule-card"
            style={{ ["--pg-card-idx" as string]: i }}
          >
            <RuleCard
              rule={rule}
              result={visibleResults[i]}
              index={i}
              isActive={i === activeIdx}
            />
          </div>
        ))}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- password-game`
Expected: all 80 tests still pass (no logic changed).

- [ ] **Step 7: Commit**

```bash
git add src/components/game/password-game/password-game.tsx
git commit -m "feat(password-game): wire chaos level to UI destruction overlay"
```

---

## Task 5: Tag rule description for glitch targeting

**Files:**
- Modify: `src/components/game/password-game/rule-card.tsx`

The level-5 glitch CSS targets `.pg-rule-description`. Add that class to the description element.

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Update the description element**

Find:
```typescript
          <div className={`text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            <RuleDescription text={rule.description} />
          </div>
```

Replace with:
```typescript
          <div className={`pg-rule-description text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            <RuleDescription text={rule.description} />
          </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/game/password-game/rule-card.tsx
git commit -m "feat(password-game): tag rule description for chaos glitch effect"
```

---

## Task 6: Verify in browser

**Files:** None (verification).

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- password-game`
Expected: all 80 tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new password-game errors.

- [ ] **Step 3: Manual browser test**

With dev server running, visit `/games/password-game`:

- **Tier 1 (baseline):** UI looks pristine. No shake, no cracks, no hue shift.
- **Unlock Rule 5 (Tier 2 kicks in):** Should still look clean. `data-chaos` = 2 (no CSS effects at 2).
- **Add a data-chaos=3 temporarily:** Use DevTools to set the root's `data-chaos="3"` attribute and confirm faint cracks + drift animation kick in.
- **data-chaos=4:** Cracks stronger, rule cards jittering, red glow on container.
- **data-chaos=5:** Full chaos — cracks dominant, flicker, text RGB glitch, jagged shake.

---

## Self-Review

- Chaos levels map 1:1 to spec tiers 1-5.
- All effects are pure CSS/SVG — no new deps, no JS animation frames.
- No logic changed in tests → tests continue to pass.
- `--pg-card-idx` CSS variable is set per card so animation delays offset — keeps jitter looking organic rather than synchronized.
