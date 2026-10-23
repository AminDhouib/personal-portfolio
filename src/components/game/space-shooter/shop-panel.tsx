import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Coins as CoinsIcon } from "lucide-react";
import { UPGRADES, SHIPS, CONSUMABLES, COSMETICS } from "../shop-data";
import { ShipPreview, UpgradePreview, ConsumablePreview, CosmeticPreview } from "./shop-previews";
import { spendCoins, loadProfile, saveProfile } from "../profile";
import { PanelClose } from "./panel-close";
import { sounds } from "./sound-manager";
import type { Profile } from "../profile";

export type ShopTab =
  "upgrades" | "consumables" | "ships" | "cosmetics" | "missions" | "achievements";

export function ShopPanel({
  shopOpen,
  setShopOpen,
  shopTab,
  setShopTab,
  profile,
  buyUpgrade,
  refreshProfile,
}: {
  shopOpen: boolean;
  setShopOpen: (open: boolean) => void;
  shopTab: ShopTab;
  setShopTab: (tab: ShopTab) => void;
  profile: Profile;
  buyUpgrade: (id: string) => void;
  refreshProfile: () => void;
}) {
  return (
    <AnimatePresence>
      {shopOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-10 flex flex-col bg-black/80 backdrop-blur-md"
        >
          {/* Sticky header + tabs — always visible so the player can
                      navigate between sub-sections without being forced to
                      close the shop. */}
          <div className="sticky top-0 z-20 border-b border-white/10 bg-black/85 px-4 pt-4 pb-2 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-accent-amber" />
                <h3 className="text-lg font-bold text-white">Shop</h3>
                <div className="flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/20 px-2 py-1 font-mono text-sm text-accent-amber">
                  <CoinsIcon className="h-3.5 w-3.5" />
                  {profile.walletCoins}
                </div>
              </div>
              <PanelClose label="Close shop" onClose={() => setShopOpen(false)} />
            </div>
            <div className="mx-auto flex w-full max-w-3xl items-center gap-1 overflow-x-auto">
              {(["upgrades", "consumables", "ships", "cosmetics"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setShopTab(t)}
                  className={`min-h-11 rounded border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase ${
                    shopTab === t
                      ? "border-accent-blue/60 bg-accent-blue/25 text-white"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Scrollable tab body */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            {shopTab === "upgrades" && (
              <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                {UPGRADES.map((u) => {
                  const level = profile.ownedUpgrades[u.id] ?? 0;
                  const maxed = level >= u.maxLevel;
                  const nextCost = maxed ? 0 : u.costAtLevel(level + 1);
                  const affordable = profile.walletCoins >= nextCost;
                  return (
                    <button
                      key={u.id}
                      onClick={() => !maxed && affordable && buyUpgrade(u.id)}
                      disabled={maxed || !affordable}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                        maxed
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : affordable
                            ? "border-accent-blue/50 bg-white/5 hover:bg-white/10"
                            : "border-white/10 bg-white/5 opacity-50"
                      }`}
                    >
                      <UpgradePreview icon={u.iconKey} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex w-full items-center gap-2">
                          <span className="flex-1 truncate font-semibold text-white">
                            {u.label}
                          </span>
                          <div
                            className="flex items-center gap-0.5"
                            aria-label={`Level ${level} of ${u.maxLevel}`}
                          >
                            {Array.from({ length: u.maxLevel }).map((_, i) => (
                              <span
                                key={i}
                                className={`h-1.5 w-2.5 rounded-sm ${
                                  i < level
                                    ? maxed
                                      ? "bg-emerald-400"
                                      : "bg-accent-blue"
                                    : "bg-white/15"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="text-xs text-white/70">{u.description}</div>
                        <div className="mt-1 flex items-center gap-1.5 font-mono text-xs">
                          {maxed ? (
                            <span className="text-emerald-400">MAXED</span>
                          ) : (
                            <>
                              <CoinsIcon className="h-3 w-3 text-accent-amber" />
                              <span className={affordable ? "text-accent-amber" : "text-white/40"}>
                                {nextCost}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {shopTab === "consumables" && (
              <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                {CONSUMABLES.map((c) => {
                  const owned = profile.consumableInventory[c.id] ?? 0;
                  const affordable = profile.walletCoins >= c.cost;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                    >
                      <ConsumablePreview icon={c.icon} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">
                          {c.label} <span className="text-xs text-slate-400">x{owned}</span>
                        </div>
                        <div className="text-xs text-slate-400">{c.description}</div>
                      </div>
                      <button
                        type="button"
                        disabled={!affordable}
                        onClick={() => {
                          if (!affordable) return;
                          const r = spendCoins(c.cost);
                          if (r.ok) {
                            const p = loadProfile();
                            p.consumableInventory[c.id] = (p.consumableInventory[c.id] ?? 0) + 1;
                            saveProfile(p);
                            sounds.play("purchase");
                            refreshProfile();
                          }
                        }}
                        className={`min-h-11 rounded px-3 py-1.5 text-xs font-bold tracking-wide uppercase ${affordable ? "border border-accent-amber/50 bg-accent-amber/20 text-accent-amber" : "border border-white/10 bg-white/5 text-slate-500"}`}
                      >
                        Buy · {c.cost}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {shopTab === "ships" && (
              <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SHIPS.map((s) => {
                  const owned =
                    s.id === "falcon" || profile.ownedCosmetics.includes(`ship:${s.id}`);
                  const equipped = profile.equippedShip === s.id;
                  const affordable = profile.walletCoins >= s.unlockCost;
                  return (
                    <div
                      key={s.id}
                      className={`flex gap-3 rounded-lg border p-3 ${equipped ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}
                    >
                      <ShipPreview color={s.hullTint} shipId={s.id} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">{s.label}</span>
                          <span
                            className="inline-block h-4 w-4 rounded border border-white/20"
                            style={{ background: s.hullTint }}
                          />
                        </div>
                        <div className="text-xs text-slate-400">{s.description}</div>
                        <div className="mt-1 flex items-center gap-2">
                          {owned ? (
                            <button
                              type="button"
                              disabled={equipped}
                              onClick={() => {
                                const p = loadProfile();
                                p.equippedShip = s.id;
                                saveProfile(p);
                                refreshProfile();
                              }}
                              className={`min-h-11 rounded px-3 py-1 text-xs font-bold uppercase ${equipped ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border border-accent-blue/40 bg-accent-blue/20 text-accent-blue"}`}
                            >
                              {equipped ? "Equipped" : "Equip"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!affordable}
                              onClick={() => {
                                if (!affordable) return;
                                const r = spendCoins(s.unlockCost);
                                if (r.ok) {
                                  const p = loadProfile();
                                  const key = `ship:${s.id}`;
                                  if (!p.ownedCosmetics.includes(key)) p.ownedCosmetics.push(key);
                                  saveProfile(p);
                                  sounds.play("purchase");
                                  refreshProfile();
                                }
                              }}
                              className={`min-h-11 rounded px-3 py-1 text-xs font-bold uppercase ${affordable ? "border border-accent-amber/50 bg-accent-amber/20 text-accent-amber" : "border border-white/10 bg-white/5 text-slate-500"}`}
                            >
                              Unlock · {s.unlockCost}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {shopTab === "cosmetics" && (
              <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
                {COSMETICS.map((c) => {
                  const owned = profile.ownedCosmetics.includes(c.id);
                  const cond = c.unlockCondition;
                  let locked = false;
                  if (cond && cond !== "always") {
                    const val =
                      cond.stat === "totalAsteroidsDestroyed"
                        ? profile.totalAsteroidsDestroyed
                        : cond.stat === "totalDistance"
                          ? profile.totalDistance
                          : profile.totalRunsPlayed;
                    locked = val < cond.atLeast;
                  }
                  const equippedId =
                    c.slot === "hull"
                      ? profile.equippedHull
                      : c.slot === "engine"
                        ? profile.equippedEngine
                        : profile.equippedDeathFx;
                  const equipped = equippedId === c.id;
                  const affordable = profile.walletCoins >= c.cost;
                  return (
                    <div
                      key={c.id}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-2 ${equipped ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5"} ${locked ? "opacity-60" : ""}`}
                    >
                      <div className="flex w-full items-center gap-2">
                        <CosmeticPreview slot={c.slot} value={c.value} />
                        <span className="flex-1 truncate text-xs font-semibold text-white">
                          {c.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{c.slot}</div>
                      {locked ? (
                        <div className="text-[10px] text-slate-500">Locked</div>
                      ) : owned ? (
                        <button
                          type="button"
                          onClick={() => {
                            const p = loadProfile();
                            if (c.slot === "hull") p.equippedHull = equipped ? null : c.id;
                            else if (c.slot === "engine") p.equippedEngine = equipped ? null : c.id;
                            else p.equippedDeathFx = equipped ? null : c.id;
                            saveProfile(p);
                            refreshProfile();
                          }}
                          className={`min-h-11 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${equipped ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border border-accent-blue/40 bg-accent-blue/20 text-accent-blue"}`}
                        >
                          {equipped ? "Equipped" : "Equip"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!affordable}
                          onClick={() => {
                            if (!affordable) return;
                            const r = spendCoins(c.cost);
                            if (r.ok) {
                              const p = loadProfile();
                              if (!p.ownedCosmetics.includes(c.id)) p.ownedCosmetics.push(c.id);
                              saveProfile(p);
                              sounds.play("purchase");
                              refreshProfile();
                            }
                          }}
                          className={`min-h-11 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${affordable ? "border border-accent-amber/50 bg-accent-amber/20 text-accent-amber" : "border border-white/10 bg-white/5 text-slate-500"}`}
                        >
                          Buy · {c.cost}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
