import { createDeadlineFetch } from "@/lib/upstream-fetch";

// Sendly (our own email service, Devino project) transactional send. One POST, no SDK.
const SENDLY_EMAILS_URL = "https://api.sendly.now/api/v1/emails";
const SENDLY_TIMEOUT_MS = 10_000;

// Sendly caps a subject at 998 characters and rejects any CR or LF.
const SUBJECT_MAX = 998;

class SendlyError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined) {
    super(`Sendly send failed: HTTP ${status}${code ? ` ${code}` : ""}`);
    this.name = "SendlyError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Sendly renders `body` as an HTML template, so visitor text must be inert in
 * both layers: HTML-escaped, and with `{` encoded so a `{{...}}` in a message
 * can never reach the template engine (an unbalanced block fails the send).
 */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\{/g, "&#123;");
  return escaped.replace(/\r\n?|\n/g, "<br>\n");
}

/**
 * The subject is rendered by the same template engine (text context), where an
 * entity is not an option: a space after any `{` that precedes another `{`
 * breaks every `{{` opener. CR and LF would be a 422.
 */
function sanitizeSubject(subject: string): string {
  return subject
    .replace(/[\r\n]+/g, " ")
    .replace(/\{(?=\{)/g, "{ ")
    .slice(0, SUBJECT_MAX);
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      const { code } = parsed;
      return typeof code === "string" ? code.slice(0, 100) : undefined;
    }
  } catch {
    // silent-ok: a non-JSON error body (a proxy's HTML 502, say) carries no
    // Sendly code; the HTTP status in the thrown error is still reported.
  }
  return undefined;
}

/**
 * Sends a plain-text message through Sendly. Resolves on a 2xx; throws on a
 * non-2xx (SendlyError: status and Sendly's error code, never the key), a
 * network failure, or the deadline. `idempotencyKey` makes a retry of the same
 * logical send a no-op for 24h.
 */
export async function sendSendlyEmail(args: {
  apiKey: string;
  from: { email: string; name: string };
  to: string;
  reply?: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
}): Promise<void> {
  const deadlineFetch = createDeadlineFetch({ timeoutMs: SENDLY_TIMEOUT_MS });
  const res = await deadlineFetch(SENDLY_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
      ...(args.idempotencyKey && { "Idempotency-Key": args.idempotencyKey }),
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      ...(args.reply && { reply: args.reply }),
      subject: sanitizeSubject(args.subject),
      body: textToHtml(args.text),
    }),
  });
  if (!res.ok) throw new SendlyError(res.status, await errorCode(res));
  await res.body?.cancel();
}
