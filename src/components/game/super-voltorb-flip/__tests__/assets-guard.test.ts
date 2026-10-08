import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it, expect } from "vitest";

// Regression guard for Super Voltorb Flip's assets: nothing ripped, nothing
// unreferenced, nothing unattributed. Walks the real tree, so it fails the day
// someone drops a file in public/games/super-voltorb-flip or loads a removed path.

const ROOT = process.cwd();
const GAME_DIR = join(ROOT, "public", "games", "super-voltorb-flip");
const PUBLIC = join(ROOT, "public");
const SRC = join(ROOT, "src");
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|flac)$/i;

// The only audio under public/ besides this game's music folder: none. Kept as a list so
// a future exception needs a justifying comment here.
const OTHER_AUDIO_ALLOWED: string[] = [];

// CC0 tracks for the abandoned skin variants. Kept on purpose (owner ruling:
// the existing CC0 music stays); nothing plays them, so the "referenced from
// source" check skips exactly these. The credits check still covers them.
const KEPT_UNWIRED_MUSIC = [
  "music/theme-classic.mp3",
  "music/theme-meadow.mp3",
  "music/theme-twilight.mp3",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function shippedFiles(): string[] {
  return walk(GAME_DIR);
}

function isAsset(file: string): boolean {
  const name = basename(file);
  return name !== ".gitkeep" && name !== "CREDITS.md";
}

function isKeptUnwired(file: string): boolean {
  const path = file.replaceAll("\\", "/");
  return KEPT_UNWIRED_MUSIC.some((k) => path.endsWith(`/${k}`));
}

function sourceFiles(): string[] {
  return walk(SRC).filter(
    (f) => /\.tsx?$/.test(f) && !f.includes("__tests__") && !/\.test\.tsx?$/.test(f),
  );
}

const sourceText = sourceFiles()
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

// The same source with block and whole-line comments removed, so a comment that
// merely mentions a file cannot satisfy the "referenced" check.
const sourceCode = sourceText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Super Voltorb Flip assets", () => {
  it("ships no ripped audio folders", () => {
    expect(existsSync(join(GAME_DIR, "audio"))).toBe(false);
    expect(existsSync(join(GAME_DIR, "sfx"))).toBe(false);
  });

  it("ships only music tracks and the credits file", () => {
    for (const file of shippedFiles().filter(isAsset)) {
      expect(file.replaceAll("\\", "/")).toMatch(/\/music\/[^/]+\.mp3$/);
    }
  });

  it("ships no audio file anywhere else under public/", () => {
    const strays = walk(PUBLIC)
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => AUDIO_EXT.test(f))
      .filter((f) => !f.includes("/public/games/super-voltorb-flip/music/"))
      .filter((f) => !OTHER_AUDIO_ALLOWED.some((d) => f.includes(`/public/${d}/`)));
    expect(strays).toEqual([]);
  });

  it("references every shipped file from code, not just a comment", () => {
    for (const file of shippedFiles().filter(isAsset)) {
      if (isKeptUnwired(file)) continue;
      const name = basename(file);
      expect(sourceCode, `${name} is shipped but no code loads a path ending /${name}`).toContain(
        `/${name}`,
      );
    }
  });

  it("credits every music track in a CREDITS.md table row", () => {
    const credits = readFileSync(join(GAME_DIR, "music", "CREDITS.md"), "utf8");
    for (const file of shippedFiles().filter(isAsset)) {
      const name = basename(file);
      expect(credits, `${name} has no credits table row`).toContain(`| \`${name}\` |`);
    }
  });

  it("loads no removed audio path from source", () => {
    expect(sourceText).not.toMatch(/super-voltorb-flip\/(audio|sfx)\//);
  });

  it("ships no sprite folder or image files", () => {
    expect(existsSync(join(GAME_DIR, "sprites"))).toBe(false);
    for (const file of shippedFiles()) {
      expect(file).not.toMatch(/\.(png|gif|jpe?g|webp|svg)$/i);
    }
  });

  it("loads nothing from a sprites or upstream path", () => {
    expect(sourceText).not.toMatch(/super-voltorb-flip\/sprites/);
    expect(sourceText).not.toMatch(/sprites\/upstream/);
    expect(sourceText).not.toMatch(/samualtnorman/);
  });

  it("has no script, e2e spec or workflow that targets the removed sprites", () => {
    for (const dir of ["scripts", "e2e", ".github"]) {
      for (const file of walk(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        expect(text, `${file} still targets super-voltorb-flip sprites`).not.toMatch(
          /super-voltorb-flip\/sprites/,
        );
      }
    }
  });
});
