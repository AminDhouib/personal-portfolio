import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { describe, it, expect } from "vitest";

// Regression guard for Super Voltorb Flip's assets: nothing unlisted, nothing
// unreferenced, nothing unattributed. Walks the real tree, so it fails the day
// someone drops a file in public/games/super-voltorb-flip or loads a removed path.
//
// On 2026-10-22 Amin asked for the original Voltorb creature sprites and the original
// HeartGold/SoulSilver music back ("we need to use those assets to make the right
// recreation", T-6535), reversing part of the 2026-10-07 cleanup. This guard is therefore an
// explicit allowlist of exactly the restored files, not a blanket ban: any other image, any
// other audio file, any sprites/upstream path, any sfx folder and any asset-prep script still
// fails. Widening the lists below needs the owner's say-so and a comment saying whose.

const ROOT = process.cwd();
const GAME_DIR = join(ROOT, "public", "games", "super-voltorb-flip");
const PUBLIC = join(ROOT, "public");
const SRC = join(ROOT, "src");
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|flac)$/i;
const IMAGE_EXT = /\.(png|gif|jpe?g|webp|svg)$/i;

// The original Voltorb creature art (T-6535): the revealed-tile Voltorb and the nine bomb-burst
// frames. Number, memo, chrome, coin and button sprites stay gone.
//
// Plus one derived file, sprites/voltorb-icon.png: tile/voltorb.png with the salmon tile and its
// border made transparent (same pixels, 16 x 16, palette PNG). Amin's 2026-10-22 ruling for #174,
// "one consistent sprite everywhere" (T-6535), puts the Voltorb on the clue cards, the legend and
// the memo bar, where the whole 22 px tile would read as a small salmon square, so the bare body
// is needed there. It is the same art, not a new one.
const RESTORED_SPRITES = [
  "sprites/tile/voltorb.png",
  "sprites/voltorb-icon.png",
  ...Array.from({ length: 9 }, (_, i) => `sprites/tile/explode_${i}.png`),
];

// The licence and notice that travel with the sprites. Documents, never loaded by code.
const SPRITE_NOTICES = ["sprites/LICENSE", "sprites/NOTICE.md"];

// The original music and jingles (T-6535): intro then loop in the background, a clear jingle
// and a lost-round jingle.
const RESTORED_AUDIO = [
  "audio/music_intro.mp3",
  "audio/music_loop.mp3",
  "audio/music_level_win.mp3",
  "audio/game_over.mp3",
];

// CC0 tracks for the abandoned skin variants. Kept on purpose (owner ruling: the existing CC0
// music stays); nothing plays them, so the "referenced from source" check skips exactly these.
// The credits check still covers them.
const KEPT_UNWIRED_MUSIC = [
  "music/theme-classic.mp3",
  "music/theme-meadow.mp3",
  "music/theme-twilight.mp3",
];

// Not assets: placeholder files and the credits table.
const NON_ASSETS = [".gitkeep", "music/.gitkeep", "music/CREDITS.md"];

const ALLOWED_FILES = [
  ...RESTORED_SPRITES,
  ...SPRITE_NOTICES,
  ...RESTORED_AUDIO,
  ...KEPT_UNWIRED_MUSIC,
  ...NON_ASSETS,
].sort();

// The only audio under public/ outside this game's own audio/ and music/ folders: none. Kept as
// a list so a future exception needs a justifying comment here (Tower Stacker relies on it).
const OTHER_AUDIO_ALLOWED: string[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Shipped files as forward-slash paths relative to the game's public folder. */
function shippedFiles(): string[] {
  return walk(GAME_DIR)
    .map((f) => relative(GAME_DIR, f).replaceAll("\\", "/"))
    .sort();
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
  it("ships exactly the allowlisted files and nothing else", () => {
    expect(shippedFiles()).toEqual(ALLOWED_FILES);
  });

  it("ships no image except the restored Voltorb sprites", () => {
    const images = shippedFiles().filter((f) => IMAGE_EXT.test(f));
    expect(images).toEqual([...RESTORED_SPRITES].sort());
  });

  it("ships no audio except the restored originals and the kept CC0 tracks", () => {
    const audio = shippedFiles().filter((f) => AUDIO_EXT.test(f));
    expect(audio).toEqual([...RESTORED_AUDIO, ...KEPT_UNWIRED_MUSIC].sort());
  });

  it("ships no sfx folder, no sprites/upstream and no other sprite", () => {
    expect(existsSync(join(GAME_DIR, "sfx"))).toBe(false);
    expect(existsSync(join(GAME_DIR, "sprites", "upstream"))).toBe(false);
    for (const file of shippedFiles().filter((f) => f.startsWith("sprites/"))) {
      expect(file, `${file} is a sprite that was not restored`).toMatch(
        /^sprites\/(tile\/(voltorb|explode_[0-8])\.png|voltorb-icon[.]png|LICENSE|NOTICE\.md)$/,
      );
    }
  });

  it("ships no audio file anywhere else under public/", () => {
    const strays = walk(PUBLIC)
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => AUDIO_EXT.test(f))
      .filter(
        (f) =>
          !f.includes("/public/games/super-voltorb-flip/music/") &&
          !f.includes("/public/games/super-voltorb-flip/audio/"),
      )
      .filter((f) => !OTHER_AUDIO_ALLOWED.some((d) => f.includes(`/public/${d}/`)));
    expect(strays).toEqual([]);
  });

  it("references every served file from code, not just a comment", () => {
    for (const file of [...RESTORED_SPRITES, ...RESTORED_AUDIO]) {
      // The nine burst frames are built from one `explode_${i}.png` template.
      const name = basename(file).replace(/explode_\d\.png$/, "explode_");
      expect(sourceCode, `${file} is shipped but no code loads a path ending /${name}`).toContain(
        `/${name}`,
      );
    }
  });

  it("credits every music track and jingle in a CREDITS.md table row", () => {
    const credits = readFileSync(join(GAME_DIR, "music", "CREDITS.md"), "utf8");
    for (const file of [...RESTORED_AUDIO, ...KEPT_UNWIRED_MUSIC]) {
      const name = basename(file);
      expect(credits, `${name} has no credits table row`).toContain(`| \`${name}\` |`);
    }
  });

  it("names the rights holders of the restored originals in the credits and the notice", () => {
    const credits = readFileSync(join(GAME_DIR, "music", "CREDITS.md"), "utf8");
    const notice = readFileSync(join(GAME_DIR, "sprites", "NOTICE.md"), "utf8");
    for (const text of [credits, notice]) {
      expect(text).toMatch(/Nintendo/);
      expect(text).toMatch(/Game Freak/i);
      expect(text).toMatch(/Creatures/);
    }
  });

  it("loads no sfx path and no audio path outside the audio folder from source", () => {
    expect(sourceText).not.toMatch(/super-voltorb-flip\/sfx/);
    const bases = sourceText.match(/super-voltorb-flip\/audio[^"'`\s]*/g) ?? [];
    for (const base of bases) expect(base).toBe("super-voltorb-flip/audio");
  });

  it("loads only the restored Voltorb sprites from source", () => {
    const paths = sourceText.match(/super-voltorb-flip\/sprites[^"'`\s]*/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect([
        "super-voltorb-flip/sprites/tile",
        "super-voltorb-flip/sprites/voltorb-icon.png",
      ]).toContain(path);
    }
    expect(sourceText).not.toMatch(/sprites\/upstream/);
  });

  it("names the sprite source repo only in the About credits", () => {
    const credits = join("src", "app", "games", "content", "super-voltorb-flip.ts");
    for (const file of sourceFiles()) {
      const path = relative(ROOT, file);
      if (path === credits) continue;
      expect(readFileSync(file, "utf8"), `${path} names the sprite source repo`).not.toMatch(
        /samualtnorman/,
      );
    }
    expect(readFileSync(join(ROOT, credits), "utf8")).toMatch(/samualtnorman/);
  });

  it("has no script, e2e spec or workflow that targets the sprites", () => {
    for (const dir of ["scripts", "e2e", ".github"]) {
      for (const file of walk(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        expect(text, `${file} targets super-voltorb-flip sprites`).not.toMatch(
          /super-voltorb-flip\/sprites/,
        );
      }
    }
  });
});
