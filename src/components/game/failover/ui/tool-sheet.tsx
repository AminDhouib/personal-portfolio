"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { FailoverController, HudState } from "../controller";
import { CONFIG, type ServiceType } from "../sim/config";
import { T, fmt } from "../strings";
import { CATEGORIES, SHORT_NAME, categoryOf, type Category } from "./catalog";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL, TOUCH } from "./surface";

/**
 * The build palette: category tabs over the services of one category, each
 * with its price, greyed out when the money is short. Picking one arms it, and
 * it stays armed (sticky) so a row of servers is one tap each. Category tabs
 * follow the tablist keys (arrows, Home, End).
 *
 * On a phone the palette is a bottom sheet: arming a service collapses it to a
 * chip with the armed service and its price, which reopens the sheet or
 * disarms; with nothing armed the collapsed sheet is a Build button. The
 * sheet's service row scrolls sideways on its own, never the page.
 */
export function ToolSheet({
  hud,
  controller,
  coarse,
}: {
  hud: HudState;
  controller: FailoverController;
  coarse: boolean;
}) {
  const armed = hud.tool.kind === "place" ? hud.tool.service : null;
  const [category, setCategory] = useState<Category["id"]>(armed ? categoryOf(armed) : "frontdoor");
  const [open, setOpen] = useState(true);
  const id = useId();

  const arm = (type: ServiceType) => {
    controller.setTool({ kind: "place", service: type });
    if (coarse) setOpen(false);
  };

  if (coarse && !open) {
    return (
      <div
        role="group"
        aria-label={T.build_a_service}
        className={`pointer-events-auto flex items-center gap-2 px-2 py-1.5 ${PANEL}`}
      >
        {armed ? (
          <>
            <span className="text-xs">
              {fmt(T.armed_chip, {
                name: CONFIG.services[armed].name,
                cost: CONFIG.services[armed].cost,
              })}
            </span>
            <button
              type="button"
              aria-label={T.build_menu_open}
              onClick={() => setOpen(true)}
              className={`${BUTTON} ${BUTTON_IDLE}`}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={T.disarm}
              onClick={() => controller.setTool({ kind: "select" })}
              className={`${BUTTON} ${BUTTON_IDLE}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${BUTTON} ${BUTTON_IDLE}`}
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
            {T.build}
          </button>
        )}
      </div>
    );
  }

  const index = Math.max(
    0,
    CATEGORIES.findIndex((c) => c.id === category),
  );
  const active = CATEGORIES[index]!;
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    if (e.key === "ArrowRight") next = (index + 1) % CATEGORIES.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + CATEGORIES.length) % CATEGORIES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CATEGORIES.length - 1;
    else return;
    e.preventDefault();
    const target = CATEGORIES[next]!;
    setCategory(target.id);
    document.getElementById(`${id}-tab-${target.id}`)?.focus();
  };

  return (
    <div className={`pointer-events-auto flex flex-col gap-1.5 p-1.5 ${PANEL}`}>
      <div className="flex items-start gap-1">
        <div
          role="tablist"
          aria-label={T.build_a_service}
          onKeyDown={onTabKey}
          className="flex flex-1 flex-wrap gap-1"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              id={`${id}-tab-${c.id}`}
              type="button"
              role="tab"
              aria-selected={c.id === active.id}
              aria-controls={`${id}-panel`}
              tabIndex={c.id === active.id ? 0 : -1}
              onClick={() => setCategory(c.id)}
              className={`${BUTTON} ${c.id === active.id ? BUTTON_ON : BUTTON_IDLE}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {coarse && (
          <button
            type="button"
            aria-label={T.build_menu_close}
            onClick={() => setOpen(false)}
            className={`${BUTTON} ${BUTTON_IDLE}`}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active.id}`}
        className="flex touch-pan-x flex-wrap gap-1 overscroll-contain pointer-coarse:flex-nowrap pointer-coarse:overflow-x-auto"
      >
        {active.types.map((type) => {
          const { name, cost } = CONFIG.services[type];
          const short = hud.money < cost;
          return (
            <button
              key={type}
              type="button"
              aria-label={`${name} $${cost}`}
              aria-pressed={armed === type}
              title={short ? `${name}: ${T.no_money}` : name}
              disabled={short && armed !== type}
              onClick={() => arm(type)}
              className={`flex h-12 min-w-16 shrink-0 flex-col items-center justify-center rounded-md border px-2 text-[11px] leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TOUCH} ${
                armed === type ? BUTTON_ON : BUTTON_IDLE
              }`}
            >
              <span className="font-semibold">{SHORT_NAME[type]}</span>
              <span className="font-mono text-[10px] opacity-80">${cost}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
