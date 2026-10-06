const ALLOWED_PROTOCOLS = ["postgres:", "postgresql:"];
const ALLOWED_HOSTNAMES = ["localhost", "127.0.0.1"];
const REQUIRED_PATHNAME = "/arcade_it";

function refusal(why: string): Error {
  // The message never includes any part of the URL: it can carry a password.
  return new Error(
    `ARCADE_IT_DATABASE_URL refused: ${why}. The arcade integration test only runs against a throwaway database on localhost or 127.0.0.1 named arcade_it.`,
  );
}

/**
 * The hard guard for the one test that talks to a real Postgres. It throws, before any
 * connection is attempted, unless the URL is a postgres URL for exactly host localhost or
 * 127.0.0.1 and exactly database arcade_it, with no query string (pg honors a `?host=`
 * override) and no fragment. Host comparison is exact on the parsed hostname, so
 * `localhost@evil.com` (which parses to host evil.com) and `localhost.evil.com` fail.
 */
export function assertArcadeItUrl(raw: string): void {
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
