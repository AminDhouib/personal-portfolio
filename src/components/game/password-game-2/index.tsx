"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

// Password Game 2 is client-only: it seeds from Math.random()/the URL and drives
// a requestAnimationFrame engine loop, Web Audio, and window keyboard listeners
// on first render. Server-rendering it would seed differently on the server than
// the client hydrate (a text-content mismatch), so SSR is disabled and the client
// is the single source of truth for the seed. `ssr: false` is only permitted in a
// Client Component, so this thin wrapper hosts it while the page stays a Server
// Component (it exports `metadata`).
const GameShell = dynamic(() => import("./stage/game-shell").then((m) => m.GameShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] w-full items-center justify-center rounded-xl border border-(--border) bg-(--card)">
      <div className="text-sm text-(--muted)">Loading…</div>
    </div>
  ),
});

export function PasswordGame2Loader() {
  // Suspense boundary: GameShell reads useSearchParams (?seed=).
  return (
    <Suspense fallback={null}>
      <GameShell />
    </Suspense>
  );
}
