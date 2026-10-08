import { OG_SIZE, renderGameOgImage } from "../../og-image";

// The hints page's own share card: the game's accent and footer with the page's kicker, title and
// tagline. Picked up by the page's metadata while it leaves openGraph.images unset, like every
// other file-based card here.

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Password Game 2 hints: every rule and event explained, spoilers hidden.";

export default function Image() {
  return renderGameOgImage("password-game", {
    kicker: "RULES AND HINTS",
    title: "Password Game 2 Hints",
    tagline: "Every rule explained, spoilers hidden",
  });
}
