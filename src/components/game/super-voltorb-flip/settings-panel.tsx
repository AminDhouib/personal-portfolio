"use client";

import { ModalShell } from "./modal-shell";
import type { Settings } from "./settings";

// Two complete static strings per state (never a conditional fragment).
const SWITCH_OFF =
  "relative h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-gray-400 bg-gray-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#ef2020]";
const SWITCH_ON =
  "relative h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-[#2f6b4b] bg-[#3D7757] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#ef2020]";
const KNOB_OFF = "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-all";
const KNOB_ON = "absolute top-0.5 left-[22px] h-5 w-5 rounded-full bg-white shadow transition-all";

type Row = { key: keyof Settings; label: string; hint: string };

const ROWS: readonly Row[] = [
  {
    key: "memoUndo",
    label: "Memo undo",
    hint: "An undo button on the memo bar, and Ctrl+Z (Cmd+Z) while you are in the game.",
  },
  {
    key: "stats",
    label: "Statistics",
    hint: "Keep a local record of your rounds on this device. Nothing is sent anywhere.",
  },
  {
    key: "assist",
    label: "Odds assist",
    hint: "Show each face-down tile's chance of a Voltorb. Rounds played with it do not count toward your record.",
  },
];

export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Settings" onClose={onClose}>
      <ul className="flex flex-col gap-3">
        {ROWS.map((row) => {
          const on = settings[row.key];
          return (
            <li key={row.key} className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={row.label}
                onClick={() => onChange({ [row.key]: !on })}
                className={on ? SWITCH_ON : SWITCH_OFF}
              >
                <span className={on ? KNOB_ON : KNOB_OFF} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-lg leading-tight">{row.label}</p>
                <p className="text-sm text-gray-500">{row.hint}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}
