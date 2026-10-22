// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readCappedBody } from "../read-capped-body";

const encoder = new TextEncoder();

/** A request whose body is a stream of `chunks`, with no Content-Length (as a chunked upload arrives). */
function chunkedRequest(chunks: Uint8Array[], observe?: { pulls: number; cancelled: boolean }) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (observe) observe.pulls += 1;
      const next = chunks[index];
      index += 1;
      if (next === undefined) controller.close();
      else controller.enqueue(next);
    },
    cancel() {
      if (observe) observe.cancelled = true;
    },
  });
  return new Request("https://amindhou.com/api/test", {
    method: "POST",
    body,
    // Node's fetch requires this to send a stream body.
    duplex: "half",
  } as RequestInit);
}

describe("readCappedBody", () => {
  it("returns the text of a body under the cap", async () => {
    const req = new Request("https://amindhou.com/api/test", { method: "POST", body: '{"a":1}' });
    expect(await readCappedBody(req, 100)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("accepts a body of exactly the cap, and refuses one byte more", async () => {
    const exact = new Request("https://amindhou.com/api/test", {
      method: "POST",
      body: "x".repeat(20),
    });
    expect(await readCappedBody(exact, 20)).toEqual({ ok: true, text: "x".repeat(20) });

    const over = new Request("https://amindhou.com/api/test", {
      method: "POST",
      body: "x".repeat(21),
    });
    expect(await readCappedBody(over, 20)).toEqual({ ok: false, reason: "too-large" });
  });

  it("counts bytes, not characters", async () => {
    // Four 3-byte characters: 4 characters but 12 bytes.
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      body: "€".repeat(4),
    });
    expect(await readCappedBody(req, 11)).toEqual({ ok: false, reason: "too-large" });
    const fits = new Request("https://amindhou.com/api/test", {
      method: "POST",
      body: "€".repeat(4),
    });
    expect(await readCappedBody(fits, 12)).toEqual({ ok: true, text: "€".repeat(4) });
  });

  it("decodes a multi-byte character that straddles two chunks", async () => {
    const bytes = encoder.encode("a€b");
    const req = chunkedRequest([bytes.slice(0, 2), bytes.slice(2)]);
    expect(await readCappedBody(req, 100)).toEqual({ ok: true, text: "a€b" });
  });

  it("returns an empty string for a request with no body", async () => {
    const req = new Request("https://amindhou.com/api/test", { method: "POST" });
    expect(await readCappedBody(req, 100)).toEqual({ ok: true, text: "" });
  });

  it("stops pulling and cancels the stream once a chunked body passes the cap", async () => {
    const observe = { pulls: 0, cancelled: false };
    // 10,000 chunks of 1 KiB (10 MB) against a 4 KiB cap and no Content-Length.
    const chunks = Array.from({ length: 10_000 }, () => new Uint8Array(1024).fill(120));
    const result = await readCappedBody(chunkedRequest(chunks, observe), 4096);

    expect(result).toEqual({ ok: false, reason: "too-large" });
    expect(observe.cancelled).toBe(true);
    // Streams pre-pull a little ahead of the reader; the point is it is nowhere near 10,000.
    expect(observe.pulls).toBeLessThan(20);
  });

  it("returns the 413 at once even when cancelling the stream never settles", async () => {
    // A stalled upload can leave cancel() waiting on the socket; the answer must not wait with it.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024).fill(120));
      },
      cancel() {
        return new Promise<void>(() => undefined);
      },
    });
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);

    const outcome = await Promise.race([
      readCappedBody(req, 4096),
      new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 100)),
    ]);
    expect(outcome).toEqual({ ok: false, reason: "too-large" });
  });

  it("reports an errored stream as unreadable", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("{"));
      },
      pull(controller) {
        controller.error(new Error("socket reset"));
      },
    });
    const req = new Request("https://amindhou.com/api/test", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect(await readCappedBody(req, 100)).toEqual({ ok: false, reason: "unreadable" });
  });
});
