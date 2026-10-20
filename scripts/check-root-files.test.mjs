// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each case spawns git and node; that is slow on a loaded machine.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-root-files.mjs");

let tmp;
let main;
let worktree;

// Without the caller's GIT_* variables (a hook sets GIT_DIR / GIT_INDEX_FILE),
// so the throwaway repo can never be confused with the real one.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

function git(cwd, ...args) {
  const res = spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf-8", env: CLEAN_ENV },
  );
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
  return res.stdout;
}

// Windows marks the linked worktree's .git file hidden, which makes an
// in-place write fail with EPERM; replace it instead.
function replaceGitFile(cwd, text) {
  rmSync(path.join(cwd, ".git"), { force: true });
  writeFileSync(path.join(cwd, ".git"), text);
}

function runCheck(cwd) {
  const res = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf-8", env: CLEAN_ENV });
  return { status: res.status, out: res.stdout + res.stderr };
}

// A throwaway repo with one allowlisted tracked file plus a linked worktree of
// it, so the root `.git` of `worktree` is a real "gitdir:" pointer file.
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "root-files-")));
  main = path.join(tmp, "main");
  worktree = path.join(tmp, "wt");
  git(tmp, "init", "-q", "-b", "main", main);
  writeFileSync(path.join(main, "package.json"), "{}\n");
  git(main, "add", "package.json");
  git(main, "commit", "-q", "-m", "init");
  git(main, "worktree", "add", "-q", "-b", "feature", worktree);
});

afterEach(() => {
  // Windows can hold the fresh repo's files briefly (EBUSY / EPERM).
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("check-root-files", () => {
  it("passes in a plain checkout whose .git is a directory", () => {
    expect(runCheck(main).status).toBe(0);
  });

  it("passes in a linked worktree whose .git is its own gitdir pointer", () => {
    const res = runCheck(worktree);
    expect(res.out).toContain("matches the allowlist");
    expect(res.status).toBe(0);
  });

  it("still rejects a stray root file in a worktree", () => {
    writeFileSync(path.join(worktree, "stray.txt"), "x\n");
    const res = runCheck(worktree);
    expect(res.status).toBe(1);
    expect(res.out).toContain("STRAY UNTRACKED ROOT FILE: stray.txt");
  });

  it("rejects a .git pointer at a repository's main git dir", () => {
    replaceGitFile(worktree, `gitdir: ${path.join(main, ".git")}\n`);
    const res = runCheck(worktree);
    expect(res.status).toBe(1);
    expect(res.out).toContain("STRAY UNTRACKED ROOT FILE: .git");
  });
});
