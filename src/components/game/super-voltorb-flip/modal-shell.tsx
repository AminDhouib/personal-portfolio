"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { VoltorbIcon } from "./chrome";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The modal card the Settings, Statistics and Daily panels share. Same look as
 * the How to play card (it uses the .svf-modal-* classes from SCOPED_STYLES) and
 * the same dismissal: Escape, the close button, a click on the backdrop. It is
 * absolutely positioned inside .svf-root, so it covers the game, not the page.
 *
 * It is a real modal: focus moves onto the card when it opens, Tab and Shift+Tab
 * stay inside it, and focus goes back to whatever opened it when it closes.
 */
export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // A second close (Escape then a click, say) must not call onClose twice.
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => onCloseRef.current(), 180);
  }, []);

  useEffect(() => {
    const opener = document.activeElement;
    cardRef.current?.focus();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const card = cardRef.current;
    if (!card) return;
    const nodes = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) {
      e.preventDefault();
      card.focus();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === card)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={`svf-modal-backdrop absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto p-3 ${
        closing ? "svf-modal-closing" : "svf-modal-open"
      }`}
      onClick={close}
      onKeyDown={trapTab}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="svf-modal-card rounded-5 my-auto w-full max-w-[460px] cursor-default border-4 border-gray-300 bg-white text-gray-700 outline outline-2 outline-gray-600 focus:outline-gray-600"
      >
        <div className="flex items-center justify-between border-b-2 border-gray-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <VoltorbIcon size={20} />
            <h1 className="drop-shadow-soft text-2xl leading-none">{title}</h1>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded border-2 border-gray-300 bg-white text-gray-600 transition-colors hover:bg-zinc-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="1" y="2" width="2" height="2" />
              <rect x="3" y="4" width="2" height="2" />
              <rect x="5" y="6" width="4" height="2" />
              <rect x="9" y="4" width="2" height="2" />
              <rect x="11" y="2" width="2" height="2" />
              <rect x="1" y="10" width="2" height="2" />
              <rect x="3" y="8" width="2" height="2" />
              <rect x="9" y="8" width="2" height="2" />
              <rect x="11" y="10" width="2" height="2" />
            </svg>
          </button>
        </div>
        <div className="drop-shadow-soft flex flex-col gap-4 p-4 text-base leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}
