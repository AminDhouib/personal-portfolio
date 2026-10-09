"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { FailoverController, HudState } from "../controller";
import type { CaptureFailure, LoadResult, Slot } from "../persist/save";
import { T, fmt } from "../strings";
import { TICK } from "../sim/config";
import { S } from "../sim/state";
import { clock } from "./format";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL } from "./surface";

type SaveModule = typeof import("../persist/save");

const CAPTURE_TEXT: Record<CaptureFailure, string> = {
  over: T.save_over,
  "too-many-actions": T.save_too_many,
  "too-long": T.save_too_long,
  unencodable: T.save_unencodable,
};

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

function slotText(slot: Slot): string {
  switch (slot.kind) {
    case "empty":
      return T.no_save_found;
    case "newer":
      return T.save_newer;
    case "unreadable":
      return T.save_corrupted;
    case "save":
      return fmt(T.save_slot, {
        mode: slot.save.mode === "sandbox" ? T.sandbox_mode : T.survival_mode,
        time: clock(slot.save.tick * TICK),
        date: when(slot.save.savedAt),
      });
  }
}

/**
 * One save slot: Save writes the live run (its seed and action log), Load
 * replays the slot into the live run, Delete empties it after asking. The
 * save code, and zod with it, is fetched when the menu opens, never with the
 * game. A load at the 36,000-tick cap replays for about a second in 500-tick
 * chunks with the event loop free between them; the controller holds the
 * board meanwhile and refuses a second load. A slot a newer build wrote is
 * shown as such and never loaded, replaced or deleted.
 */
export function SaveMenu({
  hud,
  controller,
  onClose,
}: {
  hud: HudState;
  controller: FailoverController;
  onClose: () => void;
}) {
  const titleId = useId();
  const [mod, setMod] = useState<SaveModule | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    import("../persist/save").then(
      (m) => {
        if (!live) return;
        setMod(m);
        setSlot(m.readSlot());
      },
      () => {
        if (live) setMessage(T.save_menu_failed);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const busy = hud.loading || !mod;

  const save = () => {
    if (!mod) return;
    const out = mod.captureSave(Date.now());
    if (!out.ok) {
      setMessage(CAPTURE_TEXT[out.reason]);
      return;
    }
    const written = mod.writeSave(out.save);
    setMessage(
      written === "written" ? T.game_saved : written === "newer" ? T.save_newer : T.save_failed,
    );
    setSlot(mod.readSlot());
  };

  const load = async () => {
    if (!mod || slot?.kind !== "save") return;
    const saved = slot.save;
    setMessage(null);
    let out: Awaited<ReturnType<typeof controller.replaceRun<LoadResult>>>;
    let aborted = false;
    // resetSim gives the sim a new log, so a different array means the replay had begun.
    const liveLog = S.log;
    try {
      out = await controller.replaceRun((signal) =>
        mod.loadSave(saved, async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          // A torn-down game stops its load here, between chunks.
          aborted = signal.aborted;
          signal.throwIfAborted();
        }),
      );
    } catch {
      // silent-ok: shown below. A fault outside the replay's own refusals ends the load. Before the
      // replay began, the run is as it was; partway, the sim is half built, so a fresh paused run
      // replaces it. A load stopped by teardown leaves the sim alone: the game is gone.
      if (!aborted && S.log !== liveLog) {
        controller.restart();
        controller.setPaused(true);
      }
      setMessage(T.load_failed_corrupted);
      return;
    }
    if (!out.ok) return;
    if (!out.value.ok) {
      setMessage(T.load_failed_corrupted);
      return;
    }
    // Loaded paused, so the player sees where they are before the clock runs.
    controller.setPaused(true);
    setMessage(
      out.value.result.endReason === "time"
        ? fmt(T.save_loaded, { date: when(saved.savedAt) })
        : T.load_ended,
    );
  };

  const remove = () => {
    if (!mod) return;
    const out = mod.deleteSave();
    setConfirmDelete(false);
    setMessage(
      out === "deleted" ? T.save_deleted : out === "newer" ? T.save_newer : T.delete_failed,
    );
    setSlot(mod.readSlot());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-0 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#050505]/70 p-3"
    >
      <div className={`mt-12 flex w-80 max-w-full flex-col gap-3 p-4 text-xs ${PANEL}`}>
        <header className="flex items-center justify-between">
          <h2 id={titleId} className="text-sm font-semibold text-[#ededed]">
            {T.save_game}
          </h2>
          <button
            type="button"
            aria-label={T.close}
            onClick={onClose}
            className={`${BUTTON} ${BUTTON_IDLE}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <p>{slot ? slotText(slot) : T.loading}</p>

        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span>{T.delete_confirm}</span>
            <button
              type="button"
              onClick={remove}
              className={`${BUTTON} border-[#ef4444] text-[#ef4444]`}
            >
              {T.delete_save_confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={`${BUTTON} ${BUTTON_IDLE}`}
            >
              {T.cancel}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className={`${BUTTON} ${BUTTON_ON} disabled:opacity-40`}
            >
              {T.save}
            </button>
            <button
              type="button"
              disabled={busy || slot?.kind !== "save"}
              onClick={() => void load()}
              className={`${BUTTON} ${BUTTON_IDLE} disabled:opacity-40`}
            >
              {T.load}
            </button>
            <button
              type="button"
              disabled={busy || slot?.kind === "empty" || slot?.kind === "newer"}
              onClick={() => setConfirmDelete(true)}
              className={`${BUTTON} ${BUTTON_IDLE} disabled:opacity-40`}
            >
              {T.delete}
            </button>
          </div>
        )}

        <p role="status" className="min-h-4 text-[#a1a1aa]">
          {hud.loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {T.loading_save}
            </span>
          ) : (
            message
          )}
        </p>
      </div>
    </div>
  );
}
