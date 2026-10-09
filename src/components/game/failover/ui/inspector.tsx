"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { FailoverController, HudState } from "../controller";
import { T, fmt } from "../strings";
import { money } from "./format";
import { BUTTON, BUTTON_IDLE, BUTTON_ON, PANEL } from "./surface";

/**
 * The picked node: tier, health and fleet, with what can be done to it:
 * upgrade (with the price), repair (with the price), auto-scaling for the
 * types that scale, and demolish, which asks once more and names the refund.
 * Reads the HUD only; every action goes through the controller to the sim.
 */
export function Inspector({ hud, controller }: { hud: HudState; controller: FailoverController }) {
  const node = hud.selected;
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  if (!node) return null;
  const confirming = confirmFor === node.id;
  const health = Math.round(node.health);

  return (
    <section
      aria-label={fmt(T.inspector_label, { name: node.name })}
      className={`pointer-events-auto flex w-64 max-w-full flex-col gap-2 p-3 text-xs ${PANEL}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#ededed]">{node.name}</h3>
          <p className="font-mono text-[11px] text-[#a1a1aa]">
            {fmt(T.tier_of, { tier: node.tier, max: node.maxTier })}
            {" - "}
            <span className={health < 35 ? "text-[#ef4444]" : undefined}>
              {fmt(T.hp_display, { hp: health })}
            </span>
            {node.disabled && <span className="text-[#ef4444]">{` - ${T.offline}`}</span>}
          </p>
          {node.asg !== null && (
            <p className="font-mono text-[11px] text-[#a1a1aa]">
              {fmt(T.instances_n, { n: node.instances })}
              {node.warming > 0 && ` ${fmt(T.asg_warming, { n: node.warming })}`}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={T.close}
          onClick={() => controller.deselect()}
          className={`${BUTTON} ${BUTTON_IDLE}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {node.upgradeCost === null ? (
          node.maxTier > 1 && <span className="self-center text-[#a1a1aa]">{T.max_tier}</span>
        ) : (
          <button
            type="button"
            disabled={hud.money < node.upgradeCost}
            onClick={() => controller.upgradeSelected()}
            className={`${BUTTON} ${BUTTON_IDLE} disabled:opacity-40`}
          >
            {fmt(T.upgrade_for, { cost: money(node.upgradeCost) })}
          </button>
        )}
        {node.repairCost !== null && (
          <button
            type="button"
            disabled={hud.money < node.repairCost}
            onClick={() => controller.repairSelected()}
            className={`${BUTTON} ${BUTTON_IDLE} disabled:opacity-40`}
          >
            {fmt(T.repair_for, { cost: money(node.repairCost) })}
          </button>
        )}
        {node.asg !== null && (
          <button
            type="button"
            aria-pressed={node.asg}
            title={node.asg ? T.asg_disable_tip : T.asg_enable_tip}
            onClick={() => controller.toggleAsgSelected()}
            className={`${BUTTON} ${node.asg ? BUTTON_ON : BUTTON_IDLE}`}
          >
            {`${T.auto_scaling}: ${node.asg ? T.asg_label : T.asg_off}`}
          </button>
        )}
      </div>

      {confirming ? (
        <div role="group" aria-label={T.demolish} className="flex flex-wrap items-center gap-1.5">
          <span>{fmt(T.demolish_ask, { refund: money(node.refund) })}</span>
          <button
            type="button"
            onClick={() => {
              setConfirmFor(null);
              controller.demolishSelected();
            }}
            className={`${BUTTON} border-[#ef4444] text-[#ef4444]`}
          >
            {T.demolish}
          </button>
          <button
            type="button"
            onClick={() => setConfirmFor(null)}
            className={`${BUTTON} ${BUTTON_IDLE}`}
          >
            {T.cancel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmFor(node.id)}
          className={`${BUTTON} ${BUTTON_IDLE} self-start`}
        >
          {fmt(T.demolish_refund, { refund: money(node.refund) })}
        </button>
      )}
    </section>
  );
}
