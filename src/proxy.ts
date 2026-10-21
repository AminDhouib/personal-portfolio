import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { isPosthogProxyPath, slashlessRedirectTarget } from "@/lib/posthog-proxy";
import { planPosthogProxyForward, posthogUpstreamHeaders } from "@/lib/posthog-proxy-forward";

// Next 16's renamed middleware (the file convention is `proxy`, Node runtime). It does two jobs,
// both because next.config.ts sets `skipTrailingSlashRedirect: true`; DESIGN.md's register
// entries "First-party PostHog path" and "Trailing slashes are redirected in proxy.ts" say why.
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  // 1. First-party PostHog. The rewrites in next.config.ts forward the path to PostHog after
  // this has run. Two things are done to it here: the visitor's own IP replaces whatever
  // `X-Forwarded-For` arrived, and capture requests go to PostHog over the host's internal hop
  // when one is configured, because Cloudflare strips that header on the public route
  // (src/lib/posthog-proxy.ts says why). The path keeps its trailing slash: `/e/` is the endpoint.
  if (isPosthogProxyPath(pathname)) {
    const plan = planPosthogProxyForward({
      pathname,
      search,
      cfConnectingIp: request.headers.get("cf-connecting-ip"),
      internalCaptureOrigin: env.POSTHOG_CAPTURE_INTERNAL_ORIGIN,
    });
    const headers = posthogUpstreamHeaders(request.headers, plan.forwardedFor);
    return plan.internalRewrite
      ? NextResponse.rewrite(plan.internalRewrite, { request: { headers } })
      : NextResponse.next({ request: { headers } });
  }

  // 2. Next's default trailing-slash redirect, which skipTrailingSlashRedirect switched off for
  // the whole site. 308 to the slashless form, query kept, so a page never answers 200 on a
  // duplicate `/about/` URL. The target is resolved against the request's own URL (same scheme and
  // host the visitor used): a hand-built relative Location header makes the Next server throw
  // "Invalid URL" and answer 500, found by the standalone-server check.
  const target = slashlessRedirectTarget(pathname);
  if (target) {
    return NextResponse.redirect(new URL(`${target}${search}`, request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except build assets and static files by extension (`/favicon.ico` is one: `.ico`).
  // A trailing-slash request for a file (`/robots.txt/`, `/favicon.ico/`) still runs, because the
  // slash keeps it from ending in the extension. The `_next/` prefixes are deliberately open-ended:
  // nothing there is a page, and the hot path should not run the proxy for it. `monitoring$` is
  // the Sentry tunnel, and only that exact path: Next buffers a request body in the proxy layer
  // before the route handler runs, which would defeat the tunnel's read deadlines. The proxy does
  // nothing the tunnel needs (no PostHog path, and the tunnel is POST-only so no page duplicate);
  // `/monitoring/` still runs and gets its slashless 308.
  matcher: [
    "/((?!_next/static|_next/image|monitoring$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff2?|map|webmanifest)$).*)",
  ],
};
