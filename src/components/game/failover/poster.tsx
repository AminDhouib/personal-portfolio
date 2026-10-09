"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Play, VolumeX } from "lucide-react";

// What /games/failover shows before the game: a static card with a Play
// button. This is the lazy boundary. The game module, and with it the sim,
// the scene and three.js, is fetched on Play, or ahead of it when a desktop
// browser is idle and the visitor has not asked to save data; never at
// hydration. (import-graph.test.ts keeps it that way.)

// The import() sits inside dynamic() itself so the build can see it and list the
// chunk in the route's loadable manifest (scripts/check-bundle-budget.mjs reads it).
const FailoverGame = dynamic(() => import("../failover").then((m) => m.FailoverGame), {
  ssr: false,
  loading: () => <PosterFrame busy />,
});

/** Desktop (a fine pointer) and not Save-Data: worth fetching the game before the click. */
function shouldWarm(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

function PosterFrame({ busy = false, onPlay }: { busy?: boolean; onPlay?: () => void }) {
  return (
    <div className="relative flex h-[420px] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-(--border) bg-[#050505] px-6 text-center text-[#ededed]">
      <svg
        aria-hidden
        viewBox="0 0 240 120"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="#06b6d4" strokeWidth="0.6">
          <path d="M30 60 L80 35 L130 60 L180 35 L210 50" />
          <path d="M80 35 L80 85 M130 60 L130 95 M180 35 L180 80" />
        </g>
      </svg>
      <p className="relative font-display text-3xl font-black tracking-tight">Failover</p>
      <p className="relative max-w-sm text-sm text-[#a1a1aa]">
        Build a cloud that survives the traffic. Place services, wire them up from the Internet, and
        keep the money and the reputation above water.
      </p>
      <button
        type="button"
        onClick={onPlay}
        disabled={busy}
        aria-label="Play Failover"
        className="relative inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#06b6d4] px-6 font-semibold text-[#06b6d4] transition-colors hover:bg-[#06b6d4]/10 disabled:opacity-60"
      >
        <Play className="h-4 w-4" aria-hidden />
        {busy ? "Loading..." : "Play"}
      </button>
      <p className="relative inline-flex items-center gap-1.5 text-xs text-[#a1a1aa]">
        <VolumeX className="h-3.5 w-3.5" aria-hidden />
        Sound is off; turn it on in the game.
      </p>
    </div>
  );
}

export function FailoverPoster() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (playing || !shouldWarm() || typeof window.requestIdleCallback !== "function") return;
    const id = window.requestIdleCallback(() => {
      // silent-ok: warming is only a head start; a failed fetch is retried, and reported, on Play.
      import("../failover").catch(() => undefined);
    });
    return () => window.cancelIdleCallback(id);
  }, [playing]);

  if (playing) return <FailoverGame />;
  return <PosterFrame onPlay={() => setPlaying(true)} />;
}
