"use client";

import { useEffect } from "react";
import { conversionForLink, track } from "@/lib/analytics";

// One delegated listener for the whole app instead of an onClick on every
// CTA. Capture phase, so it sees the click before any handler that stops
// propagation; it never prevents the navigation itself.
export function ConversionTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const conversion = conversionForLink(anchor, window.location.pathname);
      if (conversion) track(conversion.event, conversion.props);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
