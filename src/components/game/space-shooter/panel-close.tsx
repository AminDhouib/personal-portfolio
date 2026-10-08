import { X as XIcon } from "lucide-react";

/** The shop, trophies and settings panels' close button: a 44 px tap target. */
export function PanelClose({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
      aria-label={label}
    >
      <XIcon className="h-4 w-4" />
    </button>
  );
}
