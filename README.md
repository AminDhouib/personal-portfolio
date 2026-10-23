# T-6920 evidence: minor and patch dependency bumps (#192, replacing Dependabot #184)

#192 is live on prod as main afab354a; its tree is byte-identical to PR head 9a76cede. The container booted at 2026-10-23 08:58:52Z. Runtime bumps: react and react-dom 19.3.1, three 0.186 with @react-three/fiber 9.8.2 and postprocessing 6.39, @copilotkit 1.79.1, posthog-js 1.438.19, zod 4.6, pg 8.23, shiki 4.5, lucide-react and simple-icons.

Checks used headed stealth Chrome at 1440x900 with no session. Scores and leaderboard calls were blocked through CDP; nothing was submitted and no chat message was sent.

Console: 0 errors. 4 warnings, all the pre-existing THREE.Clock deprecation.

1. home.png: PASS. The hero WebGL background renders and animates.
2. chat.png: PASS. Checked more than 60 s after load. The Amin AI panel renders with 3 suggestion chips and a usable input. Both /api/copilotkit calls returned 200.
3. PostHog: PASS. config.js, e/, i/v0/e/ and the unversioned static/surveys.js and posthog-recorder.js returned 200. Events arrive in project 22 with $lib_version 1.438.19.
   - Observation, not breaking: the versioned /_p/4qe/static/1.438.19/*.js returns 404 (a 302 to /login upstream). The SDK falls back to the unversioned path. Filed as a follow-up.
4. failover.png and failover-0-menu.png: PASS. The three.js scene renders and the sim advances.
5. blog.png and blog-post.png: PASS. 9 posts are listed and code blocks are highlighted by shiki.
6. hub.png, space-shooter.png and voltorb.png: PASS. 24 game links with 0 broken images. The space-shooter WebGL canvas and the Voltorb board render.
7. icons.png: PASS. 328 svgs and 44 imgs, none empty or broken.
