import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dailyFloor } from "../daily";
import { encodeLog } from "../engine/codec";
import { playWithBot } from "../engine/reference-bot";
import { FloorView } from "../floor-view";
import { ghostFrames, ghostKnightAt } from "../ghost";

afterEach(cleanup);

const DAY = "2026-10-15";
const config = dailyFloor(DAY).config;
const bot = playWithBot(config);
const LOG = encodeLog(bot.actions);

describe("ghostFrames", () => {
  it("replays a stored log on the day's floor", () => {
    const frames = ghostFrames(config, LOG);
    expect(frames?.length).toBeGreaterThan(bot.actions.length);
  });

  it("is null for a log that is empty, malformed, or does not play on this floor", () => {
    expect(ghostFrames(config, "1:")).toBeNull();
    expect(ghostFrames(config, "nope")).toBeNull();
    expect(ghostFrames(config, `${LOG}w0`)).toBeNull();
  });
});

describe("ghostKnightAt", () => {
  const frames = ghostFrames(config, LOG)!;

  it("is the knight at the start on turn 0", () => {
    const knight = ghostKnightAt(frames, 0);
    expect(knight?.warrior).toBe(true);
    expect(knight).toEqual(frames[0]!.floor.units.find((unit) => unit.warrior));
  });

  it("follows the turn, and stays where it ended after its run is over", () => {
    const last = frames[frames.length - 1]!;
    const end = last.floor.units.find((unit) => unit.warrior) ?? null;
    expect(ghostKnightAt(frames, bot.actions.length)).toEqual(end);
    expect(ghostKnightAt(frames, bot.actions.length + 50)).toEqual(end);
  });
});

describe("FloorView with a ghost", () => {
  const frame = ghostFrames(config, LOG)![0]!;

  it("draws one translucent knight under the units, and adds no unit", () => {
    const ghost = ghostKnightAt(ghostFrames(config, LOG)!, bot.actions.length);
    const { container } = render(<FloorView frame={frame} label="Today's floor" ghost={ghost} />);
    const drawn = container.querySelectorAll("[data-ghost]");
    expect(drawn).toHaveLength(1);
    expect(Number(drawn[0]!.getAttribute("opacity"))).toBeLessThan(0.6);
    expect(container.querySelectorAll("[data-unit-id]").length).toBe(frame.floor.units.length);
  });

  it("draws no ghost without one, and keeps the label for assistive technology unchanged", () => {
    const plain = render(<FloorView frame={frame} label="Today's floor" />);
    expect(plain.container.querySelector("[data-ghost]")).toBeNull();
    const label = plain.container.querySelector("svg")!.getAttribute("aria-label");
    cleanup();
    const ghost = ghostKnightAt(ghostFrames(config, LOG)!, 3);
    const withGhost = render(<FloorView frame={frame} label="Today's floor" ghost={ghost} />);
    expect(withGhost.container.querySelector("svg")!.getAttribute("aria-label")).toBe(label);
  });
});
