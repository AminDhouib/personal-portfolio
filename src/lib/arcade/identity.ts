import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

/** The anonymous player identity the arcade API trusts on first use. */
export interface ArcadeIdentity {
  playerId: string;
  token: string;
}

const KEY = "arcade:player:v1";
// The server validates the id with z.uuid() (RFC variant) and the token with this shape.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// Fallback when storage is blocked (private mode, sandboxed frames): one identity per page
// load instead of a new one per submit.
let memory: ArcadeIdentity | null = null;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// getRandomValues rather than randomUUID: randomUUID needs a secure context, and this site is
// also opened over plain HTTP on a LAN while developing.
function newPlayerId(): string {
  const bytes = randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// 32 random bytes as unpadded base64url: always 43 characters.
function newToken(): string {
  return btoa(String.fromCharCode(...randomBytes(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isIdentity(x: unknown): x is ArcadeIdentity {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.playerId === "string" &&
    UUID_V4.test(o.playerId) &&
    typeof o.token === "string" &&
    TOKEN.test(o.token)
  );
}

function readStored(): ArcadeIdentity | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // silent-ok: storage can be blocked; the in-memory identity covers the session
    return null;
  }
  if (raw === null) return null;
  // A JSON SyntaxError message can quote a slice of the input, and the input holds the token,
  // so the default report (console.error plus reportError with the raw error) is replaced by
  // one fixed message that carries no content.
  const parsed = safeJsonParse<unknown>(raw, "arcade-identity", null, () => {
    if (typeof reportError === "function") {
      reportError(new Error("arcade identity: stored value is not valid JSON, ignored"));
    }
  });
  return isIdentity(parsed) ? { playerId: parsed.playerId, token: parsed.token } : null;
}

function create(): ArcadeIdentity {
  const minted: ArcadeIdentity = { playerId: newPlayerId(), token: newToken() };
  let identity = minted;
  if (safeLocalSet(KEY, JSON.stringify(minted))) {
    // Two tabs on a first visit can each mint one and the last write wins; adopt what is
    // actually stored so both tabs end up with the same identity. Only after a successful
    // write: after a failed one the stored value is an older identity we are replacing.
    identity = readStored() ?? minted;
  }
  // Always kept: when the write failed (quota, blocked storage) this is the only copy.
  memory = identity;
  return identity;
}

/**
 * The identity if one exists, without creating or writing anything (safe on first paint).
 * Memory wins over storage: it is the newest identity this page load created, which matters
 * when a reset could not be stored and storage still holds the refused one.
 */
export function peekIdentity(): ArcadeIdentity | null {
  return memory ?? readStored();
}

/** The identity, created and stored on first use. Call it only when submitting a score. */
export function getIdentity(): ArcadeIdentity {
  return peekIdentity() ?? create();
}

/** Replace the identity (the server said the stored one is not ours to use). */
export function resetIdentity(): ArcadeIdentity {
  return create();
}
