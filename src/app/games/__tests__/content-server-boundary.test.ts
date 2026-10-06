import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// True when the first statement (after comments and blank lines) is the "use client" directive.
function isClientModule(text: string): boolean {
  const body = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(
    /^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/,
    "",
  );
  return /^(["'])use client\1/.test(body);
}

// A module specifier that reaches games/content: the alias, or any relative path through a
// "games/content" segment pair, or a "content" directory reached from inside src/app/games.
const SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;

function reachesGameContent(file: string, text: string): boolean {
  const insideGames = file.replaceAll("\\", "/").includes("app/games/");
  for (const match of text.matchAll(SPECIFIER)) {
    const spec = match[1] ?? "";
    if (/^@\/app\/games\/content(\/|$)/.test(spec)) return true;
    if (/^\.{1,2}\//.test(spec) && /(^|\/)games\/content(\/|$)/.test(spec)) return true;
    if (insideGames && /^\.{1,2}\//.test(spec) && /(^|\/)content(\/|$)/.test(spec)) return true;
  }
  return false;
}

describe("GAME_CONTENT stays on the server", () => {
  it("is imported by no module that starts with use client", () => {
    const files = sourceFiles(SRC);
    const clients = files.filter((file) => isClientModule(readFileSync(file, "utf8")));
    // Sanity: the walk really sees client modules, including the hub's.
    expect(clients.length).toBeGreaterThan(10);
    expect(clients.some((file) => file.endsWith("games-client.tsx"))).toBe(true);

    const offenders = clients
      .filter((file) => reachesGameContent(file, readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it("detects a client module that imports the content", () => {
    const text = '"use client";\nimport { GAME_CONTENT } from "@/app/games/content";\n';
    expect(isClientModule(text)).toBe(true);
    expect(reachesGameContent("src/components/x.tsx", text)).toBe(true);
    expect(reachesGameContent("src/app/games/x.tsx", 'import { a } from "./content/index";')).toBe(
      true,
    );
    expect(reachesGameContent("src/components/x.tsx", 'import { a } from "./game-card";')).toBe(
      false,
    );
  });
});
