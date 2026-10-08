// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every HTML file under public/ is served as is, outside the app's own analytics
// wiring, so a tag here reports visitors to someone else's property.
const PUBLIC_DIR = join(process.cwd(), "public");
const BANNED = [/googletagmanager\.com/i, /google-analytics\.com/i, /gtag\(/, /G-YCWZ8ZDCH2/];

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.toLowerCase().endsWith(".html") ? [path] : [];
  });
}

describe("public/ ships no third-party analytics", () => {
  it("no served HTML file loads a Google tag", () => {
    const offenders = htmlFiles(PUBLIC_DIR).filter((path) => {
      const text = readFileSync(path, "utf8");
      return BANNED.some((pattern) => pattern.test(text));
    });
    expect(offenders.map((path) => path.slice(PUBLIC_DIR.length))).toEqual([]);
  });
});
