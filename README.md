# T-6170 evidence: hextris and banners render-path cleanup (PR #148)

Headed stealth Chrome, prod on main 64ce3c5e (deployed 2026-10-22T09:01:43Z).

- hextris-loaded.png: /games/hextris loads (h1 Hextris, one canvas, console errors 0, no resource with status 400 or above).
- home-game-banners.png, home-game-banners-cards.png: the home page games section renders the Orbital Dodge banner and the Super Voltorb Flip, Hextris, Script Knight and Failover banners. Console shows only the THREE.Clock warning.
