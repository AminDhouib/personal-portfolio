# T-7154 evidence: blog inline code backticks, plus RUNBOOK age-header line and SVF comment

PR #207 was rebase-merged as 3955168a0b536ca9c72d34136171da9bcbfe6760 and deployed to compose hnV_k4WYHOmodXzsvQeDk. The container booted at 2026-10-23 19:06:46Z with a clean boot log.

Both checks below were headed stealth Chrome clones (no session) at 1400x1000 on https://amindhou.com/blog/quality-gates-that-earn-their-keep.

- `1-before-prod.png` (18:38Z, prod da57b3dc): inline code renders with literal backticks inside the pill, e.g. `oxlint` and `vitest.config.ts`. In-page check: 13 inline `.prose code` elements, each with computed ::before and ::after content "`" (from @tailwindcss/typography).
- `2-after-prod.png` (19:08Z, prod 3955168a): the same paragraphs render clean pills with no backticks. In-page check: 13 inline code elements, 0 with non-none pseudo-content, the first is ["none","none"], the pill styling is intact (background plus 0.8px border), and `pre code::before` is "none" (code blocks untouched).

CI on 961f6d86 passed every job, including E2E (Playwright, production build). That job runs the new `e2e/blog-prose.spec.ts`, which pins the fix.

The RUNBOOK Deploy step 5 now uses the deployment's finish time. curl -sI on prod `/` at 18:38Z showed Date, Cache-Control: s-maxage=300 and x-nextjs-cache only, with no `age` header. The super-voltorb-flip.tsx:486 comment no longer mentions the footer deleted in #206.
