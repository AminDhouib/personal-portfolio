"use client";

import type { TimeOfDay, WeatherKind } from "./types";

const TIME_TINT: Record<TimeOfDay, string> = {
  morning: "rgba(255, 180, 120, 0.06)",
  day: "transparent",
  evening: "rgba(255, 120, 80, 0.08)",
  night: "rgba(40, 60, 140, 0.14)",
};

const WEATHER_TINT: Record<WeatherKind, string> = {
  clear: "transparent",
  sunny: "rgba(255, 240, 180, 0.06)",
  rainy: "rgba(120, 160, 200, 0.10)",
  snow: "rgba(220, 230, 245, 0.10)",
  sandstorm: "rgba(200, 180, 120, 0.12)",
  fog: "rgba(200, 200, 220, 0.16)",
};

/**
 * Subtle color tint overlays for time-of-day and weather. Particle effects
 * (stars, rain, snow) were intentionally removed because their tiny white/
 * grey dots looked like rendering artifacts on top of the pixel-art chrome.
 */
export function Atmosphere({
  timeOfDay,
  weather,
}: {
  timeOfDay: TimeOfDay;
  weather: WeatherKind;
}) {
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: TIME_TINT[timeOfDay] }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: WEATHER_TINT[weather] }}
      />
    </>
  );
}
