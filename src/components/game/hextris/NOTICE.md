# Hextris licence notice

The Hextris game on /games/hextris is licensed under the GNU General Public License,
version 3 only (SPDX: `GPL-3.0-only`). The full text is in [COPYING](./COPYING).

## What is derived

The game engine is a TypeScript port of Hextris, <https://github.com/Hextris/hextris>,
Copyright (C) 2018 Logan Engstrom and the Hextris contributors (Garrett Finucane, Noah
Moroze, Michael Yang), released under the GNU GPL v3. The derived parts are the wave
generator, match finding and scoring, the hexagon and block model and drawing, the combo
timer, the text fade, the base settings and the math helpers. They live in:

- `src/components/game/hextris.tsx`
- `src/components/game/hextris/logic.ts`
- `src/components/game/hextris/types.ts`

Each of these files carries a licence header naming the upstream project and the
modifications.

## What was changed and added

Modified by Amin Dhouib, 2026: ported to TypeScript and React, with new blocks, scoring
bonuses, boundary, sound and UI. Site-authored parts with no upstream counterpart include
the Web Audio sound synth (`hextris/sound-manager.ts`), the React shell and overlays, the
tutorial, the leaderboard integration, immersive mode, bombs, the rainbow wildcard, the
momentum and Panic Clear mechanics, the shrinking boundary, the clean sweep and chain
bonuses, particles, `hextris/session.ts` and the key router `hextris/input.ts`.

## Site modules the program imports

The program conveyed on /games/hextris is licensed GPL-3.0 as a whole, including these
site modules that `hextris.tsx` imports:

- `src/components/game/arcade-board-tabs.tsx`
- `src/hooks/use-arcade-board.ts`
- `src/components/game/text-entry.ts`
- `src/lib/safe-json.ts`
- `src/lib/safe-storage.ts`
- `src/lib/report-game-error.ts`

## Source

The complete corresponding source of this version is in the public repository
<https://github.com/AminDhouib/personal-portfolio>, under
`src/components/game/hextris/` and `src/components/game/hextris.tsx`
(<https://github.com/AminDhouib/personal-portfolio/tree/main/src/components/game/hextris>).

## No warranty

This program comes with NO WARRANTY, to the extent permitted by law. See sections 15 and
16 of the licence in [COPYING](./COPYING).
