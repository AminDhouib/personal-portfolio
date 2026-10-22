/**
 * Reads a request body as text, stopping at a byte cap.
 *
 * `Request.text()` buffers the whole body before anything can look at its size, and a chunked
 * upload carries no `Content-Length` for a pre-check to read, so a cap that only inspects the
 * header is bypassed by leaving the header off. This reads the stream chunk by chunk, counts bytes
 * as they arrive, and cancels the stream the moment the running total passes the cap, so an
 * oversized upload costs at most the cap plus one chunk of memory.
 *
 * Both the shared JSON guard (route-guard.ts) and the chat route use it. The monitoring tunnel has
 * its own reader because it also needs idle and overall deadlines.
 */

export type CappedBody =
  { ok: true; text: string } | { ok: false; reason: "too-large" | "unreadable" };

export async function readCappedBody(req: Request, maxBytes: number): Promise<CappedBody> {
  const stream = req.body;
  if (!stream) return { ok: true, text: "" };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        // The reader is cancelled so the rest of the upload is not pulled. Not awaited, as in the
        // monitoring tunnel: cancelling a stalled upload can wait on the socket, and the 413 must
        // not wait with it. A failed cancel changes nothing about the answer.
        void reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    // silent-ok: a broken or aborted request stream is a client error, surfaced by the caller
    return { ok: false, reason: "unreadable" };
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}
