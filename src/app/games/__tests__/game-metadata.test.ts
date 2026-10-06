import { describe, it, expect, vi } from "vitest";
import { GAMES } from "../games-meta";
import { generateMetadata } from "../[slug]/page";

// The page module pulls in client-only game components; the metadata function
// does not need them.
vi.mock("@/components/game/game-loader", () => ({ GameLoader: () => null }));
vi.mock("@/components/game/game-card", () => ({ GameCard: () => null }));

type Meta = {
  description?: string;
  alternates?: { canonical?: string };
  openGraph?: { url?: string; title?: string; images?: unknown[] };
  twitter?: { card?: string; title?: string; images?: unknown[] };
  robots?: { index?: boolean; follow?: boolean };
};

async function metaFor(slug: string): Promise<Meta> {
  return (await generateMetadata({ params: Promise.resolve({ slug }) })) as Meta;
}

describe("game page metadata", () => {
  for (const game of GAMES.filter((g) => !g.hidden && !g.external)) {
    it(`${game.slug}: og:url matches the canonical, has a twitter card, is indexable`, async () => {
      const meta = await metaFor(game.slug);
      expect(meta.description).toBe(game.description);
      expect(meta.alternates?.canonical).toBe(`https://amindhou.com/games/${game.slug}`);
      expect(meta.openGraph?.url).toBe(meta.alternates?.canonical);
      expect(meta.openGraph?.title).toBe(`${game.title}, a free browser game by Amin Dhouib`);
      expect(meta.openGraph?.images?.length).toBeGreaterThan(0);
      expect(meta.twitter?.card).toBe("summary_large_image");
      expect(meta.twitter?.images?.length).toBeGreaterThan(0);
      expect(meta.robots?.index).not.toBe(false);
    });
  }

  for (const game of GAMES.filter((g) => g.hidden && !g.external)) {
    it(`${game.slug}: a hidden game is noindex`, async () => {
      const meta = await metaFor(game.slug);
      expect(meta.robots).toEqual({ index: false, follow: true });
    });
  }
});
