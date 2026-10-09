// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The codec is stubbed to accept anything, so the length cap is the only thing left that can
// refuse a long link. (No real log gets near the cap: 200 turns is 421 characters.)
vi.mock("../engine/codec", () => ({
  decodeLog: vi.fn(() => [{ name: "walk", direction: null }]),
  encodeLog: vi.fn(() => "1:w-"),
}));

import { parseReplayFragment, REPLAY_FRAGMENT_MAX } from "../replay-link";

const PREFIX = "#replay=1.d.20261015.";
const padTo = (length: number) => PREFIX + "w".repeat(length - PREFIX.length);

describe("the replay link length cap", () => {
  it("accepts a link one character under the cap", () => {
    expect(parseReplayFragment(padTo(REPLAY_FRAGMENT_MAX - 1))).not.toBeNull();
  });

  it("refuses a link at the cap, before reading it", () => {
    expect(parseReplayFragment(padTo(REPLAY_FRAGMENT_MAX))).toBeNull();
    expect(parseReplayFragment(padTo(REPLAY_FRAGMENT_MAX + 1000))).toBeNull();
  });
});
