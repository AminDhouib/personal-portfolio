/** Human-readable event names, keyed by EVENT_DEFS id (a test pins the two key sets together). */
export const EVENT_LABELS: Readonly<Record<string, string>> = {
  gerald: "Gerald",
  campfire: "campfire",
  garden: "garden",
  infection: "infection",
  "black-hole": "black hole",
  parasite: "parasite",
  galaga: "galaga fleet",
  snake: "snake",
  tetris: "tetris stack",
  "cookie-banner": "cookie banner",
  autocorrect: "autocorrect",
  "loading-bar": "upload bar",
};

export interface RuleFlips {
  regressed: string[];
  recovered: string[];
}

/** Compare two passed-by-rule-id snapshots; rules absent from `prev` are new, not flips. */
export function diffRuleStates(
  prev: Readonly<Record<string, boolean>>,
  next: Readonly<Record<string, boolean>>,
): RuleFlips {
  const regressed: string[] = [];
  const recovered: string[] = [];
  for (const [id, passed] of Object.entries(next)) {
    const before = prev[id];
    if (before === undefined) continue;
    if (before && !passed) regressed.push(id);
    else if (!before && passed) recovered.push(id);
  }
  return { regressed, recovered };
}

/** One line saying why a passing rule reopened. */
export function explainRegression(o: { ruleId: string; liveEvents: readonly string[] }): string {
  if (o.ruleId === "consent-preferences") {
    return "The confirmation phrase is no longer in your password";
  }
  const live = o.liveEvents[0];
  if (live !== undefined) return `Reopened while the ${EVENT_LABELS[live] ?? live} is active`;
  return "This rule is no longer satisfied";
}
