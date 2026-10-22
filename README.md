# T-6535b: headed proof on prod for PR #175 (one real Voltorb sprite everywhere)

- Prod: main 3569f3cd, Dokploy deployment rkkfQQiBYY4QuUxTUnoh8 finished 2026-10-22 19:15:56Z; /api/health uptime 430 s at 19:23:07Z.
- Browser: headed Chrome desktop (stealth, no session), about 19:25Z. Proof by prove-lane; images reviewed by the coordinator.
- Console errors: 0. The hook was installed before the first navigation and covered the game page, the How to play dialog, 2 rounds, a memo flag and the /games hub.
- Network: voltorb-icon.png, tile/voltorb.png and tile/explode_0..8.png all returned 200.
- No score or name submitted, no POST, Daily untouched.

| File | Shows |
|---|---|
| 1-board-clue-cards.png, 1b/1c zooms | row and column clue cards with the bare Voltorb icon (no tile background); How to play button icon; memo bar V |
| 2-how-to-play-dialog.png, 2h | the dialog and its title icon |
| 2b/2c/2d, 2e montage, 2f, 2g | legend card: icon held at rest, centred, no salmon square; a mid-burst frame caught |
| 3, 3b, 3c | memo bar V face pressed; V memo flag on a face-down tile (aria-label "face down, memo V") |
| 4-round-lost-revealed-voltorb-tiles.png | revealed Voltorb tiles use the whole tile sprite |
| 5, 5b | /games hub: the Super Voltorb Flip card's bomb tile uses the whole tile sprite |

Review notes:
- The tile and Voltorb inside the late burst frame (2f) are part of the original upstream art (explode_7 and explode_8 show the revealed tile as the burst fades). This is not the old opaque-frame bug.
- The clue-card icon's size and position, overlapping the card edge, match the CSS orb it replaced (see evidence/T-6535). #175 swapped only the glyph.
- On the red clue card, the red Voltorb has lower contrast than the old blue orb did. This is inherent to the real sprite. It is noted for Amin, not a defect.
- Earlier proof for #174 (sprites and music restored): evidence/T-6535 a154ebcc.
