import { ImageResponse } from "next/og";
import { GAMES_BY_SLUG, type GameSlug } from "./games-meta";

// The 1200x630 share card for one game page, in the root card's style: the
// game's accent as a glow and rule, its title and tagline, and the site footer.

export const OG_SIZE = { width: 1200, height: 630 };

export function gameOgAlt(slug: GameSlug): string {
  const game = GAMES_BY_SLUG[slug];
  return `${game.title}: ${game.tagline}. A free browser game by Amin Dhouib.`;
}

export type GameOgOverride = { kicker?: string; title?: string; tagline?: string };

export function renderGameOgImage(slug: GameSlug, override?: GameOgOverride): ImageResponse {
  const game = GAMES_BY_SLUG[slug];
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 80px",
        backgroundColor: "#050505",
        backgroundImage: `radial-gradient(circle at 85% 20%, ${game.accent}55, transparent 55%)`,
        color: "#ededed",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 22,
          letterSpacing: "0.2em",
          color: game.accent,
          fontWeight: 700,
        }}
      >
        {override?.kicker ?? "FREE BROWSER GAME"}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "20px",
          fontSize: 104,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 0.95,
        }}
      >
        {override?.title ?? game.title}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "28px",
          width: "96px",
          height: "6px",
          borderRadius: "999px",
          backgroundColor: game.accent,
        }}
      />
      <div style={{ display: "flex", marginTop: "28px", fontSize: 36, color: "#bbbbbb" }}>
        {override?.tagline ?? game.tagline}
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          bottom: "60px",
          left: "80px",
          right: "80px",
          justifyContent: "space-between",
          fontSize: 20,
          color: "#888888",
        }}
      >
        <span>amindhou.com/games</span>
        <span>No download. No sign-up.</span>
      </div>
    </div>,
    { ...OG_SIZE },
  );
}
