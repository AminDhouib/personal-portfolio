# T-6259 bounded copilot thread store, headed proof on prod 553b89ae

The change is server-side retention limits (200 threads, 20 runs, 32 MiB). This proves the chat runtime still works with the bounded runner: chat opened 72 s after load with 3 chips, both /api/copilotkit requests returned 200, no message sent (network.txt). The limits themselves are pinned by an integration test against the real library, not by this proof.
