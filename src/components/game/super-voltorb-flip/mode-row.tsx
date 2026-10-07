"use client";

const MODE_BTN =
  "flex h-11 min-w-11 flex-1 cursor-pointer items-center justify-center rounded-[6px] border-2 border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline outline-2 outline-gray-600 transition-colors hover:bg-zinc-200 focus-visible:outline-[#ef2020] disabled:cursor-default disabled:opacity-50";

/**
 * The slim row of mode and panel entries above the memo bar. Text labels in
 * the game's light chrome (not sprites: owner ruling), 44 px tall, sharing the
 * width so three of them fit a 360 px phone.
 */
export function ModeRow({
  statsEnabled,
  onOpenSettings,
  onOpenStats,
  onOpenDaily,
  dailyDisabled = false,
}: {
  statsEnabled: boolean;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  /** Added by T2e-3; absent until then. */
  onOpenDaily?: () => void;
  dailyDisabled?: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-2" role="group" aria-label="Game modes">
      {onOpenDaily && (
        <button type="button" onClick={onOpenDaily} disabled={dailyDisabled} className={MODE_BTN}>
          Daily
        </button>
      )}
      {statsEnabled && (
        <button type="button" onClick={onOpenStats} className={MODE_BTN}>
          Statistics
        </button>
      )}
      <button type="button" onClick={onOpenSettings} className={MODE_BTN}>
        Settings
      </button>
    </div>
  );
}
