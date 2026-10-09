// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeLog, type TurnAction } from "../engine/codec";
import { buildReplayFragment, parseReplayFragment, REPLAY_FRAGMENT_MAX } from "../replay-link";

const walk: TurnAction = { name: "walk", direction: null };
const shoot: TurnAction = { name: "shoot", direction: "forward" };
const rest: TurnAction = { name: "rest", direction: null };

describe("buildReplayFragment", () => {
  it("writes a daily as #replay=1.d.<yyyymmdd>.<log body>", () => {
    expect(buildReplayFragment({ kind: "daily", day: "2026-10-15" }, [shoot, walk])).toBe(
      "#replay=1.d.20261015.h0w-",
    );
  });

  it("writes a tower floor as 1.t.<np|pk>.<level>.<0|1>.<log body>", () => {
    expect(
      buildReplayFragment({ kind: "tower", tower: "narrow-path", level: 3, epic: false }, [walk]),
    ).toBe("#replay=1.t.np.3.0.w-");
    expect(
      buildReplayFragment({ kind: "tower", tower: "powder-keep", level: 9, epic: true }, [rest]),
    ).toBe("#replay=1.t.pk.9.1.r-");
  });

  it("reuses the action-log codec for the body", () => {
    const actions = [shoot, walk, rest, null];
    const fragment = buildReplayFragment({ kind: "daily", day: "2026-10-15" }, actions);
    expect(fragment.endsWith(encodeLog(actions).slice(2))).toBe(true);
  });
});

describe("parseReplayFragment", () => {
  it("round trips a daily, including an idle turn whose token holds a dot", () => {
    const actions = [shoot, null, walk, rest];
    const fragment = buildReplayFragment({ kind: "daily", day: "2026-10-15" }, actions);
    expect(parseReplayFragment(fragment)).toEqual({
      ref: { kind: "daily", day: "2026-10-15" },
      actions,
    });
  });

  it("round trips tower floors", () => {
    for (const [tower, level, epic] of [
      ["narrow-path", 1, false],
      ["narrow-path", 9, true],
      ["powder-keep", 5, false],
    ] as const) {
      const ref = { kind: "tower", tower, level, epic } as const;
      expect(parseReplayFragment(buildReplayFragment(ref, [walk, walk]))).toEqual({
        ref,
        actions: [walk, walk],
      });
    }
  });

  it("round trips the longest log under the length cap", () => {
    const actions = Array.from({ length: 200 }, () => walk);
    const fragment = buildReplayFragment({ kind: "daily", day: "2026-10-15" }, actions);
    expect(fragment.length).toBeLessThan(REPLAY_FRAGMENT_MAX);
    expect(parseReplayFragment(fragment)?.actions).toHaveLength(200);
  });

  it("is null for anything that is not exactly a replay link", () => {
    const good = "#replay=1.d.20261015.w-";
    expect(parseReplayFragment(good)).not.toBeNull();
    for (const bad of [
      "",
      "#",
      "#replay=",
      "replay=1.d.20261015.w-", // no hash sign
      "#replay=2.d.20261015.w-", // wrong version
      "#replay=1.x.20261015.w-", // unknown kind
      "#replay=1.d.2026101.w-", // short day
      "#replay=1.d.20261315.w-", // month 13
      "#replay=1.d.20260230.w-", // 30 February
      "#replay=1.d.20261015.", // empty log
      "#replay=1.d.20261015.w", // half a token
      "#replay=1.d.20261015.z0", // unknown action
      "#replay=1.d.20261015.w9", // bad direction digit
      "#replay=1.d.20261015.r0", // rest takes no direction
      "#replay=1.d.20261015.w-extra",
      "#replay=1.d.20261015.W-",
      "#replay=1.d.20261015.w-&x=1",
      "#replay=1.t.xx.3.0.w-", // no such tower
      "#replay=1.t.np.0.0.w-", // no level 0
      "#replay=1.t.np.10.0.w-", // no level 10
      "#replay=1.t.np.3.2.w-", // epic is 0 or 1
      "#replay=1.t.np.3.w-", // missing epic
      "#replay=1.t.np.03.0.w-", // zero padded level
      `${good}#replay=1.d.20261015.w-`,
      ` ${good}`,
    ]) {
      expect(parseReplayFragment(bad), bad).toBeNull();
    }
  });

  it("is null for a log past 200 turns, and for a link of 600 characters or more", () => {
    const tooMany = `#replay=1.d.20261015.${"w-".repeat(201)}`;
    expect(parseReplayFragment(tooMany)).toBeNull();
    const padded = `#replay=1.d.20261015.${"w-".repeat(200)}${"w-".repeat(100)}`;
    expect(padded.length).toBeGreaterThanOrEqual(REPLAY_FRAGMENT_MAX);
    expect(parseReplayFragment(padded)).toBeNull();
  });

  it("is null for non-strings without throwing", () => {
    for (const bad of [null, undefined, 5, {}, []]) {
      expect(parseReplayFragment(bad as unknown as string)).toBeNull();
    }
  });
});
