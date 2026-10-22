# T-6453 Voltorb Flip unmount timers (#171), headed proof on prod 0556ce8c

Headed Chrome on https://amindhou.com/games/super-voltorb-flip, MAIN game (not Daily), 2026-10-22 ~16:06Z.

Played: one round, flipping tiles in order until a Voltorb was hit at Level 1. Result: "Voltorb! Round lost. Staying on Level 1. No coins this round." The board revealed fully (1-round-end-voltorb-loss.jpg). Clicked Continue: a fresh board with 25 face-down tiles (2-next-round-starting.jpg).

Unmount path, exercised twice: (a) flipped a tile, 120 ms later clicked the "All Games" link (client-side navigation off the page), then reopened the game from the hub; (b) flipped a tile, 100 ms later history.back() to /games, then history.forward() to the game. Both times the page came back with a fresh 25-tile board and nothing broke (3-after-unmount-and-back.jpg). The flips were triggered by el.click() in execute_script, and navigation was triggered by script a fraction of a second after the flip, so a flip animation was in flight, but I could not observe which timer was pending.

Console errors across the whole run: 0. A page-level hook (window error, unhandledrejection and console.error, persisted in sessionStorage across full loads) was installed before the first navigation, and I checked it records errors with a self-test at the end. 0 console errors; Sentry was not checked in this proof.

No score or name was submitted, no name or submit dialog appeared or was opened, and the Daily was not touched.
