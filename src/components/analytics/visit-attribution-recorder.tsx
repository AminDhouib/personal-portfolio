"use client";

import { useEffect } from "react";
import { recordVisitAttribution } from "@/lib/visit-attribution";

// Mounted once in the root layout, which survives client-side navigation, so the first
// mount is the first page of the visit. Renders nothing.
export function VisitAttributionRecorder() {
  useEffect(() => {
    recordVisitAttribution();
  }, []);

  return null;
}
