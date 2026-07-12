import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Brand accent green (--color-accent-green in globals.css), matching the halo
// the site draws around the profile photo (.glow-green).
const ACCENT_GREEN = "#22c55e";
const TILE_BG = "#0a0a0a";

// Apple touch icon (iOS home screen). iOS applies its own rounded-square mask,
// so a full-bleed solid background is correct here (no transparent corners
// needed). Same brand treatment as the browser-tab icon: the face ringed in
// accent-green on a dark tile.
export default async function AppleIcon() {
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
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 148,
          height: 148,
          borderRadius: 9999,
          background: ACCENT_GREEN,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          alt=""
          width={128}
          height={128}
          style={{
            width: "128px",
            height: "128px",
            borderRadius: "9999px",
            objectFit: "cover",
          }}
        />
      </div>
    </div>,
    { ...size },
  );
}
