# T-5433 evidence: mobile menu button exposes aria-expanded and aria-controls

Prod https://amindhou.com, main ef0dd228 (deploy finished 2026-10-22 06:45:05Z), headed stealth Chrome, mobile emulation at 360 px, 2026-10-22 about 06:53Z.

- `menu-closed-360.png`: menu closed. The button has aria-expanded="false" and aria-controls="mobile-menu-panel", and no panel element is present.
- `menu-open-360.png`: after `el.click()`. aria-expanded="true", and #mobile-menu-panel is present.
- `values.txt`: the values read from the DOM. scrollWidth is 360, so there is no horizontal overflow.

Result: PASS.
