import { connect } from "node:net";
import { expect, test } from "@playwright/test";
import { isLocalhost } from "./helpers";

// The Sentry tunnel's body deadlines and size cap (src/app/monitoring/route.ts), driven over a
// raw TCP socket against the running production build. The route's unit tests mock the request
// body; this is the one place Next's own request handling and src/proxy.ts are in the path. It
// matters because Next buffers a request body in the proxy layer before a matched handler runs,
// so a regression in the proxy matcher (which deliberately skips `/monitoring`) would answer a
// stalled upload late, and only a real socket can see that. Playwright's request API cannot do
// this: it always sends the whole body.
//
// None of these cases reaches Sentry: each is refused or timed out before the DSN check and the
// relay, so the suite needs no SENTRY_DSN or network. It skips off localhost; never point it at
// a deployed host.

const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024;
const MIB = 1024 * 1024;

interface RawResponse {
  status: number;
  elapsedMs: number;
}

/**
 * One raw HTTP/1.1 POST to /monitoring. `send` writes the body (the request head is already
 * written) and may stall by simply returning; the promise settles on the first status line.
 */
function rawPost(
  baseURL: string,
  headers: Record<string, string>,
  send: (write: (chunk: Buffer | string) => void) => Promise<void> | void,
  hardLimitMs: number,
): Promise<RawResponse> {
  const url = new URL(baseURL);
  const host = url.host;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 80) });
    let answered = false;
    let buffered = "";
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      socket.destroy();
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`no response within ${hardLimitMs} ms`))),
      hardLimitMs,
    );

    socket.on("data", (chunk) => {
      buffered += chunk.toString("latin1");
      const match = /^HTTP\/1\.1 (\d{3}) /.exec(buffered);
      if (!match?.[1] || answered) return;
      answered = true;
      const status = Number(match[1]);
      finish(() => resolve({ status, elapsedMs: Date.now() - startedAt }));
    });
    // The server answers and may close while we are still writing: a reset after the status
    // line is the expected end of an early refusal, not a failure.
    socket.on("error", (err) => {
      if (!answered) finish(() => reject(err));
    });
    socket.on("close", () => {
      if (!answered) finish(() => reject(new Error("socket closed before a response")));
    });

    socket.on("connect", () => {
      const lines: Record<string, string> = {
        Host: host,
        Origin: url.origin,
        "Content-Type": "application/x-sentry-envelope",
        // A fresh client IP per request keeps the route's per-IP rate limit out of the way.
        "X-Forwarded-For": `198.51.100.${1 + Math.floor(Math.random() * 250)}`,
        Connection: "close",
        ...headers, // a caller's header replaces the default of the same name
      };
      const head = [
        "POST /monitoring HTTP/1.1",
        ...Object.entries(lines).map(([k, v]) => `${k}: ${v}`),
        "",
        "",
      ].join("\r\n");
      socket.write(head);
      void Promise.resolve(send((chunk) => void socket.write(chunk))).catch((err: unknown) =>
        finish(() => reject(err instanceof Error ? err : new Error(String(err)))),
      );
    });
  });
}

test.describe("Sentry tunnel over a raw socket", () => {
  test.skip(({ baseURL }) => !isLocalhost(baseURL), "raw-socket probes run against localhost only");

  test("a stalled upload is answered 408 at the idle deadline, not by the client", async ({
    baseURL,
  }) => {
    // Idle deadline is 10 s (BODY_IDLE_TIMEOUT_MS). Next buffering the body ahead of the handler
    // measured 15 s on a standalone build, so "well before 15 s" is what this pins.
    test.setTimeout(40_000);
    const res = await rawPost(
      baseURL ?? "",
      { "Content-Length": "1000" },
      (write) => write("abcde"), // five bytes of a declared thousand, then silence
      25_000,
    );
    expect(res.status).toBe(408);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(9_000);
    expect(res.elapsedMs).toBeLessThan(13_000);
  });

  test("a declared Content-Length over 5 MiB is refused 413 before any body is sent", async ({
    baseURL,
  }) => {
    const res = await rawPost(
      baseURL ?? "",
      { "Content-Length": String(MAX_ENVELOPE_BYTES + 1) },
      () => undefined, // headers only, no body at all
      8_000,
    );
    expect(res.status).toBe(413);
    // Early means immediate; the idle deadline would take 10 s.
    expect(res.elapsedMs).toBeLessThan(5_000);
  });

  test("a chunked upload is cut off with 413 once it passes 5 MiB", async ({ baseURL }) => {
    const res = await rawPost(
      baseURL ?? "",
      { "Transfer-Encoding": "chunked" },
      async (write) => {
        const chunk = Buffer.alloc(MIB, 0x78);
        // Seven MiB offered, one chunk at a time; the cap is 5 MiB, so the server must stop
        // reading and answer before the last chunk is accepted.
        for (let i = 0; i < 7; i++) {
          write(`${MIB.toString(16)}\r\n`);
          write(chunk);
          write("\r\n");
          await new Promise((r) => setTimeout(r, 20));
        }
        write("0\r\n\r\n");
      },
      15_000,
    );
    expect(res.status).toBe(413);
  });

  test("a request from a foreign Origin is refused 403 (control for the cases above)", async ({
    baseURL,
  }) => {
    const res = await rawPost(
      baseURL ?? "",
      { Origin: "http://evil.example", "Content-Length": "0" },
      () => undefined,
      8_000,
    );
    expect(res.status).toBe(403);
  });
});
