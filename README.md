# T-6915 evidence: ip-address 10.7.4 (GHSA-rxp7-6hxx-x8q5)

- PR #205, merged as main 02bb2c02. It was a rebase-merge with a pinned head SHA, and the main tree equals the PR head tree. CI was green and review approved.
- The change is a pnpm-workspace.yaml override floor, `"ip-address@<10.7.4": "^10.7.4"`. The lockfile changes only the ip-address entries.
- Dependabot alert #19 shows state fixed, with fixed_at 2026-10-23T17:02:55Z.
- `pnpm audit --audit-level=moderate` on the branch: No known vulnerabilities found.
- Deployed in 74edbcb4 (container booted 17:33:46Z).
- Prod reachability: the traced standalone image (`/app/node_modules/.pnpm`, 277 entries) contains none of ip-address, express-rate-limit or @modelcontextprotocol/sdk. So the vulnerable code was never shipped to prod; the lockfile chain through @copilotkit/runtime is not traced into the server output.

Screenshot (headed stealth Chrome, read-only):
- 1-alert19-fixed.png: GitHub Dependabot alert #19 (ip-address, pnpm-lock.yaml, affected <= 10.7.3) in state Fixed.
