# Vendored from DevinoSolutions/.github, path actions/security-audit/security_audit.py, commit 27fb535cbd0228d069c0d36e6b888a8bcc85e726.
# Vendored because this repo is owned by a personal account and cannot call the private org action.
# Unmodified. To resync, diff against a newer commit of the source path (see DESIGN.md).
"""Two checks behind `.github/workflows/security-audit.yml`.

`report`    Reads the package manager's own `audit --json` output and turns it
            into a severity table plus a pass/fail verdict. One parser for
            pnpm, npm, yarn (berry) and bun, because all four spell the same
            counts differently and three of them change shape between majors.

`overrides` The check no package manager and no Dependabot feature performs:
            it reads every `overrides` / `resolutions` / `pnpm.overrides` entry
            in the repository -- in `package.json` at any depth and in
            `pnpm-workspace.yaml` -- works out the LOWEST version each entry
            still admits, and asks the GitHub advisory database whether that
            version is vulnerable.

WHY THE SECOND CHECK EXISTS. A security override is written once, against one
advisory, as `pkg@<X: ^X`. It is correct exactly once. The next advisory in the
same package moves the floor to X+1 and the override silently becomes a
CEILING: the resolution is capped at a version that is now vulnerable, the
ordinary "bump the manifest" reflex does not move it, and `pnpm audit` still
reports the advisory with no hint that an override is the reason it cannot be
fixed. Dependabot detects the alert (alerts are computed from the lockfile) but
commonly cannot compute a passing fix and opens no PR at all.

The DevinoSolutions fleet carries 231 hand-written override entries across four
repos -- 177 of them in `notifly`, several with prose comments naming a
specific GHSA. A single advisory sweep on 2026-09-11 found 8 of them stale.
Nothing re-checked them between the day they were written and that sweep.

An exact pin (`"sharp": "0.35.3"`) is the worst shape of all: it is a permanent
ceiling with no lower bound to outgrow, so it goes stale on the NEXT advisory
and stays stale. Those are reported as warnings even while they are clean,
because "clean today" is the entire failure mode.

FAILING CLOSED. If the advisory database cannot be reached, this script exits
non-zero rather than reporting "no findings". A security audit that silently
skips its lookup is indistinguishable from a green one, and that is the exact
shape of failure the whole file exists to prevent.

IGNORING AN ADVISORY (`report --ignore-advisories`). Some advisories have no
upstream fix at all -- `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm) had no patched
release, so a repository that needs `braces` can never go green. The package
managers' own mutes do not solve it: `pnpm.auditConfig.ignoreGhsas` removes the
advisory from the pnpm `advisories` list but leaves `metadata.vulnerabilities`
(which this gate reads) and the exit code unchanged. So the ignore is applied
HERE, by recounting severities from the advisory list that remains.

An ignore is never open-ended. Each line carries a reason and an expiry no more
than 30 days out, and an expired ignore turns the job red until a human
re-reviews it. Every run that is given ignores prints them -- with days left and
whether the advisory still appeared -- in the job summary, so nothing hides
silently. The override check (`overrides`) never sees the list: a stale override
is a fix the repository can make today, and exempting it would hide the exact
self-inflicted ceiling that check exists to find.

The recount FAILS CLOSED. It only runs on a document it can fully map: it must
recognise the package manager's shape, and with no ignores it must reproduce the
package manager's own totals exactly. Anything else is an error, never a pass.

Stdlib only except PyYAML, which is needed for `pnpm-workspace.yaml` and is
pulled in by `uv run --with pyyaml` the same way `scripts/ci-lint/lint.py` is.
No `gh`, no `jq`: the ubuntu-devino runner image ships neither.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com/advisories"
SEVERITIES = ("critical", "high", "moderate", "low", "info")
SEVERITY_RANK = {name: index for index, name in enumerate(SEVERITIES)}

# npm/pnpm/yarn spell the two middle levels differently depending on the major
# and the ecosystem. Normalise before counting anything.
SEVERITY_ALIASES = {
    "critical": "critical",
    "high": "high",
    "moderate": "moderate",
    "medium": "moderate",
    "low": "low",
    "info": "info",
    "informational": "info",
    "unknown": "info",
}

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".next",
    ".turbo",
    ".yarn",
    ".pnpm-store",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    "Pods",
}

# Values that name something other than a version range. `$pkg` is pnpm's
# "use the version this workspace already depends on"; the rest are protocols.
NON_VERSION_PREFIXES = ("$", "npm:", "link:", "file:", "workspace:", "catalog:", "git")

VERSION_TOKEN = re.compile(r"(?P<op><=|>=|[<>~^=])?\s*v?(?P<version>\d+\.\d+\.\d+[^\s|,]*)")


# --------------------------------------------------------------------------
# semver, only as far as this needs it
# --------------------------------------------------------------------------


def parse_version(text: str) -> tuple:
    """(major, minor, patch, is_release) -- prereleases sort below the release."""
    core = re.match(r"(\d+)\.(\d+)\.(\d+)(?:[-+](.*))?$", text.strip())
    if not core:
        return (0, 0, 0, 0)
    major, minor, patch, extra = core.groups()
    return (int(major), int(minor), int(patch), 0 if extra else 1)


def max_version(versions):
    known = [v for v in versions if v]
    if not known:
        return None
    return max(known, key=parse_version)


# --------------------------------------------------------------------------
# override discovery
# --------------------------------------------------------------------------


# A `>` is pnpm's dependency-path separator only when a package name follows
# it. In `js-yaml@>=4.0.0 <4.3.1` the `>` belongs to the range, and splitting on
# it naively yields the package name `=4.0.0 <4.3.1`, which matches no advisory
# and reports the entry as clean -- a false green on exactly the shape this
# check exists to catch. A package name starts with a letter, `@` or `_`; a
# range operator is followed by `=`, a digit or `v`.
PATH_SEPARATOR = re.compile(r">(?=[A-Za-z@_])")


def split_key(key: str) -> tuple[str, str | None]:
    """`sharp@<0.35.0` -> ('sharp', '<0.35.0'); `nextjs>next` -> ('next', None).

    The last path segment names the package the entry actually pins; everything
    before it is the dependency path it applies under. A scoped name starts
    with `@`, so the selector separator is the SECOND `@`, not the first.
    """
    segment = PATH_SEPARATOR.split(key)[-1].strip()
    at = segment.find("@", 1 if segment.startswith("@") else 0)
    if at <= 0:
        return segment, None
    return segment[:at], segment[at + 1 :]


def lowest_admitted(value: str) -> tuple[str | None, str]:
    """The lowest version an override value still admits, and how it was read.

    `^0.35.3` and `>=0.35.3` admit 0.35.3. `0.35.3` admits only 0.35.3. A value
    carrying nothing but an upper bound (`<0.35.0`) or a wildcard admits
    anything at all, which is reported rather than guessed at.
    """
    text = (value or "").strip()
    if not text or text in {"*", "x", "latest"}:
        return None, "unbounded"
    if text.startswith(NON_VERSION_PREFIXES):
        return None, "not-a-version"
    lowest = None
    for match in VERSION_TOKEN.finditer(text):
        if (match.group("op") or "") in {"<", "<="}:
            continue
        version = match.group("version")
        if lowest is None or parse_version(version) < parse_version(lowest):
            lowest = version
    if lowest is None:
        return None, "unbounded"
    exact = bool(re.fullmatch(r"v?\d+\.\d+\.\d+[^\s|,]*", text))
    return lowest, "exact" if exact else "range"


def flatten_overrides(table, prefix=""):
    """pnpm allows a nested map under a key; flatten it to `parent>child`."""
    out = []
    if not isinstance(table, dict):
        return out
    for key, value in table.items():
        name = f"{prefix}>{key}" if prefix else str(key)
        if isinstance(value, dict):
            for inner_key, inner_value in value.items():
                if inner_key == ".":
                    out.append((name, inner_value))
                else:
                    out.extend(flatten_overrides({inner_key: inner_value}, name))
        elif isinstance(value, str):
            out.append((name, value))
    return out


def collect_entries(root: str):
    """Every override entry in the tree, as (file, table, key, value)."""
    entries = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for filename in filenames:
            path = os.path.join(dirpath, filename)
            rel = os.path.relpath(path, root).replace(os.sep, "/")
            if filename == "package.json":
                try:
                    with open(path, encoding="utf-8") as handle:
                        doc = json.load(handle)
                except Exception as exc:  # noqa: BLE001 -- reported, not swallowed
                    entries.append(("!" + rel, "parse", str(exc), ""))
                    continue
                if not isinstance(doc, dict):
                    continue
                for table, node in (
                    ("overrides", doc.get("overrides")),
                    ("resolutions", doc.get("resolutions")),
                    ("pnpm.overrides", (doc.get("pnpm") or {}).get("overrides")
                        if isinstance(doc.get("pnpm"), dict) else None),
                ):
                    for key, value in flatten_overrides(node):
                        entries.append((rel, table, key, value))
            elif filename in {"pnpm-workspace.yaml", "pnpm-workspace.yml"}:
                import yaml  # imported here so `report` needs no PyYAML

                try:
                    with open(path, encoding="utf-8") as handle:
                        doc = yaml.safe_load(handle) or {}
                except Exception as exc:  # noqa: BLE001
                    entries.append(("!" + rel, "parse", str(exc), ""))
                    continue
                if not isinstance(doc, dict):
                    continue
                for table in ("overrides", "resolutions"):
                    for key, value in flatten_overrides(doc.get(table)):
                        entries.append((rel, table, key, value))
    return sorted(entries)


# --------------------------------------------------------------------------
# advisory lookup
# --------------------------------------------------------------------------


class AdvisoryClient:
    """`GET /advisories?ecosystem=npm&affects=<name>@<version>`.

    The `affects` filter does the range arithmetic server-side, so this file
    never has to implement npm range semantics -- the thing every hand-rolled
    audit script gets subtly wrong. An empty array means that exact version is
    not covered by any advisory GitHub knows about.
    """

    def __init__(self, offline_file=None, delay=0.2, token=None):
        self.cache = {}
        self.delay = delay
        self.token = token
        self.requests = 0
        self.offline = None
        if offline_file:
            with open(offline_file, encoding="utf-8") as handle:
                self.offline = json.load(handle)

    def fetch(self, name: str, version: str):
        key = f"{name}@{version}"
        if key in self.cache:
            return self.cache[key]
        if self.offline is not None:
            if key not in self.offline:
                raise LookupError(f"offline advisory fixture has no entry for {key}")
            self.cache[key] = self.offline[key]
            return self.cache[key]
        url = API + "?" + urllib.parse.urlencode(
            {"ecosystem": "npm", "affects": key, "per_page": "100"}
        )
        request = urllib.request.Request(url)
        request.add_header("Accept", "application/vnd.github+json")
        request.add_header("X-GitHub-Api-Version", "2022-11-28")
        request.add_header("User-Agent", "DevinoSolutions-security-audit")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        last = None
        for attempt in range(4):
            try:
                time.sleep(self.delay)
                with urllib.request.urlopen(request, timeout=30) as response:
                    self.requests += 1
                    payload = json.loads(response.read().decode("utf-8"))
                self.cache[key] = payload
                return payload
            except urllib.error.HTTPError as exc:
                last = exc
                if exc.code in (403, 429):
                    wait = int(exc.headers.get("Retry-After") or (20 * (attempt + 1)))
                    print(f"::notice::advisory API {exc.code} on {key}; waiting {wait}s")
                    time.sleep(min(wait, 90))
                    continue
                raise LookupError(f"advisory API {exc.code} for {key}") from exc
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                last = exc
                time.sleep(5 * (attempt + 1))
        raise LookupError(f"advisory API unreachable for {key}: {last}")


RANGE_PART = re.compile(r"^(?P<op><=|>=|<|>|=)?\s*(?P<version>\d+\S*)$")


def range_contains(text, version):
    """Does GitHub's `>= 3.0.0, < 3.15.2` style range cover `version`?

    Needed because ONE advisory commonly lists several ranges for the same
    package -- one per release line. GHSA-2883 covers js-yaml `>= 3.0.0,
    < 3.15.2` (patched 3.15.2) AND `>= 4.0.0, < 4.3.2` (patched 4.3.2).
    Reporting the maximum across all of them tells the holder of a 3.x pin to
    go to 4.3.2, which is a major bump they do not need and, worse, is wrong
    advice presented as fact. The range that actually contains the pinned floor
    is the one whose patched version answers the question.

    Returns None when the range cannot be parsed, so the caller can keep the
    entry rather than silently dropping a finding.
    """
    if not text:
        return None
    target = parse_version(version)
    for part in str(text).split(","):
        match = RANGE_PART.match(part.strip())
        if not match:
            return None
        bound = parse_version(match.group("version"))
        op = match.group("op") or "="
        if op == "<" and not target < bound:
            return False
        if op == "<=" and not target <= bound:
            return False
        if op == ">" and not target > bound:
            return False
        if op == ">=" and not target >= bound:
            return False
        if op == "=" and target != bound:
            return False
    return True


def relevant_vulns(vulns, version):
    """Keep the ranges that actually contain `version`, or all if none parsed."""
    matched = [v for v in vulns if range_contains(v.get("range"), version)]
    return matched or vulns


def vulns_for(payload, name: str):
    """The `vulnerabilities` entries of non-withdrawn advisories naming `name`."""
    out = []
    for advisory in payload or []:
        if advisory.get("withdrawn_at"):
            continue
        for vuln in advisory.get("vulnerabilities") or []:
            package = (vuln.get("package") or {}).get("name")
            if package != name:
                continue
            patched = vuln.get("first_patched_version")
            if isinstance(patched, dict):
                patched = patched.get("identifier")
            out.append(
                {
                    "ghsa": advisory.get("ghsa_id"),
                    "severity": SEVERITY_ALIASES.get(
                        (advisory.get("severity") or "info").lower(), "info"
                    ),
                    "range": vuln.get("vulnerable_version_range"),
                    "patched": patched,
                }
            )
    return out


# --------------------------------------------------------------------------
# the override check
# --------------------------------------------------------------------------


def audit_overrides(root, client, fail_on):
    findings = []
    entries = collect_entries(root)
    unresolved = []
    for rel, table, key, value in entries:
        if rel.startswith("!"):
            findings.append(
                {
                    "kind": "unreadable",
                    "file": rel[1:],
                    "table": table,
                    "key": key,
                    "value": value,
                    "worst": "high",
                    "vulns": [],
                    "floor": None,
                }
            )
            continue
        name, selector = split_key(key)
        floor, shape = lowest_admitted(value)
        if shape in {"not-a-version", "unbounded"}:
            unresolved.append(
                {"file": rel, "table": table, "key": key, "value": value, "why": shape}
            )
            continue
        vulns = relevant_vulns(vulns_for(client.fetch(name, floor), name), floor)
        if vulns:
            worst = min(vulns, key=lambda v: SEVERITY_RANK[v["severity"]])["severity"]
            findings.append(
                {
                    "kind": "stale",
                    "file": rel,
                    "table": table,
                    "key": key,
                    "package": name,
                    "selector": selector,
                    "value": value,
                    "floor": floor,
                    "shape": shape,
                    "worst": worst,
                    "patched": max_version([v["patched"] for v in vulns]),
                    "vulns": vulns,
                }
            )
        elif shape == "exact":
            findings.append(
                {
                    "kind": "ceiling",
                    "file": rel,
                    "table": table,
                    "key": key,
                    "package": name,
                    "selector": selector,
                    "value": value,
                    "floor": floor,
                    "shape": shape,
                    "worst": "info",
                    "vulns": [],
                }
            )
    failing = [
        f
        for f in findings
        if f["kind"] in {"stale", "unreadable"} and f["worst"] in fail_on
    ]
    return {
        "entries": len(entries),
        "findings": findings,
        "unresolved": unresolved,
        "failing": len(failing),
        "requests": client.requests,
    }


def render_overrides(result, fail_on):
    lines = ["## Override audit", ""]
    stale = [f for f in result["findings"] if f["kind"] == "stale"]
    ceilings = [f for f in result["findings"] if f["kind"] == "ceiling"]
    unreadable = [f for f in result["findings"] if f["kind"] == "unreadable"]
    lines.append(
        f"`{result['entries']}` override/resolution entries read; "
        f"**{len(stale)} stale**, {len(ceilings)} unconditional pin(s), "
        f"{len(result['unresolved'])} not version-resolvable."
    )
    lines.append("")
    if stale:
        lines += [
            "### Stale -- the pinned floor is itself vulnerable",
            "",
            "| file | table | entry | admits | patched at | severity | advisory |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for f in sorted(stale, key=lambda f: SEVERITY_RANK[f["worst"]]):
            ghsas = ", ".join(sorted({v["ghsa"] or "?" for v in f["vulns"]}))
            # Some advisories have no fix at all -- `ip`'s GHSA-2p57-rm9w-gvfp
            # carries no first_patched_version. Printing "None" reads as a bug
            # in this script rather than as the finding it is.
            patched = f["patched"] or "no patched release"
            lines.append(
                f"| `{f['file']}` | `{f['table']}` | `{f['key']}: {f['value']}` | "
                f"`{f['floor']}` | **{patched}** | **{f['worst']}** | {ghsas} |"
            )
        lines.append("")
        lines.append(
            "An override is written against one advisory and is correct exactly once. "
            "Each row above still admits a version the advisory database calls "
            "vulnerable, so the entry is now a ceiling rather than a floor: bumping "
            "the manifest will not move it."
        )
        lines.append("")
    if unreadable:
        lines += ["### Unreadable manifests", ""]
        for f in unreadable:
            lines.append(f"- `{f['file']}`: {f['key']}")
        lines.append("")
    if ceilings:
        lines += [
            "### Unconditional pins -- clean today, permanent ceilings (warning only)",
            "",
            "| file | table | entry |",
            "| --- | --- | --- |",
        ]
        for f in ceilings:
            lines.append(f"| `{f['file']}` | `{f['table']}` | `{f['key']}: {f['value']}` |")
        lines += [
            "",
            "These name one exact version with no upper-bound selector, so the next "
            "advisory in the package converts them to stale rows above with no edit "
            "to the repository. Prefer `pkg@<X: ^X`.",
            "",
        ]
    if result["unresolved"]:
        lines += [
            "### Not version-resolvable (reported, never guessed at)",
            "",
            "| file | entry | why |",
            "| --- | --- | --- |",
        ]
        for u in result["unresolved"]:
            lines.append(f"| `{u['file']}` | `{u['key']}: {u['value']}` | {u['why']} |")
        lines.append("")
    lines.append(
        f"Gate: fails on {'/'.join(sorted(fail_on, key=lambda s: SEVERITY_RANK[s]))}. "
        f"{result['failing']} failing finding(s). {result['requests']} advisory request(s)."
    )
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# the package-manager audit report
# --------------------------------------------------------------------------


def count_audit(doc):
    """Severity counts from any of the four audit JSON shapes.

    npm >= 7 and pnpm carry `metadata.vulnerabilities`. bun, npm 6 and yarn
    berry do not, so the fallback walks the document and counts `severity`
    fields on the advisory objects themselves. Berry capitalises the key
    (`"Severity"`), which this walk used to miss, so every berry audit counted
    zero and the gate passed whatever the tree contained.
    """
    counts = {name: 0 for name in SEVERITIES}
    meta = (doc or {}).get("metadata") if isinstance(doc, dict) else None
    table = (meta or {}).get("vulnerabilities") if isinstance(meta, dict) else None
    if isinstance(table, dict) and any(isinstance(v, int) for v in table.values()):
        for key, value in table.items():
            name = SEVERITY_ALIASES.get(str(key).lower())
            if name and isinstance(value, int):
                counts[name] += value
        return counts, "metadata.vulnerabilities"

    seen = []

    def walk(node):
        if isinstance(node, dict):
            severity = node.get("severity", node.get("Severity"))
            if isinstance(severity, str) and severity.lower() in SEVERITY_ALIASES:
                seen.append(SEVERITY_ALIASES[severity.lower()])
                return  # do not double-count nested `via` copies of the same entry
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(doc)
    for name in seen:
        counts[name] += 1
    return counts, "severity fields"


def load_audit(raw):
    """The audit document from a package manager's stdout, or None.

    A package manager that printed progress lines before its JSON, or one that
    emitted NDJSON (yarn berry: one record per advisory), still has a parseable
    object in there. NDJSON comes back as `{"lines": [record, ...]}`.
    """
    doc = None
    for candidate in (raw, raw[raw.find("{") :] if "{" in raw else ""):
        try:
            doc = json.loads(candidate)
            break
        except Exception:  # noqa: BLE001
            continue
    if doc is None:
        merged = {}
        for line in raw.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                piece = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            if isinstance(piece, dict):
                merged.setdefault("lines", []).append(piece)
        doc = merged or None
    return doc


def render_report(counts, source, pm, command, fail_on, exit_code, native=None):
    """The severity table. `native` is the package manager's own count; it is
    passed only when ignores were applied, and adds a "before ignores" column so
    the effect of the list is visible in the same table that gates the job."""
    total = sum(counts.values())
    failing = sum(counts[name] for name in fail_on)
    lines = [
        "## Dependency audit",
        "",
        f"`{command}` (package manager `{pm}`, counted from {source}, exit {exit_code})",
        "",
    ]
    if native is None:
        lines += ["| severity | count |", "| --- | --- |"]
    else:
        lines += [
            "| severity | before ignores | after ignores (gated) |",
            "| --- | --- | --- |",
        ]
    for name in SEVERITIES:
        mark = "**" if name in fail_on and counts[name] else ""
        cell = f"{mark}{counts[name]}{mark}"
        if native is None:
            lines.append(f"| {name} | {cell} |")
        else:
            lines.append(f"| {name} | {native[name]} | {cell} |")
    if native is None:
        lines.append(f"| **total** | **{total}** |")
    else:
        lines.append(f"| **total** | {sum(native.values())} | **{total}** |")
    lines += [
        "",
        f"Gate: fails on {'/'.join(sorted(fail_on, key=lambda s: SEVERITY_RANK[s]))}. "
        f"{failing} at or above the gate.",
        "",
    ]
    return "\n".join(lines), failing


# --------------------------------------------------------------------------
# the ignore list
# --------------------------------------------------------------------------

MAX_IGNORE_DAYS = 30

# GitHub's advisory id alphabet leaves out the vowels and the easily-confused
# characters, so a typo'd id usually fails here instead of silently matching
# nothing.
GHSA_BODY = r"GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}"
GHSA_ID = re.compile(GHSA_BODY, re.IGNORECASE)
GHSA_ONLY = re.compile(rf"^{GHSA_BODY}$", re.IGNORECASE)
EXPIRES = re.compile(r"^expires=(\d{4})-(\d{2})-(\d{2})$")

IGNORE_FORMAT = "`GHSA-xxxx-xxxx-xxxx | expires=YYYY-MM-DD | reason`"


def canonical_ghsa(text):
    """`ghsa-VFJ7-8cjw-p6xm` -> `GHSA-vfj7-8cjw-p6xm`, the way GitHub prints it."""
    return "GHSA" + text[4:].lower()


def annotation(text):
    """Escape a string for a workflow command, so a reason cannot start one."""
    return str(text).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def table_cell(text):
    return str(text).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def parse_ignores(text, today):
    """Parse the `ignore-advisories` input into (entries, errors).

    One entry per line: `GHSA-xxxx-xxxx-xxxx | expires=YYYY-MM-DD | reason`.
    Blank lines and lines starting with `#` are skipped; there are no trailing
    comments, because a reason is free text and may contain a `#`. The reason
    may contain `|`: only the first two are separators.

    Every problem is collected rather than raised, so one run reports the whole
    list instead of one line at a time. An expiry that is today or in the past
    is an error ("re-review on expiry"), and so is one more than
    MAX_IGNORE_DAYS ahead: an ignore that can live for a year is a mute.
    """
    entries, errors = [], []
    first_line = {}
    for number, raw in enumerate((text or "").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        where = f"ignore-advisories line {number}"
        parts = [part.strip() for part in line.split("|", 2)]
        if len(parts) != 3:
            errors.append(f"{where}: expected {IGNORE_FORMAT}, got '{line}'")
            continue
        ident, expiry, reason = parts
        problems = []

        ghsa = None
        if GHSA_ONLY.match(ident):
            ghsa = canonical_ghsa(ident)
            if ghsa in first_line:
                problems.append(f"{ghsa} already ignored on line {first_line[ghsa]}")
        else:
            problems.append(f"'{ident}' is not a GHSA id (GHSA-xxxx-xxxx-xxxx)")

        expires = None
        shape = EXPIRES.match(expiry)
        if not shape:
            problems.append(f"'{expiry}' is not expires=YYYY-MM-DD")
        else:
            try:
                expires = datetime.date(*(int(group) for group in shape.groups()))
            except ValueError:
                problems.append(f"'{expiry}' is not a real calendar date")
        if expires is not None:
            days = (expires - today).days
            if days <= 0:
                problems.append(
                    f"expired: {expires.isoformat()} is "
                    + ("today" if days == 0 else f"{-days} day(s) ago")
                    + " -- re-review the ignore, then set a new expiry or delete the line"
                )
            elif days > MAX_IGNORE_DAYS:
                problems.append(
                    f"{expires.isoformat()} is {days} days away; the maximum is "
                    f"{MAX_IGNORE_DAYS} (latest allowed today: "
                    f"{(today + datetime.timedelta(days=MAX_IGNORE_DAYS)).isoformat()})"
                )

        if not reason:
            problems.append("the reason is empty; say why there is no fix and who depends on it")

        if problems:
            errors.extend(f"{where}: {problem}" for problem in problems)
            continue
        first_line[ghsa] = number
        entries.append(
            {
                "ghsa": ghsa,
                "expires": expires,
                "days_left": (expires - today).days,
                "reason": reason,
                "line": number,
            }
        )
    return entries, errors


class Unmappable(Exception):
    """The audit document cannot be reliably mapped to advisory ids."""


def ghsa_in(*values):
    for value in values:
        if isinstance(value, str):
            match = GHSA_ID.search(value)
            if match:
                return canonical_ghsa(match.group(0))
    return None


def severity_of(value):
    return SEVERITY_ALIASES.get(str(value or "info").lower(), "info")


def advisory_units(doc, pm):
    """[(ghsa or None, severity)], one per advisory, for the managers whose
    gate unit IS the advisory: pnpm, yarn (berry or classic) and bun.

    Shapes, all recorded from the real tools:
      pnpm   {"advisories": {"<id>": {"github_advisory_id", "severity", "url"}}}
      yarn   berry: one NDJSON record per advisory,
             {"value": pkg, "children": {"URL", "Severity", ...}}
      bun    {"<pkg>": [{"url", "severity", ...}]}
    """
    units = []
    if pm in {"pnpm", "yarn"} and isinstance(doc, dict) and isinstance(doc.get("advisories"), dict):
        for advisory in doc["advisories"].values():
            if not isinstance(advisory, dict):
                raise Unmappable("an entry of `advisories` is not an object")
            # pnpm counts one per FINDING (a version of the package that is
            # vulnerable), not one per advisory: Sendly main has two moderate
            # @vitest/mocker advisories with two findings each, and pnpm reports
            # 7 moderates for 5 advisories. A document with no `findings` list
            # counts once; the parity check in apply_ignores catches the rest.
            findings = advisory.get("findings")
            copies = len(findings) if isinstance(findings, list) and findings else 1
            unit = (
                ghsa_in(advisory.get("github_advisory_id"), advisory.get("url")),
                severity_of(advisory.get("severity")),
            )
            units.extend([unit] * copies)
        return units
    if pm == "pnpm":
        raise Unmappable("the pnpm audit JSON has no `advisories` object")
    if pm == "yarn":
        if not isinstance(doc, dict):
            raise Unmappable("the yarn audit JSON is not an object")
        if isinstance(doc.get("lines"), list):
            records = doc["lines"]
        elif isinstance(doc.get("children"), dict):
            records = [doc]  # a single advisory parses as one object, not as NDJSON
        else:
            raise Unmappable("the yarn audit JSON is neither berry NDJSON nor an `advisories` object")
        for record in records:
            children = record.get("children") if isinstance(record, dict) else None
            if not isinstance(children, dict) or "Severity" not in children:
                raise Unmappable("a yarn audit record has no `children.Severity`")
            units.append((ghsa_in(children.get("URL")), severity_of(children.get("Severity"))))
        return units
    if pm == "bun":
        if not isinstance(doc, dict):
            raise Unmappable("the bun audit JSON is not an object")
        for package, advisories in doc.items():
            if not isinstance(advisories, list) or not all(isinstance(a, dict) for a in advisories):
                raise Unmappable(f"bun audit entry `{package}` is not a list of advisories")
            for advisory in advisories:
                units.append((ghsa_in(advisory.get("url")), severity_of(advisory.get("severity"))))
        return units
    raise Unmappable(f"no GHSA mapping for package manager '{pm}'")


def recount_npm(doc, ignored):
    """Per-package severity counts for `npm audit --json`, minus `ignored`.

    npm's gate unit is the vulnerable PACKAGE, not the advisory: its severity is
    the worst advisory in `via`, and a package whose `via` names another package
    inherits that package's severity (measured: `micromatch` carries its own
    moderate advisory and the string `braces`, and npm reports it as high).
    Ignoring an advisory therefore has to flow through those inherited edges --
    removing `braces`'s advisory drops `micromatch` back to its own moderate one,
    and removes it entirely if it had none. Solved as a fixpoint so a cycle in
    `via` cannot loop.
    """
    vulns = doc.get("vulnerabilities") if isinstance(doc, dict) else None
    if not isinstance(vulns, dict):
        raise Unmappable("the npm audit JSON has no `vulnerabilities` object (npm >= 7 expected)")
    seen = set()
    best = {}
    inherits = {}

    def worse(a, b):
        if a is None:
            return b
        if b is None:
            return a
        return a if SEVERITY_RANK[a] <= SEVERITY_RANK[b] else b

    for name, entry in vulns.items():
        if not isinstance(entry, dict) or not isinstance(entry.get("via"), list):
            raise Unmappable(f"npm audit entry `{name}` has no `via` list")
        own = None
        edges = []
        for via in entry["via"]:
            if isinstance(via, dict):
                ghsa = ghsa_in(via.get("url"))
                if ghsa:
                    seen.add(ghsa)
                if ghsa in ignored:
                    continue
                own = worse(own, severity_of(via.get("severity")))
            elif isinstance(via, str):
                edges.append(via)
            else:
                raise Unmappable(f"npm audit entry `{name}` has a `via` item that is neither object nor string")
        best[name] = own
        inherits[name] = edges
    changed = True
    while changed:
        changed = False
        for name, edges in inherits.items():
            merged = best[name]
            for other in edges:
                merged = worse(merged, best.get(other))
            if merged != best[name]:
                best[name] = merged
                changed = True
    counts = {name: 0 for name in SEVERITIES}
    for severity in best.values():
        if severity is not None:
            counts[severity] += 1
    return counts, seen


def recount(doc, pm, ignored):
    """(severity counts, every GHSA seen) with `ignored` advisories removed."""
    if pm == "npm":
        return recount_npm(doc, ignored)
    counts = {name: 0 for name in SEVERITIES}
    seen = set()
    for ghsa, severity in advisory_units(doc, pm):
        if ghsa:
            seen.add(ghsa)
        if ghsa in ignored:
            continue
        counts[severity] += 1
    return counts, seen


def apply_ignores(doc, pm, ignores):
    """(native counts, counts after ignores, set of ignored ids that appeared).

    Raises Unmappable rather than guessing. The guard that matters most is the
    parity check: with NOTHING ignored, the recount must equal the package
    manager's own totals. If it does not -- an unfamiliar shape, a manager that
    already muted something, a major version that changed what it counts -- any
    number produced after removing ids would be built on a count this script
    does not understand, and the honest result is a failure.
    """
    native, _ = count_audit(doc)
    baseline, _ = recount(doc, pm, set())
    if baseline != native:
        raise Unmappable(
            f"recounting the {pm} advisory list gives {baseline}, but the audit's own totals "
            f"are {native}. The ignore list is not applied to a document this script cannot "
            "reproduce (a `pnpm.auditConfig.ignoreGhsas` mute or an unfamiliar format both "
            "cause this)."
        )
    wanted = {entry["ghsa"] for entry in ignores}
    after, seen = recount(doc, pm, wanted)
    return native, after, wanted & seen


def render_ignores(ignores, appeared):
    """The "Active ignores" table: printed on every run that is given ignores."""
    lines = [
        "### Active ignores",
        "",
        f"{len(ignores)} advisory ignore(s) in effect. Each carries a reason and expires "
        f"within {MAX_IGNORE_DAYS} days; an expired line fails this job until it is re-reviewed.",
        "",
        "| advisory | expires | days left | reason | appeared in this run |",
        "| --- | --- | --- | --- | --- |",
    ]
    for entry in ignores:
        hit = entry["ghsa"] in appeared
        lines.append(
            f"| {entry['ghsa']} | {entry['expires'].isoformat()} | {entry['days_left']} | "
            f"{table_cell(entry['reason'])} | "
            + ("yes" if hit else "**no -- stale ignore, remove it**")
            + " |"
        )
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------


def write_summary(path, text):
    if not path:
        return
    with open(path, "a", encoding="utf-8", newline="") as handle:
        handle.write(text if text.endswith("\n") else text + "\n")


def parse_fail_on(text):
    wanted = {part.strip().lower() for part in (text or "").split(",") if part.strip()}
    unknown = wanted - set(SEVERITIES)
    if unknown:
        raise SystemExit(f"::error::unknown severity in --fail-on: {sorted(unknown)}")
    return wanted


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)

    report = sub.add_parser("report")
    report.add_argument("--input", required=True)
    report.add_argument("--package-manager", default="")
    report.add_argument("--command", default="")
    report.add_argument("--audit-exit", default="0")
    report.add_argument("--fail-on", default="critical,high")
    report.add_argument("--summary", default=os.environ.get("GITHUB_STEP_SUMMARY", ""))
    report.add_argument("--json-out", default="")
    report.add_argument("--ignore-advisories", default="")
    # Unit tests pin the run date; the workflow never passes it (UTC today).
    report.add_argument("--today", default="")

    overrides = sub.add_parser("overrides")
    overrides.add_argument("--root", default=".")
    overrides.add_argument("--fail-on", default="critical,high")
    overrides.add_argument("--summary", default=os.environ.get("GITHUB_STEP_SUMMARY", ""))
    overrides.add_argument("--json-out", default="")
    overrides.add_argument("--offline-advisories", default="")
    overrides.add_argument("--delay", type=float, default=0.2)

    args = parser.parse_args(argv)
    fail_on = parse_fail_on(args.fail_on)

    if args.mode == "report":
        today = (
            datetime.date.fromisoformat(args.today)
            if args.today
            else datetime.datetime.now(datetime.timezone.utc).date()
        )
        # Validated BEFORE the audit document is read: a bad ignore list must
        # fail the job even when the audit itself is clean, or the first typo
        # would be discovered only on the day it mattered.
        ignores, ignore_errors = parse_ignores(args.ignore_advisories, today)
        if ignore_errors:
            write_summary(
                args.summary,
                "## Dependency audit\n\n**The `ignore-advisories` input is invalid, so no "
                "ignore was applied and the job fails.** Format: "
                f"{IGNORE_FORMAT}, expiry at most {MAX_IGNORE_DAYS} days out.\n\n"
                + "\n".join(f"- {table_cell(error)}" for error in ignore_errors)
                + "\n",
            )
            for error in ignore_errors:
                print(f"::error::{annotation(error)}")
            return 1
        raw = open(args.input, encoding="utf-8", errors="replace").read().strip()
        doc = load_audit(raw)
        if doc is None:
            write_summary(
                args.summary,
                "## Dependency audit\n\nThe package manager produced no parseable "
                f"JSON (exit {args.audit_exit}). Treated as a FAILURE: an audit that "
                "cannot be read is not a clean audit.\n",
            )
            print("::error::audit output was not parseable JSON")
            return 1
        counts, source = count_audit(doc)
        native, appeared = None, set()
        if ignores:
            try:
                native, counts, appeared = apply_ignores(doc, args.package_manager, ignores)
            except Unmappable as exc:
                write_summary(
                    args.summary,
                    "## Dependency audit\n\n**`ignore-advisories` was given but cannot be applied "
                    "safely, so the job fails closed** rather than pass on a count it cannot "
                    f"verify.\n\n{table_cell(exc)}\n\n" + render_ignores(ignores, set()),
                )
                print(f"::error::ignore-advisories cannot be applied to this audit: {annotation(exc)}")
                return 1
            source = f"the {args.package_manager} advisory list, minus {len(appeared)} ignored"
        text, failing = render_report(
            counts, source, args.package_manager, args.command, fail_on, args.audit_exit, native
        )
        if ignores:
            text += "\n" + render_ignores(ignores, appeared)
            for entry in ignores:
                if entry["ghsa"] not in appeared:
                    print(
                        f"::warning::{entry['ghsa']} is ignored but did not appear in this "
                        "audit (stale ignore) -- remove the line"
                    )
        write_summary(args.summary, text)
        print(text)
        if args.json_out:
            result = {"counts": counts, "failing": failing}
            if ignores:
                result["native"] = native
                result["ignored"] = [
                    {
                        "ghsa": entry["ghsa"],
                        "expires": entry["expires"].isoformat(),
                        "days_left": entry["days_left"],
                        "reason": entry["reason"],
                        "appeared": entry["ghsa"] in appeared,
                    }
                    for entry in ignores
                ]
            with open(args.json_out, "w", encoding="utf-8", newline="") as handle:
                json.dump(result, handle, indent=2)
        if failing:
            print(f"::error::{failing} vulnerability(ies) at or above the gate severity")
            return 1
        return 0

    client = AdvisoryClient(
        offline_file=args.offline_advisories or None,
        delay=args.delay,
        token=os.environ.get("GITHUB_TOKEN") or None,
    )
    try:
        result = audit_overrides(args.root, client, fail_on)
    except LookupError as exc:
        write_summary(
            args.summary,
            "## Override audit\n\n**The advisory database could not be reached**, so "
            f"this check reports nothing rather than reporting clean.\n\n`{exc}`\n",
        )
        print(f"::error::{exc}")
        return 2
    text = render_overrides(result, fail_on)
    write_summary(args.summary, text)
    print(text)
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8", newline="") as handle:
            json.dump(result, handle, indent=2)
    return 1 if result["failing"] else 0


if __name__ == "__main__":
    sys.exit(main())
