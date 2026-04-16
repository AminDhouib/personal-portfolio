"use client";

import { dsFont } from "./ds-font";
import { themedAsset } from "../theme";
import type { ThemeId } from "../types";

export const VOLTORB_MESSAGE_HEIGHT = 30;

/**
 * Message band with a Voltorb icon on the left and a themed message on the
 * right. Voltorb sprite stays baked into the chrome slice; the text portion
 * is stripped and rendered via React so each theme can customise it.
 */
export function VoltorbMessage({
  message,
  themeId,
}: {
  message: string;
  themeId: ThemeId;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: VOLTORB_MESSAGE_HEIGHT,
        backgroundImage: `url(${themedAsset(themeId, "chrome/voltorb-message-frame.png")})`,
        imageRendering: "pixelated",
      }}
    >
      <div
        className={dsFont.className}
        aria-label={message}
        style={{
          position: "absolute",
          left: 104,
          top: 4,
          width: 150,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#102418",
          fontSize: 7,
          lineHeight: "10px",
          letterSpacing: "0.5px",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {message}
      </div>
    </div>
  );
}
