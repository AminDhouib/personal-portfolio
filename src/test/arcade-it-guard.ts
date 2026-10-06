const ALLOWED_PROTOCOLS = ["postgres:", "postgresql:"];
const ALLOWED_HOSTNAMES = ["localhost", "127.0.0.1"];
const REQUIRED_PATHNAME = "/arcade_it";

function refusal(why: string): Error {
  // The message never includes any part of the URL: it can carry a password.
  return new Error(
    `ARCADE_IT_DATABASE_URL refused: ${why}. The arcade integration test only runs against a throwaway database on localhost or 127.0.0.1 named arcade_it.`,
  );
}

/** True for U+0000 through U+0020 and U+007F: the characters a URL parser may swallow. */
function isSpaceOrControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return code <= 0x20 || code === 0x7f;
}

/**
 * The hard guard for the one test that talks to a real Postgres. It throws, before any
 * connection is attempted, unless the URL is a postgres URL for exactly host localhost or
 * 127.0.0.1 and exactly database arcade_it, with no query string (pg honors a `?host=`
 * override) and no fragment. Host comparison is exact on the parsed hostname, so
 * `localhost@evil.com` (which parses to host evil.com) and `localhost.evil.com` fail. A
 * percent-encoded host such as `%6cocalhost` also fails: for a non-special scheme the WHATWG
 * parser keeps the escape (host "%6cocalhost") while pg-connection-string decodes it to
 * "localhost", so the two disagree and the guard errs on the side of refusing.
 */
export function assertArcadeItUrl(raw: string): void {
  // The WHATWG parser below silently trims leading and trailing spaces and strips tabs and
  // newlines, but pg-connection-string does not: a leading space makes pg resolve the host
  // to "base", a trailing one makes the database name "arcade_it ". The guard and the driver
  // must see the same string, so any whitespace or control character is refused outright.
  if (raw !== raw.trim() || [...raw].some(isSpaceOrControl)) {
    throw refusal("the value contains whitespace or control characters");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refusal("the value is not a parseable URL");
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) throw refusal("the protocol is not postgres");
  if (!ALLOWED_HOSTNAMES.includes(url.hostname)) throw refusal("the host is not localhost");
  if (url.pathname !== REQUIRED_PATHNAME) throw refusal("the database is not arcade_it");
  if (url.search !== "" || url.hash !== "") throw refusal("the URL has a query or fragment");
}
