# T-7276 evidence: org security-audit check rolled out (vendored)

PR #208 was rebase-merged as c29672c8cb31680eedebc7dcfb1d9dffef3dd4c3 at head 694bda9c. review-208 approved it after an adversarial check:
- the vendored files are byte-identical to DevinoSolutions/.github@27fb535c apart from provenance headers and the setup-uv SHA pin;
- the workflow uses pull_request with contents: read only, every action is pinned by SHA, and there is no injection surface.

Every CI job passed on 694bda9c, including the new "Security audit (advisories + override table)" job.

This is a CI-only change: .github, the override table, docs and scripts. No runtime package version moved, so no prod deploy was needed. The check is live on main for every PR.

Both screenshots come from a headed stealth Chrome clone (no session) on Actions run 40021539550:
- `1-security-audit-run.png`: run status Success; the Dependency audit table shows 0 at every severity.
- `2-override-audit.png`: "15 override/resolution entries read; 0 stale, 4 unconditional pin(s)" and "Gate: fails on critical/high. 0 failing finding(s)".

The first dry run found three stale high-severity override ceilings (@graphql-tools/utils GHSA-c4qx-w738-7hr3; @lhci/cli>tmp and external-editor>tmp GHSA-7c78-jf6q-g5cm). Their floors were raised in this PR.
