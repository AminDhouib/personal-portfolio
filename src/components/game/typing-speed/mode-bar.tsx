import { DURATIONS, modeId, parseMode, type ModeId } from "./engine/modes";
import type { Content, Seconds } from "./engine/types";

const BUTTON =
  "inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg px-3 font-sans text-sm font-semibold transition-colors";
const ON = "bg-accent-blue/20 text-accent-blue";
const OFF = "text-(--muted) hover:text-(--foreground)";

const CONTENTS: { id: Content; label: string }[] = [
  { id: "words", label: "Words" },
  { id: "quotes", label: "Quotes" },
];

const FALLBACK_SECONDS: Seconds = 30;

function Choice({
  pressed,
  label,
  name,
  onClick,
}: {
  pressed: boolean;
  label: string;
  name?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={name}
      onClick={onClick}
      className={[BUTTON, pressed ? ON : OFF].join(" ")}
    >
      {label}
    </button>
  );
}

/** Content, duration and the single quote. Picking a part keeps the others where it can. */
export function ModeBar({ mode, onChange }: { mode: ModeId; onChange: (mode: ModeId) => void }) {
  const timed = parseMode(mode);
  const content = timed?.content ?? "words";
  const seconds = timed?.seconds ?? FALLBACK_SECONDS;
  return (
    <div role="group" aria-label="Mode" className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-center gap-1">
        {CONTENTS.map((c) => (
          <Choice
            key={c.id}
            label={c.label}
            pressed={timed?.content === c.id}
            onClick={() => onChange(modeId(c.id, seconds))}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        {DURATIONS.map((d) => (
          <Choice
            key={d}
            label={String(d)}
            name={`${d} seconds`}
            pressed={timed?.seconds === d}
            onClick={() => onChange(modeId(content, d))}
          />
        ))}
      </div>
      <Choice label="Quote" pressed={mode === "quote"} onClick={() => onChange("quote")} />
    </div>
  );
}
