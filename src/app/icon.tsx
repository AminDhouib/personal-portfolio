import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";

// Code-generated icon — circular profile crop on a transparent canvas so
// it blends with the browser tab background instead of showing a square
// photo. PNG output preserves the alpha around the circle.
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
        background: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc}
        alt=""
        width={256}
        height={256}
        style={{
          width: "256px",
          height: "256px",
          borderRadius: "9999px",
          objectFit: "cover",
        }}
      />
    </div>,
    { ...size },
  );
}
