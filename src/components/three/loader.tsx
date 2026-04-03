"use client";

import dynamic from "next/dynamic";

const GeometricBackgroundInner = dynamic(
  () => import("./geometric-background").then((m) => m.GeometricBackground),
  { ssr: false }
);

export function GeometricBackgroundLoader() {
  return <GeometricBackgroundInner />;
}
