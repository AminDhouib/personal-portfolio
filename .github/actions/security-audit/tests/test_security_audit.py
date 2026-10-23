# Vendored from DevinoSolutions/.github, path actions/security-audit/tests/test_security_audit.py, commit 27fb535cbd0228d069c0d36e6b888a8bcc85e726.
# Vendored because this repo is owned by a personal account and cannot call the private org action.
# Unmodified. To resync, diff against a newer commit of the source path (see DESIGN.md).
"""Unit tests for the security-audit action.

The override check is a parser wrapped around one API call, and every way it
can go wrong is a FALSE GREEN: a key it mis-splits, a value whose floor it
reads too high, a directory it walks that is not the repository's, a lookup
failure it treats as "no findings". Each of those has a test here, because a
security check that reports clean when it did not actually check is worse than
no check at all.

`test_path_separator_is_not_a_naive_split` is a regression test for a real bug
found while building this: `key.split('>')[-1]` turns the notifly-shaped key
`js-yaml@>=4.0.0 <4.3.1` into the package name `=4.0.0 <4.3.1`, which matches
no advisory, so the entry reports CLEAN. That is exactly the shape the check
exists to catch.

The advisory payloads in `fixtures/security-audit-stale/advisories.json` are
recorded from the live API and committed, so these assertions do not change
meaning the day the next sharp advisory lands.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

import security_audit as sa

REPO_ROOT = Path(__file__).resolve().parents[3]
STALE = REPO_ROOT / "fixtures" / "security-audit-stale"
CLEAN = REPO_ROOT / "fixtures" / "security-audit"


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def offline_client(mapping=None):
    client = sa.AdvisoryClient(delay=0)
    client.offline = {} if mapping is None else mapping
    return client


# --------------------------------------------------------------------------
# key and value parsing
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "key,expected",
    [
        ("sharp", ("sharp", None)),
        ("sharp@<0.35.0", ("sharp", "<0.35.0")),
        ("nextjs>next", ("next", None)),
        ("@babel/core@^7.0.0", ("@babel/core", "^7.0.0")),
        ("@scoped/a>@scoped/b@>=1.0.0", ("@scoped/b", ">=1.0.0")),
    ],
)
def test_split_key(key, expected):
    assert sa.split_key(key) == expected


def test_path_separator_is_not_a_naive_split():
    """`>=` inside a selector must not be read as a dependency-path separator."""
    assert sa.split_key("js-yaml@>=4.0.0 <4.3.1") == ("js-yaml", ">=4.0.0 <4.3.1")
    assert sa.split_key("next@>16.0.0") == ("next", ">16.0.0")


@pytest.mark.parametrize(
    "value,expected",
    [
        ("^0.35.3", ("0.35.3", "range")),
        ("~0.35.3", ("0.35.3", "range")),
        (">=0.35.0 <0.36.0", ("0.35.0", "range")),
        ("0.35.3", ("0.35.3", "exact")),
        ("v1.2.3", ("1.2.3", "exact")),
        ("^4.3.2 || ^3.15.2", ("3.15.2", "range")),
        ("<2.0.0", (None, "unbounded")),
        ("*", (None, "unbounded")),
        ("", (None, "unbounded")),
        ("$thing", (None, "not-a-version")),
        ("workspace:*", (None, "not-a-version")),
        ("npm:other@1.0.0", (None, "not-a-version")),
    ],
)
def test_lowest_admitted(value, expected):
    assert sa.lowest_admitted(value) == expected


def test_lowest_admitted_ignores_upper_bounds():
    """A range's UPPER bound is not what the resolution can fall back to."""
    assert sa.lowest_admitted(">=1.2.3 <9.9.9")[0] == "1.2.3"


def test_nested_override_is_flattened():
    assert sa.flatten_overrides({"a": {"b": "1.0.0"}}) == [("a>b", "1.0.0")]
    assert sa.flatten_overrides({"a": {".": "1.0.0", "b": "2.0.0"}}) == [
        ("a", "1.0.0"),
        ("a>b", "2.0.0"),
    ]


# --------------------------------------------------------------------------
# advisory ranges
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text,version,expected",
    [
        ("< 0.35.4", "0.35.3", True),
        ("< 0.35.4", "0.35.4", False),
        (">= 4.0.0, < 4.3.2", "4.3.1", True),
        (">= 4.0.0, < 4.3.2", "3.15.1", False),
        (">= 3.0.0, < 3.15.2", "3.15.1", True),
        ("<= 2.0.1", "1.1.9", True),
        ("= 1.2.3", "1.2.3", True),
        ("> 1.0.0", "1.0.0", False),
        ("something unparseable", "1.0.0", None),
        (None, "1.0.0", None),
    ],
)
def test_range_contains(text, version, expected):
    assert sa.range_contains(text, version) is expected


def test_patched_version_comes_from_the_range_that_contains_the_floor():
    """One advisory, several release lines. A 3.x pin must not be told 4.3.2.

    GHSA-2883 covers js-yaml `>= 3.0.0, < 3.15.2` (patched 3.15.2) AND
    `>= 4.0.0, < 4.3.2` (patched 4.3.2). Taking the maximum across both told
    the holder of notifly's `js-yaml@<3.15.1: ^3.15.1` to go to 4.3.2 -- a
    major bump they do not need, presented as fact. Found on the real notifly
    default branch, not in a fixture.
    """
    vulns = [
        {"ghsa": "GHSA-2883", "severity": "high", "range": ">= 4.0.0, < 4.3.2", "patched": "4.3.2"},
        {"ghsa": "GHSA-2883", "severity": "high", "range": ">= 3.0.0, < 3.15.2", "patched": "3.15.2"},
    ]
    assert [v["patched"] for v in sa.relevant_vulns(vulns, "3.15.1")] == ["3.15.2"]
    assert [v["patched"] for v in sa.relevant_vulns(vulns, "4.3.1")] == ["4.3.2"]


def test_unparseable_ranges_are_kept_rather_than_dropped():
    """Dropping a finding because a range did not parse would be a false green."""
    vulns = [{"ghsa": "G", "severity": "high", "range": "weird", "patched": "9.9.9"}]
    assert sa.relevant_vulns(vulns, "1.0.0") == vulns


def test_an_advisory_with_no_fix_renders_as_such():
    """`ip`'s GHSA-2p57-rm9w-gvfp carries no first_patched_version at all."""
    result = {
        "entries": 1,
        "failing": 1,
        "requests": 1,
        "unresolved": [],
        "findings": [
            {
                "kind": "stale",
                "file": "package.json",
                "table": "overrides",
                "key": "ip@<1.1.9",
                "package": "ip",
                "value": "^1.1.9",
                "floor": "1.1.9",
                "shape": "range",
                "worst": "high",
                "patched": None,
                "vulns": [
                    {
                        "ghsa": "GHSA-2p57-rm9w-gvfp",
                        "severity": "high",
                        "range": "<= 2.0.1",
                        "patched": None,
                    }
                ],
            }
        ],
    }
    text = sa.render_overrides(result, {"critical", "high"})
    assert "no patched release" in text
    assert "None" not in text


# --------------------------------------------------------------------------
# discovery
# --------------------------------------------------------------------------


def test_node_modules_is_never_walked(tmp_path):
    write(tmp_path / "package.json", json.dumps({"overrides": {"a": "1.0.0"}}))
    write(
        tmp_path / "node_modules" / "dep" / "package.json",
        json.dumps({"overrides": {"vendored": "0.0.1"}}),
    )
    keys = {key for _, _, key, _ in sa.collect_entries(str(tmp_path))}
    assert keys == {"a"}


def test_deep_paths_are_scanned(tmp_path):
    """The pass-1 scanner filtered to root + apps/* + packages/* and missed two."""
    write(
        tmp_path / "example-apps" / "credential-sync" / "package.json",
        json.dumps({"overrides": {"next": "15.5.21"}}),
    )
    files = {rel for rel, _, _, _ in sa.collect_entries(str(tmp_path))}
    assert files == {"example-apps/credential-sync/package.json"}


def test_all_three_table_names_are_read(tmp_path):
    write(
        tmp_path / "package.json",
        json.dumps(
            {
                "overrides": {"a": "1.0.0"},
                "resolutions": {"b": "2.0.0"},
                "pnpm": {"overrides": {"c": "3.0.0"}},
            }
        ),
    )
    tables = {table for _, table, _, _ in sa.collect_entries(str(tmp_path))}
    assert tables == {"overrides", "resolutions", "pnpm.overrides"}


def test_unreadable_manifest_is_a_finding_not_a_crash(tmp_path):
    write(tmp_path / "package.json", "{ this is not json")
    result = sa.audit_overrides(str(tmp_path), offline_client(), {"critical", "high"})
    assert [f["kind"] for f in result["findings"]] == ["unreadable"]
    assert result["failing"] == 1


# --------------------------------------------------------------------------
# the committed stale fixture
# --------------------------------------------------------------------------


def test_stale_fixture_splits_exactly_as_recorded():
    advisories = json.loads((STALE / "advisories.json").read_text(encoding="utf-8"))
    result = sa.audit_overrides(
        str(STALE), offline_client(advisories), {"critical", "high"}
    )
    kinds = [f["kind"] for f in result["findings"]]
    assert result["entries"] == 12
    assert kinds.count("stale") == 7
    assert kinds.count("ceiling") == 1
    assert len(result["unresolved"]) == 3
    assert result["failing"] == 7

    stale = {f["key"]: f for f in result["findings"] if f["kind"] == "stale"}
    # notifly's exact pin at a version with two criticals. 15.5.24, NOT 16.3.3:
    # the advisory's `>= 10.0.0, < 15.5.24` range is the one containing 15.5.21,
    # and 15.5.24 is the only patched release below 16. Telling the holder of a
    # 15.x pin to go to 16.3.3 would be a major bump presented as fact.
    assert stale["nextjs>next"]["worst"] == "critical"
    assert stale["nextjs>next"]["patched"] == "15.5.24"
    # caramel's unconditional pin, one patch below the floor.
    assert stale["sharp"]["floor"] == "0.35.3"
    assert stale["sharp"]["patched"] == "0.35.4"
    # The key the naive `>` split silently reported clean.
    assert stale["js-yaml@>=4.0.0 <4.3.1"]["floor"] == "4.3.1"


def test_clean_fixture_has_no_findings_at_all():
    """The fixture the self-test dispatch calls for real must itself be clean.

    This is also the regression test for the sibling layout. The stale tree was
    a `./stale/` subdirectory for one commit, and because the check walks
    everything below its root, the end-to-end job would have scanned both and
    failed on seven findings it is supposed to know nothing about. A green
    fixture that can never be green is worse than no fixture.
    """
    result = sa.audit_overrides(
        str(CLEAN), offline_client({"sharp@0.35.4": []}), {"critical", "high"}
    )
    assert result["entries"] == 1
    assert result["findings"] == []
    assert result["unresolved"] == []


def test_summary_names_the_advisory_and_the_patched_version():
    advisories = json.loads((STALE / "advisories.json").read_text(encoding="utf-8"))
    result = sa.audit_overrides(
        str(STALE), offline_client(advisories), {"critical", "high"}
    )
    text = sa.render_overrides(result, {"critical", "high"})
    assert "GHSA-rgj7-g3m4-5g8c" in text
    assert "0.35.4" in text
    assert "permanent ceiling" in text


# --------------------------------------------------------------------------
# failing closed
# --------------------------------------------------------------------------


def test_missing_offline_entry_raises_rather_than_reporting_clean(tmp_path):
    """A recorded fixture that forgot a lookup must never read as 'no findings'."""
    write(tmp_path / "package.json", json.dumps({"overrides": {"sharp": "0.35.3"}}))
    with pytest.raises(LookupError):
        sa.audit_overrides(str(tmp_path), offline_client({}), {"critical", "high"})


def test_unreachable_advisory_database_exits_nonzero(tmp_path, monkeypatch):
    write(tmp_path / "package.json", json.dumps({"overrides": {"sharp": "0.35.3"}}))
    summary = tmp_path / "summary.md"

    def boom(self, name, version):
        raise LookupError("advisory API unreachable")

    monkeypatch.setattr(sa.AdvisoryClient, "fetch", boom)
    code = sa.main(
        [
            "overrides",
            "--root",
            str(tmp_path),
            "--summary",
            str(summary),
        ]
    )
    assert code == 2
    assert "could not be reached" in summary.read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# the package-manager audit report
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "doc,expected,source",
    [
        (
            {"metadata": {"vulnerabilities": {"info": 0, "low": 7, "moderate": 22, "high": 3, "critical": 2, "total": 34}}},
            {"critical": 2, "high": 3, "moderate": 22, "low": 7, "info": 0},
            "metadata.vulnerabilities",
        ),
        (
            {"actions": [], "advisories": {"a": {"severity": "moderate"}}, "metadata": {"vulnerabilities": {"moderate": 1}}},
            {"critical": 0, "high": 0, "moderate": 1, "low": 0, "info": 0},
            "metadata.vulnerabilities",
        ),
        (
            {"next": [{"severity": "critical"}], "sharp": [{"severity": "high"}], "lodash": [{"severity": "low"}]},
            {"critical": 1, "high": 1, "moderate": 0, "low": 1, "info": 0},
            "severity fields",
        ),
    ],
    ids=["npm-pnpm", "yarn-berry", "bun"],
)
def test_count_audit(doc, expected, source):
    counts, got_source = sa.count_audit(doc)
    assert counts == expected
    assert got_source == source


def test_metadata_total_key_is_not_counted_as_a_severity():
    counts, _ = sa.count_audit({"metadata": {"vulnerabilities": {"high": 1, "total": 1}}})
    assert sum(counts.values()) == 1


def test_report_fails_on_unparseable_output(tmp_path):
    audit = tmp_path / "audit.json"
    summary = tmp_path / "summary.md"
    write(audit, "ELIFECYCLE  Command failed with exit code 1.\n")
    code = sa.main(["report", "--input", str(audit), "--summary", str(summary)])
    assert code == 1
    assert "not a clean audit" in summary.read_text(encoding="utf-8")


def test_report_passes_when_everything_is_below_the_gate(tmp_path):
    audit = tmp_path / "audit.json"
    summary = tmp_path / "summary.md"
    write(audit, json.dumps({"metadata": {"vulnerabilities": {"moderate": 9, "low": 3}}}))
    assert sa.main(["report", "--input", str(audit), "--summary", str(summary)]) == 0


def test_fail_on_is_validated():
    with pytest.raises(SystemExit):
        sa.parse_fail_on("critical,catastrophic")


# --------------------------------------------------------------------------
# the ignore list
#
# `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm) has no patched release, so a repository
# that needs it cannot go green without an ignore. The fixtures are the REAL
# `audit --json` output of pnpm 9.15.9, npm 11, yarn 4.18 and bun for a tree
# holding braces 3.0.2 and minimist 0.0.8 (and, for the *-transitive ones,
# micromatch 4.0.5), committed so these tests do not move when the advisory
# database does. Every test here guards a way an ignore could pass silently.
# --------------------------------------------------------------------------

IGNORE_FIXTURES = REPO_ROOT / "fixtures" / "security-audit-ignore"
TODAY = sa.datetime.date(2026, 10, 23)
BRACES = "GHSA-vfj7-8cjw-p6xm"
BRACES_OLD = "GHSA-grv7-fg5c-xmjg"  # braces <3.0.3, fixed in 3.0.3
MINIMIST_CRITICAL = "GHSA-xvch-5gv4-984h"
MINIMIST_MODERATE = "GHSA-vh95-rmgr-6w4m"
NOT_IN_ANY_FIXTURE = "GHSA-2883-wxrq-r3qq"


def ignore_line(ghsa=BRACES, expires="2026-11-20", reason="no upstream fix; dependents: x"):
    return f"{ghsa} | expires={expires} | {reason}"


def fixture(name):
    return sa.load_audit((IGNORE_FIXTURES / name).read_text(encoding="utf-8").strip())


def report_args(audit, pm, ignore_text, summary):
    return [
        "report",
        "--input",
        str(audit),
        "--package-manager",
        pm,
        "--command",
        f"{pm} audit --json",
        "--ignore-advisories",
        ignore_text,
        "--today",
        TODAY.isoformat(),
        "--summary",
        str(summary),
    ]


def run_report(tmp_path, audit_name, pm, ignore_text):
    summary = tmp_path / "summary.md"
    out = tmp_path / "out.json"
    audit = tmp_path / "audit.json"
    audit.write_bytes((IGNORE_FIXTURES / audit_name).read_bytes())
    code = sa.main(report_args(audit, pm, ignore_text, summary) + ["--json-out", str(out)])
    text = summary.read_text(encoding="utf-8") if summary.exists() else ""
    return code, text, (json.loads(out.read_text(encoding="utf-8")) if out.exists() else None)


def run_report_doc(tmp_path, doc, pm, ignore_text):
    audit = tmp_path / "audit-doc.json"
    write(audit, json.dumps(doc))
    summary = tmp_path / "summary-doc.md"
    code = sa.main(report_args(audit, pm, ignore_text, summary))
    return code, summary.read_text(encoding="utf-8")


def test_parse_accepts_comments_blanks_and_a_pipe_in_the_reason():
    text = f"\n# braces has no fix\n   \n{ignore_line(reason='no fix | see #1')}\n"
    entries, errors = sa.parse_ignores(text, TODAY)
    assert errors == []
    assert [(e["ghsa"], e["days_left"], e["reason"]) for e in entries] == [
        (BRACES, 28, "no fix | see #1")
    ]


def test_parse_normalises_the_id_case():
    entries, errors = sa.parse_ignores(ignore_line(ghsa="ghsa" + BRACES[4:].upper()), TODAY)
    assert errors == [] and entries[0]["ghsa"] == BRACES


@pytest.mark.parametrize(
    "line,needle",
    [
        ("GHSA-vfj7-8cjw-p6xm", "expected"),
        ("GHSA-vfj7-8cjw-p6xm | expires=2026-11-20", "expected"),
        ("CVE-2026-93687 | expires=2026-11-20 | no fix", "not a GHSA id"),
        ("GHSA-aaaa-bbbb-cccc | expires=2026-11-20 | no fix", "not a GHSA id"),
        ("GHSA-vfj7-8cjw-p6xm | expires=2026-11-20 |   ", "reason is empty"),
        ("GHSA-vfj7-8cjw-p6xm | expires=2026-11-20 | ", "reason is empty"),
        ("GHSA-vfj7-8cjw-p6xm | expiry=2026-11-20 | no fix", "expires=YYYY-MM-DD"),
        ("GHSA-vfj7-8cjw-p6xm | expires=20261120 | no fix", "expires=YYYY-MM-DD"),
        ("GHSA-vfj7-8cjw-p6xm | expires=2026-11-2 | no fix", "expires=YYYY-MM-DD"),
        ("GHSA-vfj7-8cjw-p6xm | expires=2026-02-30 | no fix", "not a real calendar date"),
        ("GHSA-vfj7-8cjw-p6xm | expires=2026-13-01 | no fix", "not a real calendar date"),
    ],
)
def test_malformed_lines_fail_and_name_the_line(line, needle):
    entries, errors = sa.parse_ignores("# header\n" + line, TODAY)
    assert entries == []
    assert len(errors) >= 1
    assert all(error.startswith("ignore-advisories line 2:") for error in errors)
    assert any(needle in error for error in errors)


def test_expiry_boundaries():
    def errs(expires):
        return sa.parse_ignores(ignore_line(expires=expires), TODAY)[1]

    assert errs("2026-10-24") == []  # tomorrow
    assert errs("2026-11-22") == []  # today + 30: the last allowed day
    over = errs("2026-11-23")  # today + 31
    assert len(over) == 1 and "31 days away" in over[0] and "2026-11-22" in over[0]
    today = errs("2026-10-23")
    assert len(today) == 1 and "expired" in today[0] and "today" in today[0]
    past = errs("2026-10-01")
    assert len(past) == 1 and "expired" in past[0] and "22 day(s) ago" in past[0]


def test_duplicate_ids_are_rejected():
    _, errors = sa.parse_ignores(ignore_line() + "\n" + ignore_line(), TODAY)
    assert len(errors) == 1 and "already ignored on line 1" in errors[0]


def test_every_bad_line_is_reported_not_just_the_first():
    text = "\n".join([ignore_line(), "nonsense", ignore_line(ghsa=BRACES_OLD, expires="2025-01-01")])
    _, errors = sa.parse_ignores(text, TODAY)
    assert [e.split(":")[0] for e in errors] == [
        "ignore-advisories line 2",
        "ignore-advisories line 3",
    ]


def test_a_reason_cannot_start_a_workflow_command():
    assert "\n" not in sa.annotation("x\n::error::forged")
    assert sa.annotation("100%") == "100%25"
    assert "\n" not in sa.table_cell("a\nb | c")


# ---- the gate, per package manager, on the real recorded output ----------


@pytest.mark.parametrize(
    "name,pm",
    [
        ("pnpm.json", "pnpm"),
        ("pnpm-transitive.json", "pnpm"),
        ("npm.json", "npm"),
        ("npm-transitive.json", "npm"),
        ("yarn.json", "yarn"),
        ("bun.json", "bun"),
    ],
)
def test_the_recount_with_nothing_ignored_reproduces_each_managers_own_totals(name, pm):
    doc = fixture(name)
    assert sa.recount(doc, pm, set())[0] == sa.count_audit(doc)[0]


def test_berry_audits_are_no_longer_counted_as_zero():
    # Regression: berry capitalises `Severity`, the walk looked for `severity`,
    # and every yarn audit therefore passed whatever the tree contained.
    counts, source = sa.count_audit(fixture("yarn.json"))
    assert counts == {"critical": 1, "high": 2, "moderate": 0, "low": 0, "info": 0}
    assert source == "severity fields"


def test_without_ignores_a_red_audit_is_still_red(tmp_path):
    code, text, result = run_report(tmp_path, "pnpm.json", "pnpm", "")
    assert code == 1 and result["failing"] == 3
    assert "Active ignores" not in text and "native" not in result


def test_pnpm_ignore_turns_the_single_high_green(tmp_path):
    # The Sendly shape: one high with no fix, everything else below the gate.
    code, text, result = run_report(tmp_path, "pnpm-transitive.json", "pnpm", ignore_line())
    assert code == 0
    assert result["counts"] == {"critical": 0, "high": 0, "moderate": 1, "low": 0, "info": 0}
    assert result["native"]["high"] == 1
    assert result["ignored"][0]["appeared"] is True
    assert "### Active ignores" in text and BRACES in text and "2026-11-20" in text
    assert "| 28 |" in text and "no upstream fix; dependents: x" in text
    assert "before ignores" in text


def test_pnpm_ignore_removes_only_the_ignored_advisory(tmp_path):
    code, _, result = run_report(tmp_path, "pnpm.json", "pnpm", ignore_line())
    assert code == 1  # braces' older advisory (high) and minimist (critical) remain
    assert result["counts"]["high"] == 1 and result["counts"]["critical"] == 1
    everything = "\n".join(
        [ignore_line(), ignore_line(BRACES_OLD), ignore_line(MINIMIST_CRITICAL)]
    )
    code, _, result = run_report(tmp_path, "pnpm.json", "pnpm", everything)
    assert code == 0 and result["counts"]["critical"] == 0 and result["counts"]["high"] == 0


def test_npm_ignore_flows_through_inherited_severity(tmp_path):
    # micromatch has its own moderate advisory and inherits `high` from braces.
    code, _, result = run_report(tmp_path, "npm-transitive.json", "npm", "")
    assert code == 1 and result is not None and "native" not in result
    assert result["counts"]["high"] == 2
    code, _, result = run_report(tmp_path, "npm-transitive.json", "npm", ignore_line())
    assert code == 0
    assert result["counts"] == {"critical": 0, "high": 0, "moderate": 1, "low": 0, "info": 0}


def test_npm_ignore_unit_is_the_package_like_npms_own_total(tmp_path):
    code, _, result = run_report(tmp_path, "npm.json", "npm", ignore_line())
    assert code == 1  # braces still has the older advisory; minimist is critical
    assert result["native"] == {"critical": 1, "high": 1, "moderate": 0, "low": 0, "info": 0}
    assert result["counts"] == result["native"]


def test_npm_via_cycles_terminate():
    ghsa_url = f"https://github.com/advisories/{BRACES}"
    doc = {
        "vulnerabilities": {
            "a": {"via": ["b"], "severity": "high"},
            "b": {"via": ["a", {"url": ghsa_url, "severity": "high"}], "severity": "high"},
        },
        "metadata": {"vulnerabilities": {"high": 2}},
    }
    assert sa.recount(doc, "npm", set())[0]["high"] == 2
    assert sa.recount(doc, "npm", {BRACES})[0]["high"] == 0


def test_yarn_ignore_on_ndjson(tmp_path):
    code, _, result = run_report(tmp_path, "yarn.json", "yarn", ignore_line())
    assert code == 1 and result["counts"]["high"] == 1 and result["counts"]["critical"] == 1


def test_yarn_single_advisory_parses_as_one_object(tmp_path):
    only = (IGNORE_FIXTURES / "yarn.json").read_text(encoding="utf-8").splitlines()[1]
    audit = tmp_path / "audit.json"
    write(audit, only + "\n")
    summary = tmp_path / "s.md"
    assert sa.main(report_args(audit, "yarn", ignore_line(), summary)) == 0
    assert sa.main(report_args(audit, "yarn", "", summary)) == 1


def test_bun_ignore(tmp_path):
    code, _, result = run_report(tmp_path, "bun.json", "bun", ignore_line())
    assert code == 1 and result["counts"]["high"] == 1 and result["counts"]["critical"] == 1
    everything = "\n".join(
        [ignore_line(g) for g in (BRACES, BRACES_OLD, MINIMIST_CRITICAL, MINIMIST_MODERATE)]
    )
    code, _, result = run_report(tmp_path, "bun.json", "bun", everything)
    assert code == 0 and sum(result["counts"].values()) == 0


def test_a_stale_ignore_warns_and_does_not_fail(tmp_path, capsys):
    both = "\n".join([ignore_line(), ignore_line(NOT_IN_ANY_FIXTURE)])
    code, text, result = run_report(tmp_path, "pnpm-transitive.json", "pnpm", both)
    assert code == 0
    assert [e["appeared"] for e in result["ignored"]] == [True, False]
    assert "stale ignore" in text
    assert f"::warning::{NOT_IN_ANY_FIXTURE}" in capsys.readouterr().out


# ---- fail closed ---------------------------------------------------------


def test_an_expired_ignore_fails_even_when_the_audit_is_clean(tmp_path):
    clean = {"advisories": {}, "metadata": {"vulnerabilities": {}}}
    code, text = run_report_doc(tmp_path, clean, "pnpm", ignore_line(expires="2026-10-23"))
    assert code == 1
    assert "invalid" in text and "expired" in text


def test_an_ignore_over_30_days_fails_even_when_the_audit_is_clean(tmp_path):
    clean = {"advisories": {}, "metadata": {"vulnerabilities": {}}}
    code, text = run_report_doc(tmp_path, clean, "pnpm", ignore_line(expires="2026-11-23"))
    assert code == 1 and "31 days away" in text


def test_invalid_ignores_print_an_error_per_problem(tmp_path, capsys):
    code, _, _ = run_report(tmp_path, "pnpm.json", "pnpm", "garbage\n" + ignore_line(expires="2027-01-01"))
    assert code == 1
    out = capsys.readouterr().out
    assert "::error::ignore-advisories line 1:" in out
    assert "::error::ignore-advisories line 2:" in out


def test_pnpm_muted_by_the_package_manager_fails_closed(tmp_path):
    # `pnpm.auditConfig.ignoreGhsas` removes the advisory but not the totals.
    doc = fixture("pnpm.json")
    doc["advisories"].pop("1240992")
    code, text = run_report_doc(tmp_path, doc, "pnpm", ignore_line())
    assert code == 1
    assert "fails closed" in text and "ignoreGhsas" in text


@pytest.mark.parametrize(
    "doc,pm",
    [
        ({"metadata": {"vulnerabilities": {"high": 1}}}, "pnpm"),  # no advisories list
        ({"metadata": {"vulnerabilities": {"high": 1}}}, "npm"),  # npm 6 shape
        ({"metadata": {"vulnerabilities": {"high": 1}}}, "bun"),
        ({"foo": "bar"}, "yarn"),
        ({"advisories": {}, "metadata": {"vulnerabilities": {}}}, "cargo"),
        ({"advisories": {}, "metadata": {"vulnerabilities": {}}}, ""),
    ],
)
def test_unmappable_documents_fail_closed(tmp_path, doc, pm):
    code, text = run_report_doc(tmp_path, doc, pm, ignore_line())
    assert code == 1
    assert "cannot be applied safely" in text


def test_the_override_audit_never_sees_the_list():
    # CLI-level guarantee: `overrides` has no such argument, so a list cannot reach it.
    with pytest.raises(SystemExit):
        sa.main(["overrides", "--root", ".", "--ignore-advisories", ignore_line()])


# The shape of Sendly's apps/zapier job: nine highs, ONE advisory. Only `braces`
# holds the advisory object; the other eight are high because their `via` is a
# string naming another vulnerable package (micromatch -> fast-glob -> globby ->
# mem-fs-editor -> yeoman-generator -> zapier-platform-cli, and a second path
# through which-package-manager and yeoman-environment). The fixture is
# synthetic -- built from the recorded npm shape -- because it exists to pin the
# chain arithmetic, not the registry.
CHAIN = "npm-via-chain.json"


def test_npm_chain_fixture_is_nine_highs_from_one_advisory():
    doc = fixture(CHAIN)
    assert sa.count_audit(doc)[0]["high"] == 9
    assert sa.recount(doc, "npm", set())[0]["high"] == 9


def test_ignoring_the_one_advisory_clears_the_whole_chain(tmp_path):
    code, text, result = run_report(tmp_path, CHAIN, "npm", ignore_line())
    assert code == 0
    assert sum(result["counts"].values()) == 0 and result["native"]["high"] == 9
    assert "| high | 9 | 0 |" in text


def _chain_with(extra_via_on, extra):
    doc = fixture(CHAIN)
    doc["vulnerabilities"][extra_via_on]["via"].append(extra)
    return doc


def test_one_unignored_advisory_anywhere_in_a_chain_keeps_everything_above_it():
    own = {"url": "https://github.com/advisories/GHSA-952p-6rrq-rcjv", "severity": "moderate", "name": "x"}
    doc = _chain_with("which-package-manager", own)
    counts, _ = sa.recount(doc, "npm", {BRACES})
    # which-package-manager keeps its own moderate; so do yeoman-environment,
    # yeoman-generator and zapier-platform-cli, which reach it. The branch that
    # only reached braces (fast-glob, globby, mem-fs-editor) is gone.
    assert counts == {"critical": 0, "high": 0, "moderate": 4, "low": 0, "info": 0}


def test_a_second_high_advisory_in_the_chain_still_fails(tmp_path):
    own = {"url": "https://github.com/advisories/GHSA-xvch-5gv4-984h", "severity": "high", "name": "x"}
    doc = _chain_with("globby", own)
    code, text = run_report_doc(tmp_path, doc, "npm", ignore_line())
    assert code == 1
    counts, _ = sa.recount(doc, "npm", {BRACES})
    # globby, mem-fs-editor, yeoman-generator, zapier-platform-cli; yeoman-environment reaches only cleared paths.
    assert counts["high"] == 4


# Sendly main, `pnpm audit --json` recorded 2026-10-23 and trimmed to what the
# gate reads. pnpm counts one per FINDING, not per advisory: the two moderate
# @vitest/mocker advisories carry two findings each, so seven advisories report
# {high: 1, moderate: 7, low: 1}. The first version of the recount counted
# advisories and so refused (failed closed on) exactly this document.
MULTI = "pnpm-multi-finding.json"


def test_pnpm_counts_one_per_finding_not_one_per_advisory():
    doc = fixture(MULTI)
    assert sa.count_audit(doc)[0] == {"critical": 0, "high": 1, "moderate": 7, "low": 1, "info": 0}
    assert sa.recount(doc, "pnpm", set())[0] == sa.count_audit(doc)[0]


def test_sendlys_one_high_goes_green_with_the_ignore(tmp_path):
    code, _, result = run_report(tmp_path, MULTI, "pnpm", "")
    assert code == 1 and "native" not in result
    code, text, result = run_report(tmp_path, MULTI, "pnpm", ignore_line())
    assert code == 0
    assert result["native"]["high"] == 1 and result["counts"] == {
        "critical": 0, "high": 0, "moderate": 7, "low": 1, "info": 0
    }
    assert "| high | 1 | 0 |" in text


def test_ignoring_a_multi_finding_advisory_removes_every_finding():
    counts, _ = sa.recount(fixture(MULTI), "pnpm", {"GHSA-qxg6-89mg-rqv8"})
    assert counts["moderate"] == 5


# Two vulnerable versions of one package (braces 3.0.2 direct, braces 1.8.5 under
# micromatch 2.3.11), recorded from the real tools. This is the shape that made
# pnpm report two findings per advisory, so it is the one place the managers'
# gate units could disagree with an advisory-per-unit recount. Measured:
#   pnpm        two findings per advisory           -> counted per finding
#   npm         one package, two advisory objects,
#               two install nodes                   -> counted per package
#   yarn berry  one record per advisory, versions
#               in `Tree Versions`                  -> counted per record
#   bun         one entry per advisory              -> counted per entry
TWO_VERSIONS = [
    ("pnpm", {"critical": 1, "high": 4, "moderate": 2, "low": 0, "info": 0}),
    ("npm", {"critical": 1, "high": 2, "moderate": 0, "low": 0, "info": 0}),
    ("yarn", {"critical": 1, "high": 2, "moderate": 0, "low": 0, "info": 0}),
    ("bun", {"critical": 1, "high": 2, "moderate": 2, "low": 0, "info": 0}),
]


@pytest.mark.parametrize("pm,native", TWO_VERSIONS, ids=[p for p, _ in TWO_VERSIONS])
def test_a_tree_with_two_vulnerable_versions_reproduces_each_managers_totals(pm, native):
    doc = fixture(f"{pm}-two-versions.json")
    assert sa.count_audit(doc)[0] == native
    assert sa.recount(doc, pm, set())[0] == native


@pytest.mark.parametrize("pm,native", TWO_VERSIONS, ids=[p for p, _ in TWO_VERSIONS])
def test_ignoring_both_braces_advisories_and_the_critical_clears_the_gate(tmp_path, pm, native):
    lines = "\n".join(ignore_line(g) for g in (BRACES, BRACES_OLD, MINIMIST_CRITICAL))
    code, _, result = run_report(tmp_path, f"{pm}-two-versions.json", pm, lines)
    assert code == 0
    assert result["counts"]["critical"] == 0 and result["counts"]["high"] == 0


@pytest.mark.parametrize("pm,native", TWO_VERSIONS, ids=[p for p, _ in TWO_VERSIONS])
def test_ignoring_one_braces_advisory_leaves_the_other_failing(tmp_path, pm, native):
    code, _, _ = run_report(tmp_path, f"{pm}-two-versions.json", pm, ignore_line())
    assert code == 1
