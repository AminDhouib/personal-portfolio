# T-5533 evidence: origin not internet-reachable, closed as accepted risk (option 3); WordPress.org password rotated

## Off-LAN origin probe

`1-offlan-probe.png` is a headed stealth Chrome clone (no session) on Actions run 40029063373, job `probe`, ubuntu-latest on GitHub's cloud (runner egress 57.151.136.176). The workflow was a throwaway on branch `probe/t5533-origin` and was never merged; the branch was deleted afterwards.

- `http://184.146.10.33/`: http_code=000, curl exit 28 (connection timed out after 10 s)
- `https://184.146.10.33/`: http_code=000, curl exit 28 (connection timed out after 10 s)
- `https://amindhou.com/` (control, Cloudflare): http_code=200, curl exit 0
- raw TCP 184.146.10.33:80 and :443: closed or filtered (timeout exit 124)

MASTER's own off-LAN probe at 21:48Z (Anthropic egress) got ECONNREFUSED on 443.

Read-only ssh on devino-first showed all 43 established Traefik connections arriving from 10.240.x.x through docker-proxy on 127.0.0.1:443, i.e. amindhou.com is served through a Cloudflare Tunnel (cloudflared). Visitor traffic never reaches the origin directly. The origin lock that was built (branch sec/t5533-origin-lock at 2b1f1f68) keyed on X-Real-Ip being a Cloudflare range; behind the tunnel it would have answered 403 to every visitor. It was never shipped, and the branch is deleted.

Outcome: no internet exposure. Traffic enters through the Cloudflare Tunnel. The residual LAN, Tailscale and co-hosted-container risk is accepted. A LOW follow-up narrows the Traefik forwardedHeaders.trustedIPs from 10.0.0.0/8 to the actual Docker gateway subnet as defense in depth.

## WordPress.org secret rotation

The account is devinosolutions, rotated 2026-10-23 at profiles.wordpress.org.
- `wp-1-changed.png`: "New password saved."
- `wp-2-relogin.png`: re-login with the new value succeeded.

The new value exists only as the replaced line in MASTER_CHAT/account-passwords.txt and was never printed.

Tailscale OAuth: there was nothing to rotate in this repo. The TS_OAUTH_* secrets were never set; the only repo secrets are DOKPLOY_URL and DOKPLOY_TOKEN. MASTER closed this item.
