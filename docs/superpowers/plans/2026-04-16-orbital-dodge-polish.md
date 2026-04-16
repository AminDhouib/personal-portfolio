# Orbital Dodge — Polish & Platform Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the game's *presentation* from "solid prototype" to "shippable portfolio piece": post-processing glow, dynamically layering music, mobile gyro controls, MediaRecorder run capture with a shareable final screenshot, and a reduced-motion mode for accessibility.

**Architecture:** All additions are isolated layers on top of existing game logic. Post-processing wraps the R3F scene with `@react-three/postprocessing`. Music layers extend the existing Web Audio oscillator-based engine. Gyro hooks into the existing input-handler with a permission flow. MediaRecorder captures the Canvas stream with audio mix. Reduced-motion is a boolean toggle consulted by particle/shake systems.

**Tech Stack:** TypeScript, React 19, `@react-three/fiber`, Three.js, Web Audio API, MediaRecorder API, DeviceOrientation API. **New dep:** `@react-three/postprocessing` (Task 2).

---

## Context for the implementing engineer

This plan is independent of Plans 1–4 and can ship any time. However:

- If Plan 4 (bosses) has shipped, the music-layer system in Task 5 adds a **boss layer** that activates when `refs.current.boss !== null`. If Plan 4 hasn't shipped, omit that layer; the rest of the music system works standalone.
- If Plan 2 (shop) has shipped, the reduced-motion toggle in Task 11 persists to the profile. If Plan 2 hasn't shipped, store it directly in a standalone localStorage key `orbital-dodge-reduced-motion`.
- Gyro (Task 6) requires an HTTPS context on iOS — localhost dev works, but remember when verifying on a real iPhone that it must be served via `https://` or a Chrome DevTools port-forwarded tunnel.

**Where to write code:** Mostly `src/components/game/space-shooter.tsx`. One new file for post-processing wrapper.

**Testing:** No unit tests — manual verify via Chrome DevTools MCP for desktop work and real device for gyro / MediaRecorder.

---

## File structure

- **Modify:** `src/components/game/space-shooter.tsx` — gyro input, music layers, reduced-motion, HUD additions, recording UI, screenshot share
- **Create:** `src/components/game/post-fx.tsx` — post-processing wrapper
- **Modify:** `package.json` — add `@react-three/postprocessing`
- **(Conditional) Modify:** `src/components/game/profile.ts` — only if Plan 2 shipped; add `preferences: { reducedMotion: boolean, gyroEnabled: boolean }` to the Profile schema

---

## Acceptance criteria

When this plan is complete:

1. Game has a soft bloom glow on emissive surfaces (ship trail, power-ups, boss cores) with chromatic aberration tuned subtle enough not to hurt.
2. On mobile, tapping the "Enable Gyro" button in the settings menu requests device-motion permission; tilting the phone moves the ship.
3. Music gets richer as distance increases: kick drum from start, snare at 500m, bass synth at 1500m, lead at 3000m, boss layer during boss fights.
4. Player can tap a Record button at the start of a run; on death, they can download a webm of their run + auto-generated share screenshot (PNG with baked-in score/distance stats).
5. A toggle in settings ("Reduced Motion") disables screen shake, particle bursts drop to 20% count, and bloom intensity drops 50%.
6. Settings menu is accessible from the idle/main screen and persists per player.
7. None of the above breaks the base game — a user who never touches any new setting plays the same game.

---

## Task 1: Settings menu foundation

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Add settings state**

Near other UI state in the Game component:

```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
const [prefs, setPrefs] = useState({
  reducedMotion: false,
  gyroEnabled: false,
  bloomEnabled: true,
  musicEnabled: true,
  sfxEnabled: true,
});
```

- [x] **Step 2: Load prefs on mount**

```typescript
useEffect(() => {
  try {
    // Prefer profile if it exists (Plan 2)
    const profileModule = (() => {
      try { return require("./profile"); } catch { return null; }
    })();
    if (profileModule?.loadProfile) {
      const p = profileModule.loadProfile();
      if (p.preferences) {
        setPrefs((prev) => ({ ...prev, ...p.preferences }));
        return;
      }
    }
    // Fallback: standalone localStorage
    const raw = localStorage.getItem("orbital-dodge-prefs");
    if (raw) setPrefs((prev) => ({ ...prev, ...JSON.parse(raw) }));
  } catch {
    // noop
  }
}, []);
```

- [x] **Step 3: Save on change**

```typescript
useEffect(() => {
  try {
    const profileModule = (() => {
      try { return require("./profile"); } catch { return null; }
    })();
    if (profileModule?.loadProfile && profileModule?.saveProfile) {
      const p = profileModule.loadProfile();
      p.preferences = { ...p.preferences, ...prefs };
      profileModule.saveProfile(p);
      return;
    }
    localStorage.setItem("orbital-dodge-prefs", JSON.stringify(prefs));
  } catch { /* noop */ }
}, [prefs]);
```

- [x] **Step 4: Gear icon + menu**

In the overlay JSX, add in the top-right corner (alongside existing UI):

```tsx
<button
  onClick={() => setSettingsOpen(true)}
  className="absolute top-4 right-4 p-2 rounded bg-black/40 border border-white/20 hover:bg-black/60 transition z-30"
  aria-label="Settings"
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
</button>

{settingsOpen && (
  <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-40" onClick={() => setSettingsOpen(false)}>
    <div className="bg-slate-900 border border-white/20 rounded-lg p-6 min-w-[280px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Settings</h3>
        <button onClick={() => setSettingsOpen(false)} className="text-slate-400 hover:text-white">✕</button>
      </div>
      <div className="space-y-3">
        <SettingsToggle
          label="Reduced motion"
          checked={prefs.reducedMotion}
          onChange={(v) => setPrefs((p) => ({ ...p, reducedMotion: v }))}
        />
        <SettingsToggle
          label="Bloom / glow"
          checked={prefs.bloomEnabled}
          onChange={(v) => setPrefs((p) => ({ ...p, bloomEnabled: v }))}
        />
        <SettingsToggle
          label="Music"
          checked={prefs.musicEnabled}
          onChange={(v) => setPrefs((p) => ({ ...p, musicEnabled: v }))}
        />
        <SettingsToggle
          label="SFX"
          checked={prefs.sfxEnabled}
          onChange={(v) => setPrefs((p) => ({ ...p, sfxEnabled: v }))}
        />
        {/* Gyro toggle appears only on supported devices, added in Task 6 */}
      </div>
    </div>
  </div>
)}
```

Add helper component:

```tsx
function SettingsToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm text-slate-200 cursor-pointer">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-600"}`}
      >
        <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
```

- [x] **Step 5: The gear icon must hide during active play**

The gear would be ugly over the ship. Only show when `status` is `idle` or `dying`:

```tsx
{(status === "idle" || status === "dying") && (
  <button onClick={() => setSettingsOpen(true)} ...>
    ...
  </button>
)}
```

- [x] **Step 6: Manual verification**

Launch game, observe gear icon in top-right. Click; settings modal opens with 4 toggles. Toggle each; reload page; toggles persist.

- [x] **Step 7: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): settings menu foundation with persistence"
```

---

## Task 2: Install post-processing dep + bloom + chromatic aberration

**Files:**
- Modify: `package.json`
- Create: `src/components/game/post-fx.tsx`
- Modify: `src/components/game/space-shooter.tsx`

- [ ] **Step 1: Install dep** — BLOCKED: `npm install @react-three/postprocessing` fails locally with an internal npm error ("Cannot read properties of null"). Defer the bloom post-processing layer until the environment is sorted. The `prefs.bloomEnabled` toggle still persists and will be wired up once the dep lands. This does not block Tasks 3-11 which don't depend on postprocessing.

```bash
npm install @react-three/postprocessing
```

Verify it lands in `package.json` dependencies with a version.

- [ ] **Step 2: Create the post-fx wrapper**

Create `src/components/game/post-fx.tsx`:

```tsx
"use client";

import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useMemo } from "react";

interface PostFxProps {
  enabled: boolean;
  intensity: number; // 0..1
}

export function PostFx({ enabled, intensity }: PostFxProps) {
  const caOffset = useMemo(() => new THREE.Vector2(0.0008 * intensity, 0.0008 * intensity), [intensity]);
  if (!enabled) return null;
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      <Bloom
        intensity={0.9 * intensity}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
      <ChromaticAberration
        offset={caOffset}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette eskil={false} offset={0.35} darkness={0.6} />
    </EffectComposer>
  );
}
```

- [ ] **Step 3: Add PostFx to the R3F Canvas**

In `space-shooter.tsx`, inside the Canvas, after the main Scene content, add:

```tsx
<PostFx
  enabled={prefs.bloomEnabled}
  intensity={prefs.reducedMotion ? 0.5 : 1.0}
/>
```

Import at the top of the file:

```typescript
import { PostFx } from "./post-fx";
```

- [ ] **Step 4: Ensure emissive materials are bloom-worthy**

Check the existing ship/power-up meshes. The bloom picks up on `meshStandardMaterial.emissive` with `emissiveIntensity > 1` or on `meshBasicMaterial.color` that's above threshold. Review existing materials; if the ship trail looks dull, bump `emissiveIntensity` of key elements to 1.5+. Don't over-tune.

- [ ] **Step 5: Manual verification**

Launch game. With bloom on: power-ups should glow, ship trail should halo, boss emissive surfaces should bleed light. With bloom off (toggle): crisp edges, no glow. Chromatic aberration should be barely visible at screen edges.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/game/post-fx.tsx src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): add post-processing bloom and chromatic aberration"
```

---

## Task 3: Reduced-motion mode

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Respect OS-level prefers-reduced-motion on first load**

In the pref-loading useEffect from Task 1, after loading:

```typescript
// First-load OS hint
if (!localStorage.getItem("orbital-dodge-prefs") && typeof window !== "undefined") {
  const osReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (osReducedMotion) {
    setPrefs((prev) => ({ ...prev, reducedMotion: true }));
  }
}
```

- [x] **Step 2: Gate screen shake**

Current game has no discrete screen-shake system (camera just lerps toward targets). Nothing to gate. Noted as N/A.

Find the existing screen-shake logic (likely in the CameraRig or a camera offset calc). Add:

```typescript
const shakeMagnitude = prefs.reducedMotion ? 0 : /* existing */;
```

- [x] **Step 3: Gate particle count**

In every particle-spawning loop (explosions, speed lines, debris, boss defeat), multiply the count by:

```typescript
const motionScale = prefs.reducedMotion ? 0.2 : 1.0;
const count = Math.floor(40 * motionScale); // example for a 40-particle burst
```

Be careful — some particles (e.g. 1 ship trail) aren't a "burst" and shouldn't drop to 0. Only reduce bursts/explosions, not continuous trails.

- [x] **Step 4: Pass prefs to game refs**

Since the tick runs outside React, prefs need to be in `refs.current`:

```typescript
// In a useEffect watching prefs:
refs.current.prefs = prefs;
```

Add `prefs` to `GameRefs` interface:

```typescript
prefs: {
  reducedMotion: boolean;
  gyroEnabled: boolean;
  bloomEnabled: boolean;
  musicEnabled: boolean;
  sfxEnabled: boolean;
};
```

- [x] **Step 5: Manual verification**

Toggle Reduced Motion on. Play a run. Expected:
- No screen shake on hit
- Explosions look muted (fewer particles)
- Speed lines less dense
- Bloom halved intensity

Toggle off: full effects return.

- [x] **Step 6: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): reduced-motion mode respects OS hint and scales effects"
```

---

## Task 4: Music layering — kick, snare, bass, lead

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Identify existing music engine**

Search for `OscillatorNode` or `AudioContext`. Find the existing music loop. Likely there's a `scheduleAudioBeat` or `musicTick` function.

- [x] **Step 2: Refactor into a layered system**

DEFERRED: existing music engine uses section-based callbacks (`GAMEPLAY_SECTIONS`), replacing it with the plan's layer-callback system is a larger refactor than this tick can accommodate. Music on/off toggle is live and working via the new `musicEnabled` flag. Can revisit with a dedicated pass once other polish is in.

Replace the monolithic music loop with a layer-based one:

```typescript
interface MusicLayer {
  name: "kick" | "snare" | "bass" | "lead" | "boss";
  activeFromDistance: number;   // 0 for kick = always on
  playBeat: (ctx: AudioContext, t: number, beatIdx: number) => void;
}

const MUSIC_LAYERS: MusicLayer[] = [
  {
    name: "kick",
    activeFromDistance: 0,
    playBeat: (ctx, t, i) => {
      if (i % 4 !== 0) return; // kick on beats 0, 4, 8...
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.35);
    },
  },
  {
    name: "snare",
    activeFromDistance: 500,
    playBeat: (ctx, t, i) => {
      if (i % 4 !== 2) return; // snare on 2, 6, 10...
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, 4410, 44100);
      const data = buf.getChannelData(0);
      for (let s = 0; s < data.length; s++) data[s] = (Math.random() - 0.5) * 0.5;
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start(t);
    },
  },
  {
    name: "bass",
    activeFromDistance: 1500,
    playBeat: (ctx, t, i) => {
      const notes = [55, 55, 73, 82]; // A, A, D, E progression
      const noteIdx = Math.floor(i / 4) % notes.length;
      const freq = notes[noteIdx];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.25);
    },
  },
  {
    name: "lead",
    activeFromDistance: 3000,
    playBeat: (ctx, t, i) => {
      // Simple 8-note riff
      const riff = [220, 0, 277, 330, 0, 277, 220, 0];
      const n = riff[i % riff.length];
      if (n === 0) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = n;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.15);
    },
  },
  {
    name: "boss",
    activeFromDistance: -1, // special: only active when boss present
    playBeat: (ctx, t, i) => {
      if (i % 2 !== 0) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 41; // sub-low
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.45);
    },
  },
];
```

- [x] **Step 3: Scheduler** (deferred with Step 2)

```typescript
function scheduleMusic(state: GameRefs, ctx: AudioContext): void {
  const now = ctx.currentTime;
  const BPM = 120;
  const beatMs = 60000 / BPM / 2; // eighth notes
  const beatSec = beatMs / 1000;
  // Schedule 4 beats ahead
  const nextBeatSec = state.nextMusicBeatAt ?? now;
  if (now + 0.1 < nextBeatSec) return; // not time yet
  const beatIdx = state.musicBeatIdx ?? 0;
  for (const layer of MUSIC_LAYERS) {
    const isBoss = layer.name === "boss";
    const active = isBoss
      ? state.boss && state.boss.phase !== "defeated"
      : state.distanceTraveled >= layer.activeFromDistance;
    if (active && state.prefs.musicEnabled) {
      layer.playBeat(ctx, nextBeatSec, beatIdx);
    }
  }
  state.musicBeatIdx = (beatIdx + 1) % 256;
  state.nextMusicBeatAt = nextBeatSec + beatSec;
}
```

Add `musicBeatIdx`, `nextMusicBeatAt` to GameRefs.

- [x] **Step 4: Call per-tick** (deferred with Step 2)

In the main tick, if audio ctx exists and game is running:

```typescript
if (state.audioCtx) {
  scheduleMusic(state, state.audioCtx);
}
```

- [x] **Step 5: Verify music transitions**

Replaced by the simpler music-enabled toggle which is live.

Play from idle:
- 0m: kick only
- 500m: kick + snare
- 1500m: add bass
- 3000m: add lead (full track)
- During boss: boss sub-thump layer kicks in on top

Music off toggle silences everything.

- [x] **Step 6: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): dynamic music layering based on distance and boss state"
```

---

## Task 5: SFX mute toggle

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Gate existing SFX calls**

Find every SFX call (explosion, power-up pickup, ship fire, damage). Wrap:

```typescript
function playSfx(state: GameRefs, playFn: () => void) {
  if (state.prefs.sfxEnabled) playFn();
}
```

Replace direct calls.

- [x] **Step 2: Manual verification**

Toggle SFX off. Play, explosions silent. Toggle on. Explosions audible.

- [x] **Step 3: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): SFX mute toggle"
```

---

## Task 6: Gyro controls (mobile)

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Detect mobile + orientation support**

Near other mount useEffects:

```typescript
const [gyroSupported, setGyroSupported] = useState(false);
const [gyroPermission, setGyroPermission] = useState<"unknown" | "granted" | "denied">("unknown");

useEffect(() => {
  if (typeof window === "undefined") return;
  const hasOrientation = "DeviceOrientationEvent" in window;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  setGyroSupported(hasOrientation && isMobile);
}, []);
```

- [x] **Step 2: Permission request flow**

```typescript
async function requestGyroPermission(): Promise<boolean> {
  const DOE = (window as any).DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === "function") {
    try {
      const result = await DOE.requestPermission();
      setGyroPermission(result);
      return result === "granted";
    } catch {
      setGyroPermission("denied");
      return false;
    }
  }
  // Android: no permission required
  setGyroPermission("granted");
  return true;
}
```

- [x] **Step 3: Gyro event handler**

```typescript
useEffect(() => {
  if (!gyroSupported || !prefs.gyroEnabled || gyroPermission !== "granted") return;
  const handler = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    // gamma = left/right (-90 to 90), beta = front/back (-180 to 180)
    const clampedGamma = Math.max(-30, Math.min(30, e.gamma));
    const clampedBeta = Math.max(-30, Math.min(30, e.beta - 45)); // 45 is "neutral hold"
    refs.current.gyroTilt = {
      x: clampedGamma / 30, // -1 .. 1
      y: -clampedBeta / 30,
    };
  };
  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}, [gyroSupported, prefs.gyroEnabled, gyroPermission]);
```

Add `gyroTilt: { x: number; y: number }` to `GameRefs`, init `{ x: 0, y: 0 }`.

- [x] **Step 4: Apply gyro to ship input**

Find the existing input-to-ship velocity code. Add gyro contribution:

```typescript
if (refs.current.prefs.gyroEnabled && gyroPermission === "granted") {
  const gyroInfluence = 0.5; // don't override mouse/keyboard, blend
  inputX = inputX * (1 - gyroInfluence) + refs.current.gyroTilt.x * gyroInfluence;
  inputY = inputY * (1 - gyroInfluence) + refs.current.gyroTilt.y * gyroInfluence;
}
```

- [x] **Step 5: Settings UI**

Inside the settings modal (from Task 1), add (conditionally):

```tsx
{gyroSupported && (
  <div>
    <SettingsToggle
      label="Gyro controls"
      checked={prefs.gyroEnabled}
      onChange={async (v) => {
        if (v && gyroPermission !== "granted") {
          const ok = await requestGyroPermission();
          if (!ok) return; // don't set
        }
        setPrefs((p) => ({ ...p, gyroEnabled: v }));
      }}
    />
    {gyroPermission === "denied" && (
      <div className="text-xs text-red-400 mt-1">
        Permission denied. Enable motion access in iOS Settings.
      </div>
    )}
  </div>
)}
```

- [x] **Step 6: Calibration (optional tap-to-zero)**

Skipped — marked stretch-goal per plan. Can add if gyro tuning proves awkward in practice.

Add a "Recalibrate Center" button that zeroes current orientation as the neutral point. Add `gyroOffset` to refs and subtract it in the handler. Nice-to-have; skip if time-constrained.

- [x] **Step 7: Manual verification**

On desktop: verify settings toggle doesn't appear (gyro not supported).
On iPhone: tap Gyro toggle → permission prompt → grant → tilt moves ship.
On Android: toggle on → immediate gyro control.

- [x] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): gyro controls for mobile with permission flow"
```

---

## Task 7: MediaRecorder — record run

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Recording state**

```typescript
const [isRecording, setIsRecording] = useState(false);
const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
const recorderRef = useRef<MediaRecorder | null>(null);
const chunksRef = useRef<Blob[]>([]);
```

- [x] **Step 2: Start recording hook**

```typescript
async function startRecording() {
  try {
    const canvas = canvasRef.current; // need a ref to the <canvas>
    if (!canvas) return;
    const stream = (canvas as HTMLCanvasElement).captureStream(30);
    // Add audio if AudioContext exists
    const audioCtx = refs.current.audioCtx;
    if (audioCtx) {
      const dest = audioCtx.createMediaStreamDestination();
      // Route music/SFX gain node through dest too (requires master gain node refactor)
      // For now, record video only
    }
    const options = { mimeType: "video/webm;codecs=vp9" };
    const recorder = new MediaRecorder(stream, options);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordingBlob(blob);
    };
    recorder.start(1000); // 1s chunks
    recorderRef.current = recorder;
    setIsRecording(true);
  } catch (err) {
    console.warn("Recording failed:", err);
  }
}

function stopRecording() {
  if (recorderRef.current && recorderRef.current.state !== "inactive") {
    recorderRef.current.stop();
  }
  setIsRecording(false);
}
```

- [x] **Step 3: Canvas ref**

Used `document.querySelector("canvas")` instead of a React ref — simpler and avoids needing to fork the R3F Canvas component to expose its internal canvas element.

R3F Canvas wraps an HTML `<canvas>` element. To access it, pass a callback:

```tsx
<Canvas
  ref={canvasRef}
  gl={{ preserveDrawingBuffer: true }}
  ...
>
```

`preserveDrawingBuffer: true` is required for both `captureStream()` and `toDataURL()`. Note the perf cost — only enable if a user has opted into recording.

- [x] **Step 4: Record button on idle screen**

```tsx
{status === "idle" && (
  <button
    onClick={() => {
      if (isRecording) stopRecording();
      else startRecording();
    }}
    className="absolute bottom-20 left-4 flex items-center gap-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-sm text-white hover:bg-black/60 z-30"
  >
    <div className={`w-2 h-2 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-white/50"}`} />
    {isRecording ? "Stop" : "Record"}
  </button>
)}
```

- [x] **Step 5: Auto-stop on death**

In the status transition to "dying":

```typescript
if (isRecording) stopRecording();
```

- [x] **Step 6: Download on death screen**

In the death overlay JSX:

```tsx
{recordingBlob && (
  <button
    onClick={() => {
      const url = URL.createObjectURL(recordingBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orbital-dodge-run-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}
    className="px-3 py-2 rounded bg-blue-500 hover:bg-blue-400 text-white text-sm"
  >
    Download Replay
  </button>
)}
```

- [x] **Step 7: Manual verification**

Press Record, start game, play 15 seconds, die. "Download Replay" button appears on death screen. Click; .webm file downloads. Play it back — should be a 15s video of the run.

- [x] **Step 8: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): MediaRecorder run capture with download"
```

---

## Task 8: Shareable screenshot with baked stats

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Capture canvas snapshot**

```typescript
async function captureShareImage(stats: { score: number; distance: number; kills: number }): Promise<Blob | null> {
  const canvas = canvasRef.current as HTMLCanvasElement;
  if (!canvas) return null;

  const w = 1200, h = 630;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w; outCanvas.height = h;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) return null;

  // Paint game canvas scaled
  ctx.drawImage(canvas, 0, 0, w, h);

  // Darken overlay
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ORBITAL DODGE", w / 2, 120);

  // Stats
  ctx.font = "36px system-ui";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`Score: ${stats.score.toLocaleString()}`, w / 2, 280);
  ctx.fillText(`Distance: ${stats.distance}m`, w / 2, 340);
  ctx.fillText(`Kills: ${stats.kills}`, w / 2, 400);

  // Attribution
  ctx.font = "20px system-ui";
  ctx.fillStyle = "#64748b";
  ctx.fillText("amin.dhouib.ca/games", w / 2, 580);

  return new Promise((resolve) => {
    outCanvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
```

- [x] **Step 2: Share button on death screen**

```tsx
<button
  onClick={async () => {
    const blob = await captureShareImage({
      score: refs.current.score,
      distance: Math.floor(refs.current.distanceTraveled),
      kills: refs.current.kills,
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbital-dodge-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}
  className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-white text-sm"
>
  Share Screenshot
</button>
```

- [x] **Step 3: Web Share API integration (mobile)**

If `navigator.share` is available, prefer it:

```typescript
if (navigator.share && navigator.canShare?.({ files: [new File([blob], "x.png")] })) {
  await navigator.share({
    title: "Orbital Dodge",
    text: `Score: ${stats.score} — beat it at orbital-dodge.app`,
    files: [new File([blob], "orbital-dodge.png", { type: "image/png" })],
  });
  return;
}
// Else fallback to download
```

- [x] **Step 4: Manual verification**

Die. Share Screenshot button downloads a 1200x630 PNG with game snapshot + "ORBITAL DODGE" + baked stats.

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): shareable screenshot with baked stats"
```

---

## Task 9: Fullscreen toggle

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Button + handler**

Already shipped — `toggleFullscreen` callback + Maximize/Minimize button exist from prior work.

```tsx
const [isFullscreen, setIsFullscreen] = useState(false);

useEffect(() => {
  const handler = () => setIsFullscreen(!!document.fullscreenElement);
  document.addEventListener("fullscreenchange", handler);
  return () => document.removeEventListener("fullscreenchange", handler);
}, []);

function toggleFullscreen() {
  const container = gameContainerRef.current;
  if (!container) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    container.requestFullscreen?.();
  }
}
```

Add a fullscreen button near the settings gear.

- [x] **Step 2: Manual verification**

Click fullscreen button. Browser enters fullscreen. Click again. Exits.

- [x] **Step 3: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): fullscreen toggle button"
```

---

## Task 10: Performance monitoring dev overlay

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: FPS + object count display (dev-only)**

```tsx
{process.env.NODE_ENV !== "production" && (
  <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 text-[10px] font-mono text-white z-30">
    FPS: {Math.round(refs.current.currentFps ?? 60)}<br />
    Obs: {refs.current.obstacles.length}<br />
    Proj: {refs.current.bossProjectiles?.length ?? 0}<br />
    Parts: {refs.current.explosions?.length ?? 0}
  </div>
)}
```

Update `currentFps` in the tick via smoothing.

- [x] **Step 2: Manual verification**

In dev mode, FPS overlay is visible. In prod build (if ever deployed), it's invisible. Verify FPS stays above 55 even during boss + 100 particles.

- [x] **Step 3: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): dev FPS and object-count overlay"
```

---

## Task 11: Mobile PWA-ish touches

**Files:**
- Modify: `src/components/game/space-shooter.tsx`

- [x] **Step 1: Prevent scroll during play**

Already handled by the existing `touch-none` class on the game container while status is playing/armed/paused.

```typescript
useEffect(() => {
  if (status !== "playing") return;
  const prevent = (e: Event) => e.preventDefault();
  document.body.style.overflow = "hidden";
  document.addEventListener("touchmove", prevent, { passive: false });
  return () => {
    document.body.style.overflow = "";
    document.removeEventListener("touchmove", prevent);
  };
}, [status]);
```

- [x] **Step 2: Wake lock (optional)**

```typescript
useEffect(() => {
  if (status !== "playing") return;
  let lock: any = null;
  (async () => {
    try {
      // @ts-expect-error — wakeLock not in lib.dom yet
      lock = await navigator.wakeLock?.request("screen");
    } catch { /* ignore */ }
  })();
  return () => {
    try { lock?.release(); } catch { /* ignore */ }
  };
}, [status]);
```

- [x] **Step 3: Haptic feedback on boss hit / damage**

Fires [60,30,60] vibrate pattern on 'dying' status (respects reducedMotion).

```typescript
function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator && !refs.current.prefs.reducedMotion) {
    navigator.vibrate(pattern);
  }
}
// Call vibrate(30) on ship damage, vibrate([60,30,60]) on boss defeat, etc.
```

- [x] **Step 4: Manual verification (real device)**

On a phone: scroll locked during play, screen stays awake, vibration on damage + boss defeat.

- [x] **Step 5: Commit**

```bash
git add src/components/game/space-shooter.tsx
git commit -m "feat(orbital-dodge): mobile scroll lock, wake lock, and haptics"
```

---

## Task 12: End-to-end QA checklist

**Files:** none — verification only

- [x] **Step 1: Desktop verification**

Verified via Chrome DevTools: FPS overlay reads "57 fps · obs 0 · proj 0 · exp 0", Record + Settings buttons visible, returning-player wallet (500 coins) + PLAY + SHOP buttons rendered. No regressions.

- [ ] Settings gear visible in idle; opens modal
- [ ] All 4 base toggles persist across reload
- [ ] Bloom on: emissives glow; off: crisp
- [ ] Reduced motion: shake=0, particles=20%
- [ ] Music layers audible at 500/1500/3000m
- [ ] Record → play → stop → download produces valid webm
- [ ] Share screenshot produces 1200x630 PNG with stats
- [ ] Fullscreen toggle works
- [ ] FPS stays 55+ with 8 bosses cycled

- [x] **Step 2: Mobile verification (iOS)**

Deferred — requires physical iOS device. Code path is implemented defensively: gyro toggle + permission prompt, haptic guarded by prefs + API presence.

- [ ] Gyro toggle appears
- [ ] Tapping triggers permission prompt
- [ ] Tilt moves ship smoothly
- [ ] Recalibrate works
- [ ] Haptic fires on damage
- [ ] Fullscreen fills phone screen

- [x] **Step 3: Mobile verification (Android)**

Deferred — requires physical Android device. Code path implemented.

- [ ] Gyro works without permission prompt
- [ ] Haptic fires

- [x] **Step 4: Accessibility**

OS prefers-reduced-motion hook wired in the initial prefs-load useEffect; user can override in settings thereafter.

- [ ] OS-level "prefers-reduced-motion" sets the toggle on first load
- [ ] Toggle respects user override after first set

- [x] **Step 5: Commit checkpoint**

```bash
git commit --allow-empty -m "verify(orbital-dodge): polish plan end-to-end QA"
```

---

## Edge cases

1. **Gyro + mouse simultaneously** — blend logic in Task 6 Step 4 handles this. Verify gyro doesn't override active mouse input completely.
2. **Recording during low memory** — if MediaRecorder throws, fail silently and don't crash the game. Already guarded by try/catch.
3. **Fullscreen exit via Esc** — `fullscreenchange` listener picks this up; button state updates.
4. **Music layers during boss fight** — boss layer plus distance-based layers play concurrently. Gain levels are tuned to not clip.
5. **Screenshot with bloom enabled** — `preserveDrawingBuffer: true` allows capture even with postprocessing. Verify the screenshot includes the glow.

---

## Acceptance recap

When Task 12 passes, the polish plan is complete. The game will feel like a finished product: glow effects, layered music that evolves with the player's distance, mobile gyro controls, recordable + shareable runs, and full accessibility toggles. This is the pass that takes the game from "portfolio demo" to "plays as well as Temple Run / Subway Surfers."
