// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The sim is replayed by the server and compared bit for bit, so nothing in
// sim/ may read a clock, a global random source, the DOM, storage, or a
// transcendental the engines are allowed to round differently.
const SIM_DIR = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

// Comments may name a banned API (to say why it is banned), code may not.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const BANNED: Array<[string, RegExp]> = [
  ["Math.random", /\bMath\.random\b/],
  ["Date", /\bDate\b/],
  ["performance", /\bperformance\b/],
  ["setTimeout", /\bsetTimeout\b/],
  ["setInterval", /\bsetInterval\b/],
  ["document", /\bdocument\b/],
  ["window", /\bwindow\b/],
  ["three import", /from\s+["']three["']/],
  ["react import", /from\s+["']react["']/],
  ["localStorage", /\blocalStorage\b/],
  [
    "libm transcendental",
    /\bMath\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/,
  ],
  ["exponent operator", /\*\*/],
];

describe("sim purity guard", () => {
  const files = sourceFiles(SIM_DIR);

  for (const [label, pattern] of BANNED) {
    it(`no sim file uses ${label}`, () => {
      const offenders = files.filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))));
      expect(offenders).toEqual([]);
    });
  }

  it("the comment stripper keeps code and drops prose", () => {
    const src = ["const a = 1; // Math.random() is banned", "/* Date.now */ const b = 2;"].join(
      "\n",
    );
    const stripped = stripComments(src);
    expect(stripped).not.toMatch(/Math\.random/);
    expect(stripped).not.toMatch(/Date/);
    expect(stripped).toMatch(/const a = 1;/);
    expect(stripped).toMatch(/const b = 2;/);
  });
});
