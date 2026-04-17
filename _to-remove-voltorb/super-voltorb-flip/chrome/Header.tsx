"use client";

import { Digit } from "./Digits";
import { dsFont } from "./ds-font";
import { themedAsset } from "../theme";
import type { ThemeId } from "../types";

export const HEADER_HEIGHT = 40;

/**
 * Top banner: shows the theme's title + level digit on line 1, subtitle on
 * line 2. Frame art comes from the textless header-frame.png so the text is
 * fully React-rendered and per-theme configurable.
 *
 * The level digit uses the original thin-digit sprite sheet to match the
 * baked-in glyph style; the rest of the text is rendered via the Silkscreen
 * pixel font so it can be any string the theme wants.
 */
export function Header({
  level,
  title,
  subtitle,
  themeId,
}: {
  level: number;
  title: string;
  subtitle: string;
  themeId: ThemeId;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: HEADER_HEIGHT,
        backgroundImage: `url(${themedAsset(themeId, "chrome/header-frame.png")})`,
        imageRendering: "pixelated",
      }}
    >
      {/* Title row */}
      <div
        className={dsFont.className}
        style={{
          position: "absolute",
          left: 8,
          top: 5,
          width: 246,
          height: 12,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 3,
          color: "#ffffff",
          fontSize: 7,
          lineHeight: "10px",
          letterSpacing: "0.5px",
          textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <span>{title}</span>
        {/* Level digit still from the thin sprite sheet for pixel-perfect match */}
        <span style={{ position: "relative", width: 6, height: 10, flexShrink: 0 }}>
          <Digit n={level} variant="thin" x={0} y={0} />
        </span>
      </div>
      {/* Subtitle row */}
      <div
        className={dsFont.className}
        aria-label={subtitle}
        style={{
          position: "absolute",
          left: 8,
          top: 21,
          width: 246,
          height: 12,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "#ffffff",
          fontSize: 7,
          lineHeight: "10px",
          letterSpacing: "0.5px",
          textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}
