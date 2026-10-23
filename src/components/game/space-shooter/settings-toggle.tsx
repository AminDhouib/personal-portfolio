export function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-slate-200">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="flex h-11 w-14 shrink-0 items-center justify-center"
        aria-pressed={checked}
      >
        <span
          className={`relative block h-6 w-10 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-600"}`}
        >
          <span
            className={`absolute top-0.5 left-0 block h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </span>
      </button>
    </label>
  );
}
