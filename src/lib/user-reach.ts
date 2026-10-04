import { projects } from "@/data/projects";

/**
 * Combined monthly active users across every product: the live GA4 figure per
 * slug when one is available, otherwise that project's `mauFallback`. With no
 * argument this is the fallback-only total, which is what static copy (the
 * experience bullet, the AI prompt) quotes so it never needs a GA4 call.
 */
export function combinedMonthlyUsers(live: Record<string, number | null> = {}): number {
  return projects.reduce((sum, p) => sum + (live[p.slug] ?? p.mauFallback), 0);
}

/**
 * A claim-safe floor of `n` in thousands: rounded down to the nearest 10K at or
 * above 100K (203,500 -> 200), to the nearest 1K below that (31,900 -> 31).
 * Always rounds down so a "+" suffix stays true.
 */
export function usersFloorInThousands(n: number): number {
  const thousands = Math.floor(n / 1000);
  return thousands >= 100 ? Math.floor(thousands / 10) * 10 : thousands;
}

/** `usersFloorInThousands` as display copy, e.g. "200K+". */
export function formatUsersFloor(n: number): string {
  return `${usersFloorInThousands(n)}K+`;
}
