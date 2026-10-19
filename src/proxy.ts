import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import {
  isPosthogProxyPath,
  planPosthogProxyForward,
  posthogUpstreamHeaders,
  slashlessRedirectTarget,
} from "@/lib/posthog-proxy";

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
  // the whole site. 308 to the slashless form, query kept, host-relative like Next's own, so a
  // page never answers 200 on a duplicate `/about/` URL.
  const target = slashlessRedirectTarget(pathname);
  if (target) {
    return new NextResponse(null, { status: 308, headers: { location: `${target}${search}` } });
  }

  return NextResponse.next();
}

export const config = {
  // Everything except build assets and static files by extension. A trailing-slash request for
  // a file (`/robots.txt/`) still runs, because the slash keeps it from ending in the extension.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff2?|map|webmanifest)$).*)",
  ],
};
