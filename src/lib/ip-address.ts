import { isIP } from "node:net";

/** The longest textual IPv6 address (an embedded IPv4 tail included) is 45 characters. */
const MAX_IP_LENGTH = 45;

/**
 * The trimmed value when it is a bare IPv4/IPv6 address, else null. `isIP` does the parsing; a
 * `%zone` suffix (which it accepts on IPv6) is refused too, since no real client address carries
 * one, and the length cap keeps a header from becoming an oversize key. Server-only: it uses
 * `node:net`, so the browser bundle must not import it.
 */
export function parseIpAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > MAX_IP_LENGTH || trimmed.includes("%")) return null;
  return isIP(trimmed) === 0 ? null : trimmed;
}
