// True for the hostnames a machine uses to talk to itself. `URL.hostname` keeps the brackets on
// an IPv6 literal, so "[::1]" is what window.location.hostname reports; the bare form is
// accepted too. Used by the browser Sentry init so a production build served from loopback (CI's
// Lighthouse and E2E jobs, the local docker compose stack) never reports to the live project.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}
