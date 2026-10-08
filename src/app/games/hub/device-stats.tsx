"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  DASH,
  hasAnyStats,
  readDeviceStatsSnapshot,
  statChips,
  subscribeToDeviceStats,
  type DeviceStatsData,
} from "./hub-stats";

const PRIVACY_COPY = "Read from this browser only. Nothing here is sent anywhere.";
const EMPTY_COPY = "Play any game and your bests on this device show up here.";

// Storage does not exist on the server, so the server (and the hydration pass) render the
// placeholder chips from this null, and React swaps in the real snapshot afterwards.
function getServerSnapshot(): DeviceStatsData | null {
  return null;
}

export function DeviceStats() {
  const stats = useSyncExternalStore<DeviceStatsData | null>(
    subscribeToDeviceStats,
    readDeviceStatsSnapshot,
    getServerSnapshot,
  );
  const state = stats === null ? "pending" : hasAnyStats(stats) ? "populated" : "empty";
  return (
    <section
      aria-labelledby="hub-device-heading"
      data-testid="hub-device"
      data-state={state}
      className="mt-10"
    >
      <h2
        id="hub-device-heading"
        className="font-display text-xl font-black tracking-tight sm:text-2xl"
      >
        On this device
      </h2>
      {/* Five chips in every state, each a fixed 144px tall, so a first visit, a returning
          player and the server render all occupy the same space. */}
      <ul
        role="list"
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1"
      >
        {statChips(stats).map((item) => (
          <li key={item.slug} className="min-w-0">
            <Link
              href={`/games/${item.slug}`}
              data-testid="stat-chip"
              data-slug={item.slug}
              className="flex h-36 min-h-11 flex-col justify-between overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-3 transition-colors hover:border-(--muted)"
            >
              <div>
                <div className="line-clamp-2 text-sm leading-5 font-semibold">{item.title}</div>
                <div className="text-xs text-(--muted)">{item.label}</div>
              </div>
              <div>
                <div className="truncate font-display text-xl leading-7 font-black tabular-nums">
                  {item.value === null ? (
                    <>
                      <span aria-hidden="true">{DASH}</span>
                      <span className="sr-only">None yet</span>
                    </>
                  ) : (
                    item.value
                  )}
                </div>
                <div className="line-clamp-2 min-h-8 text-xs text-(--muted)">{item.detail}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {/* Reserved for two lines on a phone so swapping the copy never moves the page. */}
      <p
        data-testid="hub-device-caption"
        className="mt-3 min-h-10 text-xs text-(--muted) sm:min-h-5"
      >
        {state === "empty" ? EMPTY_COPY : PRIVACY_COPY}
      </p>
    </section>
  );
}
