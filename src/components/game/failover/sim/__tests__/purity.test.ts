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
  // Allowlist, not a blocklist: the only Math members the sim may touch are the
  // ones ECMAScript requires to be exact. Anything else (a transcendental, a
  // bracket lookup, a destructure, an alias) is caught by not being on the list.
  [
    "non-exact Math member",
    /\bMath\b(?!\.(?:floor|ceil|round|trunc|min|max|abs|sign|sqrt|imul|fround|clz32)\b)/,
  ],
  ["Intl", /\bIntl\b/],
  ["locale-dependent string method", /\b(?:toLocale\w*|localeCompare)\b/],
  ["number toString with a radix", /\.toString\(\s*\d/],
  ["globalThis", /\bglobalThis\b/],
  ["crypto", /\bcrypto\b/],
  ["process global", /\bprocess\./],
  ["requestAnimationFrame", /\brequestAnimationFrame\b/],
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

  it("the guard catches each way round the old blocklist", () => {
    const violations = [
      "const { random } = Math;",
      'const r = Math["random"]();',
      "const M = Math; M.sin(1);",
      "Math.asinh(2);",
      "Math.hypot(3, 4);",
      "new Intl.NumberFormat();",
      "x.toLocaleString();",
      "a.localeCompare(b);",
      "n.toString(2);",
      "globalThis.foo = 1;",
      "crypto.getRandomValues(a);",
      "process.hrtime();",
      "requestAnimationFrame(f);",
    ];
    for (const src of violations) {
      const hit = BANNED.some(([, pattern]) => pattern.test(stripComments(src)));
      expect(hit, src).toBe(true);
    }
  });

  it("the guard lets the exact Math members through", () => {
    const fine =
      "Math.floor(a) + Math.ceil(b) + Math.round(c) + Math.min(d, e) + Math.max(f, g) + Math.sqrt(h);";
    expect(BANNED.some(([, pattern]) => pattern.test(fine))).toBe(false);
  });

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
