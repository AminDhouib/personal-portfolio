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

/** The eight 16-bit groups of a valid IPv6 address (`::` expanded, an IPv4 tail converted). */
function ipv6Groups(address: string): number[] {
  let text = address;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", rest] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = rest ? rest.split(":") : [];
  const fill = rest === undefined ? [] : Array<string>(8 - front.length - back.length).fill("0");
  return [...front, ...fill, ...back].map((group) => parseInt(group, 16));
}

/**
 * The rate-limit key for an address that already passed `parseIpAddress`. IPv4 is kept whole. An
 * IPv6 address is reduced to its /64 (a single subscriber holds at least that, so the host half
 * is free for the client to rotate), written in one canonical spelling so `2001:DB8::1` and
 * `2001:0db8:0:0:ffff::` share a key. An IPv4-mapped address (`::ffff:a.b.c.d`) is the same
 * client as its plain IPv4 form and collapses onto it.
 */
export function ipRateLimitKey(address: string): string {
  if (!address.includes(":")) return address;
  const groups = ipv6Groups(address);
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
  }
  return `${[g0, g1, g2, g3].map((group) => group.toString(16)).join(":")}::/64`;
}
