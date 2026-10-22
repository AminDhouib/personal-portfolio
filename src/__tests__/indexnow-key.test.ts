import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// IndexNow verifies ownership by fetching /<key>.txt and comparing the body to the key, so the
// file name and its exact content must match (no trailing newline).
describe("IndexNow key file", () => {
  const publicDir = join(process.cwd(), "public");
  const keyFiles = readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));

  it("hosts exactly one 32-char lowercase hex key file", () => {
    expect(keyFiles).toHaveLength(1);
  });

  it("has a body equal to its own file name", () => {
    for (const file of keyFiles) {
      expect(readFileSync(join(publicDir, file), "utf8")).toBe(file.replace(/\.txt$/, ""));
    }
  });
});
