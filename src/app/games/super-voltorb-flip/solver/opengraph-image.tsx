import { OG_SIZE, renderGameOgImage } from "../../og-image";

// The solver's own share card: the game's accent and footer with the tool's
// kicker, title and tagline. Picked up by the page's metadata while it leaves
// openGraph.images unset, like every other file-based card here.

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Voltorb Flip Solver: tile odds from your clue numbers. A free tool by Amin Dhouib.";

export default function Image() {
  return renderGameOgImage("super-voltorb-flip", {
    kicker: "FREE SOLVER",
    title: "Voltorb Flip Solver",
    tagline: "Tile odds from your clue numbers",
  });
}
