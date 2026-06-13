"use client";

import dynamic from "next/dynamic";

// PasswordGame is inherently client-only: it seeds from Math.random()/the URL
// and touches browser APIs (window, audio, timers) on its very first render.
// Server-rendering it produces a different seed than the client hydrate, which
// triggers a React #418 text-content mismatch (the seed + seed-derived rule
// list differ between server and client). Disabling SSR makes the client the
// single source of truth for the seed and lets the loading placeholder cover
// the initial paint.
//
// `ssr: false` is only allowed inside a Client Component, so this thin wrapper
// exists to host it — the game page itself is a Server Component (it exports
// `metadata`).
const PasswordGame = dynamic(
  () => import("./password-game").then((m) => m.PasswordGame),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
        <div className="text-(--muted) text-sm">Loading...</div>
      </div>
    ),
  }
);

export function PasswordGameLoader() {
  return <PasswordGame />;
}
