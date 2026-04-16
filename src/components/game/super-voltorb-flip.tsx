"use client";

import { useEffect, useState } from "react";

export function SuperVoltorbFlipGame() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
        <div className="text-(--muted) text-sm">Loading Super Voltorb Flip...</div>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-xl border border-(--border) bg-(--card) overflow-hidden"
      style={{ aspectRatio: "4 / 3", minHeight: 420 }}
    >
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-(--muted)">
          <div className="text-lg font-semibold mb-2">Super Voltorb Flip</div>
          <div className="text-sm">Shell mounted. Implementation coming in subsequent tasks.</div>
        </div>
      </div>
    </div>
  );
}
