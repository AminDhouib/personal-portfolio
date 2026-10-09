"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { FailoverController } from "../controller";
import {
  buildShareUrl,
  extractArchParam,
  rebuildBlueprint,
  type RebuildResult,
} from "../persist/blueprint";
import { decodeArchParam, type Arch } from "../persist/blueprint-schema";
import { T, fmt } from "../strings";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL, TOUCH } from "./surface";

// The ?arch= share link both ways. Out: the live build as a link (services,
// their places and links, and the Sandbox budget; never the score or the run)
// with a copy button. In: a link opened on the page is decoded and described,
// with what of it is not valid, before anything is built; building is a new
// Sandbox run, made only through dispatch so the board's rules apply again.

function Modal({
  title,
  onClose,
  closeLabel = T.close,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const titleId = useId();
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
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className={`${BUTTON} ${BUTTON_IDLE}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Share in Settings: the live build as a link, with a copy button that falls back to a selected field. */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [share] = useState(() =>
    buildShareUrl(`${window.location.origin}${window.location.pathname}`),
  );
  const [message, setMessage] = useState<string | null>(null);

  const selectField = () => {
    field.current?.focus();
    field.current?.select();
  };

  const copy = async () => {
    if (!share.ok) return;
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(share.url);
      setMessage(T.share_link_copied);
    } catch {
      // silent-ok: a refused clipboard (permissions, an old browser) falls back to copying by hand
      selectField();
      setMessage(`${T.share_copy_failed} ${T.copy_by_hand}`);
    }
  };

  return (
    <Modal title={T.share_title} onClose={onClose}>
      {share.ok ? (
        <>
          <p id={fieldId}>{T.share_link_label}</p>
          <input
            aria-labelledby={fieldId}
            ref={field}
            readOnly
            value={share.url}
            onFocus={(e) => e.currentTarget.select()}
            className={`w-full rounded-md border border-[#27272a] bg-[#050505] px-2 py-1.5 font-mono text-[11px] text-[#d4d4d8] ${TOUCH}`}
          />
          <button
            type="button"
            onClick={() => void copy()}
            className={`${BUTTON} ${BUTTON_ON} self-start`}
          >
            {T.share_copy_link}
          </button>
          <p className="text-[#a1a1aa]">{T.share_note}</p>
        </>
      ) : (
        <p>{T.share_too_large}</p>
      )}
      <p role="status" className="min-h-4 text-[#a1a1aa]">
        {message}
      </p>
    </Modal>
  );
}

/** The decoded ?arch= of the page's URL: null when there is none, else the build (null when it is not one). */
export function readArchLink(): { arch: Arch | null } | null {
  const { raw } = extractArchParam(window.location.search);
  if (raw === null) return null;
  const arch = decodeArchParam(raw);
  // A link whose every service was dropped holds no build.
  return { arch: arch && arch.services.some(Boolean) ? arch : null };
}

/** Take ?arch= out of the address, so a reload does not offer the build again. */
function clearArchLink(): void {
  const { rest } = extractArchParam(window.location.search);
  const url = `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
}

const shareSeed = () => `share-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;

/** What an opened link holds and drops, then the build, only when asked. */
export function ImportDialog({
  arch,
  controller,
  onClose,
}: {
  arch: Arch | null;
  controller: FailoverController;
  onClose: () => void;
}) {
  const [built, setBuilt] = useState<RebuildResult | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    clearArchLink();
    onClose();
  };

  const build = async () => {
    if (!arch || busy) return;
    setBusy(true);
    const out = await controller.replaceRun(() => rebuildBlueprint(arch, shareSeed()));
    clearArchLink();
    if (out.ok) setBuilt(out.value);
    setBusy(false);
  };

  if (!arch) {
    return (
      <Modal title={T.import_title} onClose={close}>
        <p>{T.import_invalid}</p>
      </Modal>
    );
  }

  const services = arch.services.filter(Boolean).length;
  const links = arch.connections.length + arch.internet.length;
  const droppedServices = arch.services.length - services;
  const droppedLinks = arch.dropped - droppedServices;

  return (
    <Modal title={T.import_title} onClose={close} closeLabel={built ? T.close : T.cancel}>
      <p>{fmt(T.import_summary, { services, links })}</p>
      {arch.dropped > 0 && (
        <p className="text-[#f59e0b]">
          {fmt(T.import_dropped, { services: droppedServices, links: droppedLinks })}
        </p>
      )}
      {built ? null : (
        <>
          <p className="text-[#a1a1aa]">{T.import_replaces}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void build()}
            className={`${BUTTON} ${BUTTON_ON} self-start disabled:opacity-40`}
          >
            {T.build_it}
          </button>
        </>
      )}
      <p role="status" className="min-h-4 text-[#a1a1aa]">
        {built &&
          [
            fmt(T.import_done, {
              placed: built.placed,
              total: services,
              linked: built.linked,
            }),
            built.skipped - droppedServices + built.unlinked > 0
              ? fmt(T.import_refused, {
                  skipped: built.skipped - droppedServices,
                  unlinked: built.unlinked,
                })
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
      </p>
    </Modal>
  );
}
