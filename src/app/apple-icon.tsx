import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon (iOS home-screen). 180x180 is Apple's recommended size.
// Same circular crop on transparent canvas as the browser-tab icon, but
// sized for the home-screen rounded-square mask iOS applies on top.
export default async function AppleIcon() {
  const photo = await readFile(join(process.cwd(), "public/profile.jpg"));
  const photoSrc = `data:image/jpeg;base64,${photo.toString("base64")}`;

  return new ImageResponse(
    (
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
          width={180}
          height={180}
          style={{
            width: "180px",
            height: "180px",
            borderRadius: "9999px",
            objectFit: "cover",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
