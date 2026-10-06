import { OG_SIZE, gameOgAlt, renderGameOgImage } from "../og-image";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = gameOgAlt("password-game");

export default function Image() {
  return renderGameOgImage("password-game");
}
