# T-5532 sanitised chat errors (PR #143, merge b669e075), prod 0556ce8c

Honest scope: the error sanitising behaviour is proven by the unit tests and CI, NOT on prod, because proving it live would need a chat message, which is off limits. This proof only shows the chat still opens and loads.

- chat-open-nothing-sent.jpg: headed home page, chat panel open 72 s after load, nothing typed or sent, 3 chips visible. Both /api/copilotkit requests on load returned 200 (PerformanceResourceTiming). Console errors: 0.
- ci-and-tests.txt: PR #143 checks 4 passed, 0 failed; b669e075 is an ancestor of 0556ce8c; green main run 39804924428 for 0556ce8c, all six jobs success; test file src/lib/__tests__/copilot-error-sanitizer.test.ts (listed with git ls-tree on origin/main).
