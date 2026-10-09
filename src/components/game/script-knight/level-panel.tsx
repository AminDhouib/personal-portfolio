export interface LevelPanelProps {
  towerName: string;
  level: number;
  floors: number;
  epic: boolean;
  description: string;
  tip: string;
  /** Shown only after a failed run, as upstream does. */
  clue: string | null;
}

/** The floor briefing: where you are, what it is, a tip, and the clue once you have failed. */
export function LevelPanel({
  towerName,
  level,
  floors,
  epic,
  description,
  tip,
  clue,
}: LevelPanelProps) {
  return (
    <section aria-label="This floor" className="space-y-1.5 text-sm">
      <h2 className="font-semibold text-(--foreground)">
        {towerName}, floor {level} of {floors}
        {epic ? <span className="ml-2 text-xs font-normal text-[#4ade80]">Epic</span> : null}
      </h2>
      <p className="text-(--muted)">{description}</p>
      <p className="text-(--muted)">
        <span className="font-medium text-(--foreground)">Tip: </span>
        {tip}
      </p>
      {clue ? (
        <p className="rounded-md border border-[#4ade80]/40 bg-[#4ade80]/5 px-2 py-1 text-(--foreground)">
          <span className="font-medium">Clue: </span>
          {clue}
        </p>
      ) : null}
    </section>
  );
}
