import { loadProfile, saveProfile, type Profile } from "./profile";

export interface RunSnapshot {
  finalScore: number;
  finalDistance: number;
  finalCombo: number;
  asteroidsDestroyed: number;
  bossesDefeated: number;
  runSurvivalSeconds: number;
  peakCombo: number;
  coinsCollectedThisRun: number;
  damageTakenThisRun: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (profile: Profile, runStats: RunSnapshot) => boolean;
  unlocksCosmeticId?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-death",     name: "Welcome, Pilot",    description: "Die for the first time.",      icon: "01", check: (p) => p.totalRunsPlayed >= 1 },
  { id: "first-100",       name: "Century",           description: "Score 100 points in a run.",   icon: "02", check: (_, r) => r.finalScore >= 100 },
  { id: "first-1k",        name: "Four Digits",       description: "Score 1,000 points in a run.", icon: "03", check: (_, r) => r.finalScore >= 1000 },
  { id: "first-10k",       name: "Five Figures",      description: "Score 10,000 points in a run.", icon: "04", check: (_, r) => r.finalScore >= 10000, unlocksCosmeticId: "hull-five-figures" },
  { id: "first-100k",      name: "Leaderboard Bound", description: "Score 100,000 points in a run.", icon: "05", check: (_, r) => r.finalScore >= 100000, unlocksCosmeticId: "hull-leaderboard" },
  { id: "dist-1k",         name: "Explorer",          description: "Travel 1,000 meters.",         icon: "06", check: (_, r) => r.finalDistance >= 1000 },
  { id: "dist-5k",         name: "Deep Space",        description: "Travel 5,000 meters.",         icon: "07", check: (_, r) => r.finalDistance >= 5000 },
  { id: "dist-total-50k",  name: "Long Hauler",       description: "Travel 50,000m lifetime.",     icon: "08", check: (p) => p.totalDistance >= 50000, unlocksCosmeticId: "engine-long-haul" },
  { id: "combo-10",        name: "Rhythm",            description: "Reach a 10-kill combo.",       icon: "09", check: (_, r) => r.peakCombo >= 10 },
  { id: "combo-50",        name: "Combo Master",      description: "Reach a 50-kill combo.",       icon: "10", check: (_, r) => r.peakCombo >= 50, unlocksCosmeticId: "hull-combo-master" },
  { id: "combo-100",       name: "Untouchable",       description: "Reach a 100-kill combo.",      icon: "11", check: (_, r) => r.peakCombo >= 100, unlocksCosmeticId: "death-fx-untouchable" },
  { id: "kills-100",       name: "Sharpshooter",      description: "Destroy 100 asteroids.",       icon: "12", check: (_, r) => r.asteroidsDestroyed >= 100 },
  { id: "kills-total-10k", name: "Ace",               description: "Destroy 10,000 asteroids lifetime.", icon: "13", check: (p) => p.totalAsteroidsDestroyed >= 10000 },
  { id: "boss-first",      name: "Giant Killer",      description: "Defeat your first boss.",      icon: "14", check: (p) => p.totalBossesDefeated >= 1 },
  { id: "boss-5",          name: "Boss Rush",         description: "Defeat 5 bosses lifetime.",    icon: "15", check: (p) => p.totalBossesDefeated >= 5, unlocksCosmeticId: "hull-boss-rush" },
  { id: "coins-1k",        name: "Frugal",            description: "Collect 1,000 coins lifetime.", icon: "16", check: (p) => p.totalCoinsEarned >= 1000 },
  { id: "coins-10k",       name: "Wealthy",           description: "Collect 10,000 coins lifetime.", icon: "17", check: (p) => p.totalCoinsEarned >= 10000, unlocksCosmeticId: "engine-wealth" },
  { id: "no-hit-run",      name: "Flawless",          description: "Survive 60s without taking damage.", icon: "18", check: (_, r) => r.runSurvivalSeconds >= 60 && r.damageTakenThisRun === 0, unlocksCosmeticId: "hull-flawless" },
];

export function checkAchievements(profile: Profile, runStats: RunSnapshot): Achievement[] {
  const newly: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.unlockedAchievements.includes(a.id)) continue;
    if (a.check(profile, runStats)) newly.push(a);
  }
  return newly;
}

export function grantAchievements(achievements: Achievement[]): void {
  if (achievements.length === 0) return;
  const p = loadProfile();
  for (const a of achievements) {
    if (!p.unlockedAchievements.includes(a.id)) {
      p.unlockedAchievements.push(a.id);
      if (a.unlocksCosmeticId && !p.ownedCosmetics.includes(a.unlocksCosmeticId)) {
        p.ownedCosmetics.push(a.unlocksCosmeticId);
      }
    }
  }
  saveProfile(p);
}
