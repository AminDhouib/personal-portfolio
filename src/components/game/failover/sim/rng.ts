import { fnv1a, mulberry32, type Rng } from "../../password-game-2/engine/rng";

/**
 * Three independent seeded streams. Every roll the upstream game made with the
 * global random source maps to exactly one of them, so the day's traffic mix and
 * event schedule do not depend on what the player built, and a build that rolls
 * more often does not shift the other streams.
 */
export type Stream = "traffic" | "events" | "rolls";

let streams: Record<Stream, Rng> = makeStreams("failover-unseeded");

function makeStreams(seed: string): Record<Stream, Rng> {
  return {
    traffic: mulberry32(fnv1a(`${seed}:traffic`)),
    events: mulberry32(fnv1a(`${seed}:events`)),
    rolls: mulberry32(fnv1a(`${seed}:rolls`)),
  };
}

/** Restart all three streams from one run seed. */
export function seedStreams(seed: string): void {
  streams = makeStreams(seed);
}

/** Next draw in [0, 1) from the named stream. */
export function rand(stream: Stream): number {
  return streams[stream]();
}
