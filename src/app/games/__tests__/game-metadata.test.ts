import { describe, it, expect, vi } from "vitest";
import { GAMES } from "../games-meta";
import { GAME_CONTENT } from "../content";
import { generateMetadata } from "../[slug]/page";
import { metadata as passwordGameMetadata } from "../password-game/page";

// The page modules pull in client-only game components; the metadata does not need them.
vi.mock("@/components/game/game-loader", () => ({ GameLoader: () => null }));
vi.mock("@/components/game/game-card", () => ({ GameCard: () => null }));
vi.mock("@/components/game/password-game-2", () => ({ PasswordGame2Loader: () => null }));

type Meta = {
  title?: unknown;
  description?: string;
  alternates?: { canonical?: string };
  openGraph?: { url?: string; title?: string; description?: string; images?: unknown };
  twitter?: { card?: string; title?: string; images?: unknown };
  robots?: { index?: boolean; follow?: boolean };
};

async function metaFor(slug: string): Promise<Meta> {
  return (await generateMetadata({ params: Promise.resolve({ slug }) })) as Meta;
}

describe("game page metadata", () => {
  for (const game of GAMES.filter((g) => !g.hidden && !g.external)) {
    it(`${game.slug}: search copy from GAME_CONTENT, og:url matches the canonical, indexable`, async () => {
      const content = GAME_CONTENT[game.slug];
      const meta = await metaFor(game.slug);
      expect(meta.title).toBe(content.seoTitle);
      expect(meta.description).toBe(content.seoDescription);
      expect(meta.alternates?.canonical).toBe(`https://amindhou.com/games/${game.slug}`);
      expect(meta.openGraph?.url).toBe(meta.alternates?.canonical);
      expect(meta.openGraph?.title).toBe(`${game.title}, a free browser game by Amin Dhouib`);
      expect(meta.openGraph?.description).toBe(content.seoDescription);
      expect(meta.twitter?.card).toBe("summary_large_image");
      expect(meta.robots?.index).not.toBe(false);
    });

    it(`${game.slug}: leaves images to the file-based opengraph-image`, async () => {
      // A config image would be overridden anyway; setting twitter.images would
      // stop Twitter inheriting the generated card.
      const meta = await metaFor(game.slug);
      expect(meta.openGraph?.images).toBeUndefined();
      expect(meta.twitter?.images).toBeUndefined();
    });
  }

  for (const game of GAMES.filter((g) => g.hidden && !g.external)) {
    it(`${game.slug}: a hidden game is noindex`, async () => {
      const meta = await metaFor(game.slug);
      expect(meta.robots).toEqual({ index: false, follow: true });
    });
  }

  it("password-game: search copy from GAME_CONTENT and no config images", () => {
    const content = GAME_CONTENT["password-game"];
    const meta = passwordGameMetadata as Meta;
    expect(meta.title).toBe(content.seoTitle);
    expect(meta.description).toBe(content.seoDescription);
    expect(meta.alternates?.canonical).toBe("https://amindhou.com/games/password-game");
    expect(meta.openGraph?.url).toBe(meta.alternates?.canonical);
    expect(meta.openGraph?.images).toBeUndefined();
    expect(meta.twitter?.images).toBeUndefined();
    expect(meta.twitter?.card).toBe("summary_large_image");
  });
});
