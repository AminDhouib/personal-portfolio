"use client";

import { useLayoutEffect, useRef, type ComponentPropsWithoutRef, type CSSProperties } from "react";

type RevealTag = "div" | "li" | "a";

type RevealProps<T extends RevealTag> = {
  /** Element to render; defaults to a div. */
  as?: T;
  /** Starting offset in px (the element rises/slides from there to rest). */
  x?: number;
  y?: number;
  /** Seconds, same meaning as the framer-motion `transition` this replaced. */
  duration?: number;
  delay?: number;
  /**
   * Px inset on the viewport's bottom edge only; negative reveals later. Bottom only, so an
   * element that overlaps the top edge after a jump scroll is never stranded in a dead zone.
   * Only use a negative margin mid-page: an armed element must be able to scroll more than
   * |margin| px above the viewport bottom, which the last element on a page may never do.
   */
  margin?: number;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * Scroll reveal that is visible by default. The server HTML and the first client render carry no
 * hidden style, so no-JS clients, crawlers and link previews read the real content. After
 * hydration, and before the first paint, a layout effect arms (hides) only the elements that start
 * below the fold, then an IntersectionObserver plays a one-shot CSS rise-in when each scrolls into
 * view. Elements already on screen are left alone, so nothing flashes visible-hidden-visible.
 * Reduced motion arms nothing. The arm/play state is a `data-reveal` attribute written on the DOM
 * node, not React state, so the render output never differs between server and client. The
 * `[data-reveal]` rules are in globals.css.
 */
export function Reveal<T extends RevealTag = "div">({
  as,
  x = 0,
  y = 0,
  duration = 0.5,
  delay = 0,
  margin = 0,
  style,
  ...rest
}: RevealProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  // The union of tags is too wide for JSX to check; every allowed tag takes these props.
  const Tag = (as ?? "div") as "div";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.dataset.reveal === "shown" || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // On screen (or already scrolled past) at hydration: stay visible, no animation.
    if (el.getBoundingClientRect().top < window.innerHeight + margin) return;

    el.dataset.reveal = "armed";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.dataset.reveal = "shown";
        observer.disconnect();
      },
      { rootMargin: `0px 0px ${margin}px 0px` },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Never leave a node hidden with no observer: a re-run decides afresh from its position.
      if (el.dataset.reveal === "armed") delete el.dataset.reveal;
    };
  }, [margin]);

  const vars = {
    "--reveal-x": `${x}px`,
    "--reveal-y": `${y}px`,
    "--reveal-dur": `${duration}s`,
    "--reveal-delay": `${delay}s`,
    ...(style as CSSProperties | undefined),
  } as CSSProperties;

  return <Tag ref={ref} style={vars} {...(rest as ComponentPropsWithoutRef<"div">)} />;
}
