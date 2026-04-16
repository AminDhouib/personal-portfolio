// src/components/game/missions.ts
//
// Daily mission rotation. Missions reset on local calendar day change.
// All clients on the same calendar day see the same 3 missions (seeded PRNG).

import { claimMission, loadProfile, saveProfile, setMissions, type MissionProgress } from "./profile";

export interface MissionDef {
  id: string;
  label: string;
  description: string;
  target: number;
  reward: number;
  tracker: "kills" | "distance" | "warpPickups" | "surviveDamageFreeSeconds" | "score";
}

const MISSION_POOL: MissionDef[] = [
  { id: "kill-20-heavies",   label: "Kill 20 heavies",         description: "Destroy 20 heavy asteroids in a single run.", target: 20, reward: 500, tracker: "kills" },
  { id: "reach-2km",         label: "Reach 2000m",             description: "Travel 2000m in a single run.",              target: 2000, reward: 1000, tracker: "distance" },
  { id: "warp-3-grabs",      label: "Grab 3 warp power-ups",   description: "Pick up 3 warp power-ups in a single run.",  target: 3, reward: 800, tracker: "warpPickups" },
  { id: "survive-180-clean", label: "3min flawless",           description: "Survive 3 minutes without taking damage.",   target: 180, reward: 1500, tracker: "surviveDamageFreeSeconds" },
  { id: "score-5k",          label: "Score 5000",              description: "Reach a score of 5000 in a single run.",    target: 5000, reward: 600, tracker: "score" },
  { id: "reach-5km",         label: "Reach 5000m",             description: "Travel 5000m in a single run.",              target: 5000, reward: 2000, tracker: "distance" },
  { id: "kill-50",           label: "Kill 50 asteroids",       description: "Destroy 50 asteroids in a single run.",      target: 50, reward: 400, tracker: "kills" },
  { id: "score-10k",         label: "Score 10000",             description: "Reach a score of 10000 in a single run.",   target: 10000, reward: 1200, tracker: "score" },
];

function seededRng(seed: string): () => number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
  let s = h;
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pickMissionsForDate(dateIso: string): MissionProgress[] {
  const rand = seededRng(dateIso);
  const pool = [...MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((m) => ({ id: m.id, progress: 0, claimed: false }));
}

export function rollMissionsIfNewDay(): MissionProgress[] {
  const p = loadProfile();
  const today = todayIso();
  if (p.missionsResetDate === today && p.missionsToday.length > 0) {
    return p.missionsToday;
  }
  const fresh = pickMissionsForDate(today);
  setMissions(fresh, today);
  return fresh;
}

export function getMissionDef(id: string): MissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}

export function activeMissions(): { def: MissionDef; progress: MissionProgress }[] {
  const active = rollMissionsIfNewDay();
  const out: { def: MissionDef; progress: MissionProgress }[] = [];
  for (const mp of active) {
    const def = getMissionDef(mp.id);
    if (def) out.push({ def, progress: mp });
  }
  return out;
}

export function claimMissionReward(id: string): { ok: boolean; reward: number } {
  const def = getMissionDef(id);
  if (!def) return { ok: false, reward: 0 };
  const p = loadProfile();
  const mp = p.missionsToday.find((x) => x.id === id);
  if (!mp || mp.claimed || mp.progress < def.target) {
    return { ok: false, reward: 0 };
  }
  claimMission(id);
  const after = loadProfile();
  after.walletCoins += def.reward;
  after.totalCoinsEarned += def.reward;
  saveProfile(after);
  return { ok: true, reward: def.reward };
}
