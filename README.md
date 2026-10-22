# T-5525 evidence: chat request burst fixed with static suggestions (PR #150)

Earlier files (chat-closed.png, chat-open.png, chat-console-network.txt, ck-mock-harness.js) are the root-cause harness: 46+ /api/copilotkit requests before the fix, 2 after.

Prod proof, headed stealth Chrome, main 64ce3c5e (deployed 2026-10-22T09:01:43Z), 2026-10-22 09:12:18Z:
- chat-open-chips-prod-64ce3c5e.png: widget open with exactly 3 chips (What has Amin built? / Is Amin available for hire? / How do I book a call with Amin?), no duplicates.
- Resource timings were cleared, then the widget was opened and observed for 15 s: 2 /api/copilotkit requests, both 200, 0 with status 429. Console errors 0. Nothing was typed or sent (notes-prod-64ce3c5e.txt).
