"use client";
import { useEffect, useState } from "react";

const KEY = "svf:muted";

export function useMute() {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMuted(localStorage.getItem(KEY) === "1");
  }, []);
  const toggle = () => {
    setMuted((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  };
  return [muted, toggle] as const;
}
