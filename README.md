# T-5530 evidence: space shooter page loads after the run-length cap change

Prod https://amindhou.com/games/space-shooter (titled Orbital Dodge), main ef0dd228, headed stealth Chrome, desktop 1440 px, 2026-10-22 about 06:55Z. No run was started and no score was posted.

- `space-shooter-loaded.png`: the page and canvas about 5 s after load.
- `console.txt`: 0 console errors (only the existing THREE.Clock deprecation warning), no resource with status 400 or higher, and one canvas.

The caps themselves (SPACE_SHOOTER_MAX_SECONDS = 2400, HEXTRIS_MAX_SECONDS = 7200, rejected with "run too long") are pinned by unit tests in src/lib/arcade. They were not exercised on prod, because that would mean posting scores.

Result: PASS (load check).
