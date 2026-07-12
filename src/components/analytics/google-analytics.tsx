import Script from "next/script";
import { env } from "@/env";

// Google Analytics (gtag.js), env-gated on NEXT_PUBLIC_GA4_ID. Renders nothing
// when the measurement ID is unset, so local dev and any unconfigured deploy
// stay analytics-free -- a no-op, never a build failure. The ID is read
// server-side through the env proxy (src/env.ts) and injected into the script
// tags, so no client-side env inlining is needed. Loaded afterInteractive so it
// never blocks first paint. This is the client tracking tag; the server-side
// GA4 Data API reporting (src/lib/ga4.ts) is a separate concern.
export function GoogleAnalytics() {
  const gaId = env.NEXT_PUBLIC_GA4_ID;
  if (!gaId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
