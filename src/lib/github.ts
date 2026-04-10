const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BASE = "https://api.github.com";

function ghFetch(path: string) {
  return fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
    next: { revalidate: 3600 }, // Cache 1h
  });
}

export interface RepoStats {
  stars: number;
  forks: number;
}

export async function fetchRepoStats(
  owner: string,
  repo: string
): Promise<RepoStats> {
  try {
    const res = await ghFetch(`/repos/${owner}/${repo}`);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = (await res.json()) as {
      stargazers_count: number;
      forks_count: number;
    };
    return { stars: data.stargazers_count, forks: data.forks_count };
  } catch {
    return { stars: 0, forks: 0 };
  }
}

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export async function fetchContributionGraph(
  username: string
): Promise<ContributionDay[]> {
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

  if (!GITHUB_TOKEN) return [];

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: username } }),
      next: { revalidate: 3600 },
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

    const levelMap: Record<string, 0 | 1 | 2 | 3 | 4> = {
      NONE: 0,
      FIRST_QUARTILE: 1,
      SECOND_QUARTILE: 2,
      THIRD_QUARTILE: 3,
      FOURTH_QUARTILE: 4,
    };

    const weeks =
      json.data?.user?.contributionsCollection?.contributionCalendar?.weeks ??
      [];
    const days: ContributionDay[] = [];
    for (const week of weeks) {
      for (const day of week.contributionDays ?? []) {
        days.push({
          date: day.date,
          count: day.contributionCount,
          level: levelMap[day.contributionLevel] ?? 0,
        });
      }
    }
    return days;
  } catch {
    return [];
  }
}
