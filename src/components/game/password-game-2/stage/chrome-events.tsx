"use client";

import type { EventInstance, GameState, PointerTarget } from "../engine/types";
import type { CookieBannerData } from "../engine/events/cookie-banner";
import type { AutocorrectData } from "../engine/events/autocorrect";
import type { LoadingBarData } from "../engine/events/loading-bar";
import { toggleLabelsFor } from "../engine/events/autocorrect";

interface ChromeEventsProps {
  g: GameState;
  onPointer: (target: PointerTarget) => void;
}

/** Instance data for a chrome event that is past telegraph and not yet resolved. */
function activeInst<S>(g: GameState, defId: string): EventInstance<S> | null {
  const inst = g.events.find((e) => e.defId === defId);
  if (!inst || inst.data === undefined) return null;
  if (inst.phase === "telegraph" || inst.phase === "done") return null;
  return inst as EventInstance<S>;
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5l1.3 2.4 2.7-.5.4 2.7 2.4 1.3-1 2.5 1 2.5-2.4 1.3-.4 2.7-2.7-.5L12 21.5l-1.3-2.4-2.7.5-.4-2.7-2.4-1.3 1-2.5-1-2.5 2.4-1.3.4-2.7 2.7.5L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The chrome family's DOM layer — the events that impersonate the operating system
 * rather than the box's creatures: consent-hydra cookie banners, the autocorrect
 * settings modal, and the fake upload progress bar. Mounted inside .pg2-panel above
 * the canvas. Its container is pointer-transparent; only the controls capture clicks
 * (the loading bar deliberately swallows everything).
 */
export function ChromeEvents({ g, onPointer }: ChromeEventsProps) {
  const cookie = activeInst<CookieBannerData>(g, "cookie-banner");
  const autocorrect = activeInst<AutocorrectData>(g, "autocorrect");
  const loading = activeInst<LoadingBarData>(g, "loading-bar");

  return (
    <div className="pg2-chrome" aria-live="polite">
      {cookie ? (
        <CookieBanners data={cookie.data} elapsedMs={g.elapsedMs} onPointer={onPointer} />
      ) : null}
      {autocorrect ? <AutocorrectPanel data={autocorrect.data} onPointer={onPointer} /> : null}
      {loading ? <LoadingBar data={loading.data} elapsedMs={g.elapsedMs} /> : null}
    </div>
  );
}

// --- cookie banners -----------------------------------------------------------

function CookieBanners({
  data,
  elapsedMs,
  onPointer,
}: {
  data: CookieBannerData;
  elapsedMs: number;
  onPointer: (t: PointerTarget) => void;
}) {
  const urgent = data.deadlineAtMs - elapsedMs < 10_000;
  return (
    <div className="pg2-cookie-stack">
      {data.banners.map((b, i) => (
        <div
          key={b.id}
          className={urgent ? "pg2-cookie pg2-cookie--urgent" : "pg2-cookie"}
          style={{ transform: `translate(${i * 10}px, ${i * -10}px)`, zIndex: 10 + i }}
        >
          <p className="pg2-cookie__title">We value your privacy</p>
          <p className="pg2-cookie__body">
            SignetID and 847 carefully selected partners store and access information on your device
            to keep this password experience relentlessly personalized.
          </p>
          <div className="pg2-cookie__actions">
            <button
              type="button"
              className="pg2-cookie__accept"
              onClick={() => onPointer({ kind: "banner-decline" })}
            >
              Accept all
            </button>
            <button
              type="button"
              className="pg2-cookie__decline"
              onClick={() => onPointer({ kind: "banner-decline" })}
            >
              Decline
            </button>
          </div>
          {b.hasRealReject ? (
            <button
              type="button"
              className="pg2-cookie__reject"
              onClick={() => onPointer({ kind: "banner-reject-all", id: b.id })}
            >
              Reject all
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// --- autocorrect settings -----------------------------------------------------

function AutocorrectPanel({
  data,
  onPointer,
}: {
  data: AutocorrectData;
  onPointer: (t: PointerTarget) => void;
}) {
  const labels = toggleLabelsFor(data.correctToggleIndex);
  return (
    <>
      <button
        type="button"
        className="pg2-gear"
        aria-label="Open text settings"
        onClick={() => onPointer({ kind: "settings-gear" })}
      >
        <GearIcon />
      </button>
      {data.settingsOpen ? (
        <div className="pg2-settings" role="dialog" aria-label="Text Assistance settings">
          <div className="pg2-settings__head">
            <span className="pg2-settings__crumb">Preferences / Text Assistance</span>
            <h3 className="pg2-settings__title">Helpful Corrections</h3>
          </div>
          <ul className="pg2-settings__list">
            {labels.map((label, i) => (
              <li key={i} className="pg2-settings__row">
                <span className="pg2-settings__label">{label}</span>
                <button
                  type="button"
                  className="pg2-switch pg2-switch--on"
                  role="switch"
                  aria-checked="true"
                  aria-label={`Toggle ${label}`}
                  onClick={() => onPointer({ kind: "settings-toggle", id: i })}
                >
                  <span className="pg2-switch__knob" />
                </button>
              </li>
            ))}
          </ul>
          <p className="pg2-settings__foot">
            Corrections keep your password professional. Most users leave these on.
          </p>
        </div>
      ) : null}
    </>
  );
}

// --- loading bar --------------------------------------------------------------

function LoadingBar({ data, elapsedMs }: { data: LoadingBarData; elapsedMs: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(data.progress)));
  const showHint = elapsedMs - data.startedAtMs > 2000;
  return (
    <div className="pg2-loading">
      <div className="pg2-loading__card">
        <p className="pg2-loading__title">Uploading password&hellip; {pct}%</p>
        <div className="pg2-loading__track">
          <div className="pg2-loading__fill" style={{ width: `${pct}%` }} />
        </div>
        <p className={showHint ? "pg2-loading__hint pg2-loading__hint--show" : "pg2-loading__hint"}>
          Press any key to expedite.
        </p>
      </div>
    </div>
  );
}
