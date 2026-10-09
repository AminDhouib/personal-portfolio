// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const LICENSE = path.join(ROOT, "src/components/game/failover/LICENSE-server-survival.txt");

describe("Server Survival attribution", () => {
  it("NOTICE credits the upstream project, its author and the licence", () => {
    const notice = readFileSync(path.join(ROOT, "NOTICE"), "utf8");
    expect(notice).toContain("pshenok/server-survival");
    expect(notice).toContain("Kostyantyn Pshenychnyy");
    expect(notice).toMatch(/MIT/);
    expect(notice).toContain("7804e5969e28267cd33837e023eb46fa65da72b7");
  });

  it("the licence text ships with the port, copyright line intact", () => {
    expect(existsSync(LICENSE)).toBe(true);
    const text = readFileSync(LICENSE, "utf8");
    expect(text).toContain("MIT License");
    expect(text).toContain("Copyright (c) 2025 Kostyantyn Pshenychnyy");
    expect(text).toContain(
      "The above copyright notice and this permission notice shall be included",
    );
  });
});
