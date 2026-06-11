"use client";
import { useState } from "react";

const KEY = "svf:muted";

export function useMute() {
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "1";
  });
  const toggle = () => {
    setMuted((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  };
  return [muted, toggle] as const;
}
