"use client";

import type { TimeOfDay, WeatherKind } from "./types";

const TIME_TINT: Record<TimeOfDay, string> = {
  morning: "rgba(255, 180, 120, 0.08)",
  day: "transparent",
  evening: "rgba(255, 120, 80, 0.10)",
  night: "rgba(40, 60, 140, 0.18)",
};

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
      {weather === "rainy" && <RainOverlay />}
      {weather === "snow" && <SnowOverlay />}
      {weather === "sandstorm" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(200, 180, 120, 0.18)" }}
        />
      )}
      {weather === "fog" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(200, 200, 220, 0.22)" }}
        />
      )}
      {weather === "sunny" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(255, 240, 180, 0.08)" }}
        />
      )}
      {timeOfDay === "night" && <NightStars />}
    </>
  );
}

function RainOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 w-[1px] h-4 bg-blue-200/50"
          style={{
            left: `${(i * 7) % 100}%`,
            animation: `svf-rain 0.6s linear ${(i % 10) * 0.05}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes svf-rain { 0% { transform: translateY(-20%); } 100% { transform: translateY(420px); } }`}</style>
    </div>
  );
}

function SnowOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 w-1 h-1 rounded-full bg-white/80"
          style={{
            left: `${(i * 11) % 100}%`,
            animation: `svf-snow 4s linear ${(i % 10) * 0.4}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes svf-snow { 0% { transform: translateY(-10%) translateX(0); } 100% { transform: translateY(420px) translateX(20px); } }`}</style>
    </div>
  );
}

function NightStars() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-white"
          style={{
            left: `${(i * 13) % 100}%`,
            top: `${(i * 7) % 60}%`,
            opacity: 0.5 + 0.5 * Math.abs(Math.sin(i)),
          }}
        />
      ))}
    </div>
  );
}
