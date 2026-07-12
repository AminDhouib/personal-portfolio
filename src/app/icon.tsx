import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";

// Brand accent green (--color-accent-green in globals.css). The site frames the
// profile photo with a green halo (.glow-green in globals.css); this icon
// mirrors that treatment so the tab mark matches the page.
const ACCENT_GREEN = "#22c55e";
const TILE_BG = "#0a0a0a";

// Code-generated icon: the personal-brand mark (the face) ringed in accent-green
// on a dark, full-bleed rounded-square tile. The tile is drawn on a transparent
// canvas, so the four corners outside the 18% radius stay fully transparent
// (alpha 0) -- the mark blends with any browser-tab background instead of
// showing a white/opaque box. A rounded square (vs. a bare circle) reads as a
// deliberate icon and holds up better at 16px than a cropped photo alone.
export default async function Icon() {
  const photo = await readFile(join(process.cwd(), "public/profile.jpg"));
  const photoSrc = `data:image/jpeg;base64,${photo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: TILE_BG,
        borderRadius: 46,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 210,
          height: 210,
          borderRadius: 9999,
          background: ACCENT_GREEN,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          alt=""
          width={182}
          height={182}
          style={{
            width: "182px",
            height: "182px",
            borderRadius: "9999px",
            objectFit: "cover",
          }}
        />
      </div>
    </div>,
    { ...size },
  );
}
