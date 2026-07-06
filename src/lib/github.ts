import { logWarn } from "@/lib/log";
import { env } from "@/env";

const GITHUB_TOKEN = env.GITHUB_TOKEN;
const BASE = "https://api.github.com";
const GITHUB_REVALIDATE_SECONDS = 86400;
// Every upstream call gets this timeout so a hung GitHub (or mirror) request
// can't stall ISR regeneration.
const GITHUB_FETCH_TIMEOUT_MS = 8000;

function ghFetch(path: string) {
  return fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
    next: { revalidate: GITHUB_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
}

export interface RepoStats {
  stars: number;
  forks: number;
}

export async function fetchRepoStats(owner: string, repo: string): Promise<RepoStats> {
  try {
    const res = await ghFetch(`/repos/${owner}/${repo}`);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = (await res.json()) as {
      stargazers_count: number;
      forks_count: number;
    };
    return { stars: data.stargazers_count, forks: data.forks_count };
  } catch (err) {
    logWarn("github", `fetchRepoStats ${owner}/${repo} failed`, err);
    return { stars: 0, forks: 0 };
  }
}

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

const contributionLevelMap: Record<string, 0 | 1 | 2 | 3 | 4> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

// Official GraphQL contribution calendar. Most authoritative, but requires a
// GITHUB_TOKEN. Returns [] when unavailable so the caller can fall back.
async function fetchContributionsGraphql(username: string): Promise<ContributionDay[]> {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: username } }),
      next: { revalidate: GITHUB_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            contributionCalendar?: {
              weeks?: Array<{
                contributionDays?: Array<{
                  date: string;
                  contributionCount: number;
                  contributionLevel: string;
                }>;
              }>;
            };
          };
        };
      };
    };

    const weeks = json.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? [];
    const days: ContributionDay[] = [];
    for (const week of weeks) {
      for (const day of week.contributionDays ?? []) {
        days.push({
          date: day.date,
          count: day.contributionCount,
          level: contributionLevelMap[day.contributionLevel] ?? 0,
        });
      }
    }
    return days;
  } catch (err) {
    logWarn("github", "fetchContributionsGraphql failed", err);
    return [];
  }
}

// Token-free fallback: a public mirror of the GitHub profile contribution
// calendar. The ?y=last window returns the trailing ~53 weeks already aligned
// Sunday→Saturday with the same { date, count, level } shape we render, so it
// keeps the graph real on deployments that have no GITHUB_TOKEN configured.
async function fetchContributionsPublic(username: string): Promise<ContributionDay[]> {
  try {
    const res = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`,
      {
        next: { revalidate: GITHUB_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      contributions?: Array<{ date: string; count: number; level: number }>;
    };
    return (json.contributions ?? []).map((d) => ({
      date: d.date,
      count: d.count,
      level: Math.max(0, Math.min(4, Math.round(d.level))) as 0 | 1 | 2 | 3 | 4,
    }));
  } catch (err) {
    logWarn("github", "fetchContributionsPublic failed", err);
    return [];
  }
}

export async function fetchContributionGraph(username: string): Promise<ContributionDay[]> {
  // Prefer the official GraphQL calendar when a token is configured…
  if (GITHUB_TOKEN) {
    const viaGraphql = await fetchContributionsGraphql(username);
    if (viaGraphql.length) return viaGraphql;
  }
  // …otherwise (or if GraphQL came back empty) use the token-free public mirror
  // so the graph still reflects the real profile.
  return fetchContributionsPublic(username);
}
