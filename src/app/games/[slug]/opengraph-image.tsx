import { notFound } from "next/navigation";
import { GAMES, getGameMeta } from "../games-meta";
import { OG_SIZE, renderGameOgImage } from "../og-image";

// File-based metadata outranks the page's openGraph.images, and Twitter
// inherits the Open Graph image when the page sets no twitter.images.
// Re-exported through Next's metadata route loader, so each slug is
// prerendered at build time instead of drawn per request.
export function generateStaticParams() {
  return GAMES.filter((g) => !g.external).map((g) => ({ slug: g.slug }));
}

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A free browser game by Amin Dhouib";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameMeta(slug);
  if (!game || game.external) notFound();
  return renderGameOgImage(game.slug);
}
