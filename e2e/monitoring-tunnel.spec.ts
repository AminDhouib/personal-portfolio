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

/** What `send` gets: a writer that goes quiet once the server has answered. */
interface Sender {
  write: (chunk: Buffer | string) => void;
  answered: () => boolean;
}

/**
 * One raw HTTP/1.1 POST to /monitoring. `send` writes the body (the request head is already
 * written) and may stall by simply returning; the promise settles on the first status line.
 * Once the server has answered, `write` does nothing, so a refusal that closes the socket with
 * unread bytes cannot turn into a write error.
 */
function rawPost(
  baseURL: string,
  headers: Record<string, string>,
  send: (sender: Sender) => Promise<void> | void,
  hardLimitMs: number,
): Promise<RawResponse> {
  const url = new URL(baseURL);
  const host = url.host;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    // URL keeps the brackets of an IPv6 literal ([::1]); net.connect wants it bare.
    const socket = connect({
      host: url.hostname.replace(/^\[|\]$/g, ""),
      port: Number(url.port || 80),
    });
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
    // A server that refuses early and closes with our bytes unread can reset the connection
    // (more likely on Windows, where a reset discards data not yet read). The status line may
    // still be queued behind the error event, so give the data handler one turn before failing.
    const failUnlessAnswered = (err: Error): void => {
      setImmediate(() => {
        if (!answered) finish(() => reject(err));
      });
    };

    socket.on("data", (chunk) => {
      buffered += chunk.toString("latin1");
      const match = /^HTTP\/1\.1 (\d{3}) /.exec(buffered);
      if (!match?.[1] || answered) return;
      answered = true;
      const status = Number(match[1]);
      finish(() => resolve({ status, elapsedMs: Date.now() - startedAt }));
    });
    socket.on("error", failUnlessAnswered);
    socket.on("close", () => failUnlessAnswered(new Error("socket closed before a response")));

    socket.on("connect", () => {
      const clientIp = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
      const lines: Record<string, string> = {
        Host: host,
        Origin: url.origin,
        "Content-Type": "application/x-sentry-envelope",
        // A fresh client IP per request keeps the route's per-IP rate limit out of the way. The
        // same valid IPv4 (TEST-NET-2, 198.51.100.1-250) goes in both headers, so the request
        // gets its own bucket whether the limiter keys on CF-Connecting-IP or on X-Forwarded-For.
        "CF-Connecting-IP": clientIp,
        "X-Forwarded-For": clientIp,
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
      const sender: Sender = {
        write: (chunk) => {
          if (!answered && !socket.destroyed) socket.write(chunk);
        },
        answered: () => answered,
      };
      void Promise.resolve(send(sender)).catch((err: unknown) =>
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
    // measured 15 s on a standalone build; the 25 s client limit below fails that regression
    // (no response in time), and the lower bound proves the 408 is the deadline, not an early
    // refusal.
    test.setTimeout(40_000);
    const res = await rawPost(
      baseURL ?? "",
      { "Content-Length": "1000" },
      ({ write }) => write("abcde"), // five bytes of a declared thousand, then silence
      25_000,
    );
    expect(res.status).toBe(408);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(9_000);
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

  test("a chunked upload is cut off with 413 while it is still being sent", async ({ baseURL }) => {
    const totalChunks = 12;
    let written = 0;
    const res = await rawPost(
      baseURL ?? "",
      { "Transfer-Encoding": "chunked" },
      async ({ write, answered }) => {
        const chunk = Buffer.alloc(MIB, 0x78);
        // Twelve MiB offered a MiB at a time, 100 ms apart. The cap is 5 MiB, so the server
        // must answer after the sixth chunk, long before the last one would be written.
        for (let i = 0; i < totalChunks && !answered(); i++) {
          write(`${MIB.toString(16)}\r\n`);
          write(chunk);
          write("\r\n");
          written += 1;
          await new Promise((r) => setTimeout(r, 100));
        }
        write("0\r\n\r\n");
      },
      15_000,
    );
    expect(res.status).toBe(413);
    // The cap fired mid-stream: the server needed more than 5 MiB to refuse, and answered
    // before the client had finished offering the body.
    expect(written).toBeGreaterThanOrEqual(6);
    expect(written).toBeLessThan(totalChunks);
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
