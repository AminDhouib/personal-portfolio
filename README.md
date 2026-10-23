# T-6916 evidence: Dependabot ignores node base-image majors

- PR #200, merged as main d54e823a (rebase-merge with a pinned head SHA; the main tree equals the PR head tree). It adds an `ignore` for `node` `version-update:semver-major` to the root Dockerfile's docker entry in .github/dependabot.yml. CI was green, and review-200 approved it.
- This is a config-only change. Dependabot reads it from main, and the app is unaffected, so there was no deploy.

Screenshots (headed stealth Chrome, read-only):
- 1-pr181-closed.png: Dependabot closed #181 (node 22.23.1 to 26.12.0) itself after #200 merged, commenting "Looks like node is no longer being updated by Dependabot". The coordinator's T-6916 comment follows it.
- 2-pr201-patch.png: Dependabot opened #201 (node 22.23.1 to 22.23.3) right afterwards, which shows patch updates still flow.
- 3-dependabot-yml.png: the new ignore block on main (lines 56-61).
