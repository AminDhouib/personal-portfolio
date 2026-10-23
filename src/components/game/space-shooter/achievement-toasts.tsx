import type { Achievement } from "../achievements";

export function AchievementToasts({
  achievementToasts,
}: {
  achievementToasts: (Achievement & { firedAt: number })[];
}) {
  return (
    <div className="pointer-events-none absolute top-14 right-4 z-40 flex flex-col gap-2">
      {achievementToasts.map((a) => (
        <div
          key={`${a.id}-${a.firedAt}`}
          className="flex min-w-[220px] items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-900/80 px-4 py-2 backdrop-blur-sm"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-400 text-xs font-black text-amber-900">
            {a.icon}
          </div>
          <div className="flex-1">
            <div className="text-[10px] tracking-wide text-amber-200">ACHIEVEMENT</div>
            <div className="text-sm font-bold text-white">{a.name}</div>
            <div className="text-xs text-amber-100">{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
