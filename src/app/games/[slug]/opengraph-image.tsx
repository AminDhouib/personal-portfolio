import { notFound } from "next/navigation";
import { GAMES, getGameMeta } from "../games-meta";
import { OG_SIZE, renderGameOgImage } from "../og-image";

// Next applies this file-based image only while the page's metadata leaves
// openGraph.images and twitter.images unset (it checks for the key itself,
// so even `images: undefined` blocks it); Twitter then inherits the Open
// Graph image. Re-exported through Next's metadata route loader, so each
// slug is prerendered at build time instead of drawn per request.
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
