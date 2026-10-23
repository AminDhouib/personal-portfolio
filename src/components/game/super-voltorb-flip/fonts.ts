import localFont from "next/font/local";

// ---------------------------------------------------------------------------
// Fonts — 1:1 with upstream (pokemon-ds-font / m5x7 / stacked-pixel).
// ---------------------------------------------------------------------------

export const pokemonFont = localFont({
  src: "../../../../public/games/voltorb-flip/fonts/pokemon-ds-font.ttf",
  variable: "--font-voltorb-ds",
  display: "swap",
});
export const numberFont = localFont({
  src: "../../../../public/games/voltorb-flip/fonts/m5x7.ttf",
  variable: "--font-voltorb-m5x7",
  display: "swap",
});
export const scoreFont = localFont({
  src: "../../../../public/games/voltorb-flip/fonts/stacked-pixel.ttf",
  variable: "--font-voltorb-stacked",
  display: "swap",
});
