import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFailoverAudio } from "../audio/audio";
import { CUES, cueForEvent, type CueName } from "../audio/cues";
import { makeFakeCtx, type FakeCtx } from "./fake-ctx";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

function setup() {
  const ctx = makeFakeCtx();
  const audio = createFailoverAudio(() => ctx);
  return { ctx, audio };
}

const voices = (ctx: FakeCtx) => ctx.oscillators.length + ctx.noiseSources.length;

describe("Failover audio", () => {
  it("is off by default: unlocked and asked to play, it makes no sound", () => {
    const { ctx, audio } = setup();
    expect(audio.isOn()).toBe(false);
    audio.unlock();
    audio.play("place", 0);
    expect(voices(ctx)).toBe(0);
  });

  it("opens no AudioContext until unlock", () => {
    let made = 0;
    const audio = createFailoverAudio(() => {
      made++;
      return makeFakeCtx();
    });
    audio.setOn(true);
    audio.play("place", 0);
    expect(made).toBe(0);
    audio.unlock();
    audio.unlock();
    expect(made).toBe(1);
  });

  it("remembers the choice in failover:audio", () => {
    const { audio } = setup();
    audio.setOn(true);
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":true}');
    expect(createFailoverAudio(() => makeFakeCtx()).isOn()).toBe(true);
    audio.setOn(false);
    expect(window.localStorage.getItem("failover:audio")).toBe('{"v":1,"on":false}');
  });

  it.each(Object.keys(CUES) as CueName[])(
    "%s schedules one oscillator per note and one source per noise hit",
    (name) => {
      const { ctx, audio } = setup();
      audio.setOn(true);
      audio.unlock();
      audio.play(name, 0);
      expect(ctx.oscillators).toHaveLength(CUES[name].notes.length);
      expect(ctx.noiseSources).toHaveLength(CUES[name].noise.length);
    },
  );

  it("thins out a cue that fires many times a second", () => {
    const { ctx, audio } = setup();
    audio.setOn(true);
    audio.unlock();
    const per = CUES.fail.notes.length + CUES.fail.noise.length;
    audio.play("fail", 1000);
    audio.play("fail", 1010);
    audio.play("fail", 1050);
    expect(voices(ctx)).toBe(per);
    audio.play("fail", 1000 + 200);
    expect(voices(ctx)).toBe(per * 2);
  });

  it("muting ramps the master down and stops what is sounding", () => {
    const { ctx, audio } = setup();
    audio.setOn(true);
    audio.unlock();
    audio.play("gameOver", 0);
    audio.setOn(false);
    const master = ctx.gains[0]!;
    expect(master.gain.calls[master.gain.calls.length - 1]).toMatchObject({ m: "lin", v: 0 });
    for (const osc of ctx.oscillators) expect(osc.stopped.length).toBeGreaterThan(1);
  });

  it("close releases the context and a later unlock opens a new one", () => {
    const made: FakeCtx[] = [];
    const audio = createFailoverAudio(() => {
      const ctx = makeFakeCtx();
      made.push(ctx);
      return ctx;
    });
    audio.unlock();
    audio.close();
    audio.close();
    expect(made[0]!.closed).toBe(1);
    audio.unlock();
    expect(made).toHaveLength(2);
  });

  it("survives a browser with no AudioContext", () => {
    const audio = createFailoverAudio(() => null);
    audio.setOn(true);
    audio.unlock();
    expect(() => audio.play("place", 0)).not.toThrow();
  });
});

describe("cueForEvent", () => {
  it("maps the sim's events to the cue set", () => {
    expect(cueForEvent({ kind: "service-placed", id: "svc_1", type: "waf" })).toBe("place");
    expect(cueForEvent({ kind: "link-added", from: "internet", to: "svc_1" })).toBe("connect");
    expect(cueForEvent({ kind: "link-removed", from: "internet", to: "svc_1" })).toBe("delete");
    expect(cueForEvent({ kind: "service-removed", id: "svc_1" })).toBe("delete");
    expect(cueForEvent({ kind: "cache-hit", id: 1, serviceId: "svc_1" })).toBe("success");
    expect(cueForEvent({ kind: "event-end", event: "TRAFFIC_BURST" })).toBe("success");
    expect(
      cueForEvent({ kind: "request-failed", id: 1, reason: null, serviceId: null, breach: false }),
    ).toBe("fail");
    expect(cueForEvent({ kind: "request-blocked", id: 1, serviceId: "svc_1" })).toBe(
      "fraudBlocked",
    );
    expect(cueForEvent({ kind: "game-over", reason: "money" })).toBe("gameOver");
    expect(cueForEvent({ kind: "event-start", event: "COST_SPIKE", serviceId: null })).toBe(
      "eventWarning",
    );
    expect(cueForEvent({ kind: "spike-start" })).toBe("eventWarning");
  });

  it("keeps the rest quiet", () => {
    expect(cueForEvent({ kind: "money-short" })).toBeNull();
    expect(cueForEvent({ kind: "spike-end" })).toBeNull();
    expect(cueForEvent({ kind: "request-throttled", id: 1, serviceId: null })).toBeNull();
  });
});

describe("no audio files", () => {
  it("nothing under failover/ loads an audio file or builds an Audio element", () => {
    const root = path.resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "__tests__") walk(full);
        } else if (/\.(mp3|ogg|wav|m4a)$/i.test(entry)) {
          offenders.push(entry);
        } else if (/\.tsx?$/.test(entry)) {
          const text = readFileSync(full, "utf8");
          if (/new\s+Audio\s*\(|\.(mp3|ogg|wav|m4a)["'`]/.test(text)) offenders.push(entry);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
