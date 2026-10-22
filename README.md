# T-6360 evidence: @vitest/mocker Dependabot alerts closed

- PR: #157 "chore(deps): vitest 4.1.12, clears the two @vitest/mocker advisories (T-6360)", merged 2026-10-22T10:39:33Z, merge commit fde53353af21d000cfa455654a90078118cc72f3.
- API fixed_at for alerts #17 (GHSA-xp26-3454-mjgp) and #18 (GHSA-qxg6-89mg-rqv8): 2026-10-22T10:39:38Z.
- Screenshots taken 2026-10-22 about 11:05Z (UTC), logged-in GitHub session, desktop 1440x900.

## t6360-closed-alerts.png
Dependabot alerts with filter is:closed: Open 0, Closed 18. The first screen of the closed list (alerts #12, #9, #11,
#14, #10, #7, #5, #16, #6, #13); #17 and #18 are further down, so see the next image.

## t6360-closed-vitest-mocker.png
Filter is:closed package:@vitest/mocker: Open 0, Closed 2. Alert #17 "Vitest: Windows backslash traversal bypasses
the @vitest/mocker redirect allowlist fix" and alert #18 "Vitest: Code injection via unauthenticated manual mock
registration", both Moderate, Transitive, "Closed 24 minutes ago - Fixed", detected in @vitest/mocker (npm), pnpm-lock.yaml.

## t6360-alert-17-fixed.png
Alert #17 page: purple "Fixed" badge, "Fixed 24 minutes ago", affected versions >= 4.1.11 < 4.1.12, patched version 4.1.12.
The page header shows no fixing commit or PR link; the fixing PR is identified from the API timestamp and PR #157 above.

## t6360-open-alerts-none.png
Default open view (is:open): Open 0, Closed 18, "No open Dependabot alerts for this repository".
