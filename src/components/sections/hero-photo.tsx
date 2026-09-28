"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";

// Easter egg: poking the hero photo makes it wince. The shake runs across the
// swap to the pained photo so the cut reads as a reaction instead of a jump.
// Under reduced motion there is no shake, only a slower crossfade. Everything
// motion-dependent in the markup is CSS (motion-reduce:), never the hook: the
// hook reads matchMedia on the client's first render but not on the server, and
// React does not patch that style mismatch during hydration. The hook is only
// read at click time.

/** Offset into the shake at which the pained photo fades in (near the first peak). */
const SWAP_IN_MS = 120;
/** How long after a poke the photo returns to the smiling version. */
const RECOVER_MS = 1300;

const SHAKE = {
  x: [0, -6, 6, -4, 4, -2, 0],
  rotate: [0, -5, 5, -3, 3, -1, 0],
  transition: { duration: 0.45, ease: "easeInOut" as const },
};

export function HeroPhoto() {
  const reduceMotion = useReducedMotion() ?? false;
  const controls = useAnimationControls();
  const [ouch, setOuch] = useState(false);
  // The pained photo is mounted only after the page has loaded, so it never
  // competes with the smiling photo (the LCP element) but is decoded long
  // before anyone can click.
  const [painMounted, setPainMounted] = useState(false);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let idleHandle: number | null = null;
    const mount = () => {
      // Safari has no requestIdleCallback.
      idleHandle =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(() => setPainMounted(true))
          : window.setTimeout(() => setPainMounted(true), 200);
    };
    if (document.readyState === "complete") mount();
    else window.addEventListener("load", mount, { once: true });
    return () => {
      window.removeEventListener("load", mount);
      if (idleHandle === null) return;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, []);

  useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
      if (recoverTimer.current) clearTimeout(recoverTimer.current);
    },
    [],
  );

  const poke = useCallback(() => {
    setPainMounted(true);
    if (swapTimer.current) clearTimeout(swapTimer.current);
    if (recoverTimer.current) clearTimeout(recoverTimer.current);

    if (reduceMotion) {
      setOuch(true);
    } else {
      void controls.start(SHAKE);
      swapTimer.current = setTimeout(() => setOuch(true), SWAP_IN_MS);
    }
    recoverTimer.current = setTimeout(() => setOuch(false), RECOVER_MS);
  }, [controls, reduceMotion]);

  return (
    <div className="relative" data-state={ouch ? "ouch" : "idle"}>
      <button
        type="button"
        onClick={poke}
        onPointerEnter={() => setPainMounted(true)}
        onFocus={() => setPainMounted(true)}
        aria-label="Poke Amin's photo"
        className="block cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-green"
      >
        <motion.div
          animate={controls}
          className="glow-green avatar-backdrop h-48 w-48 overflow-hidden rounded-full border-2 border-accent-green/30 sm:h-64 sm:w-64 lg:h-80 lg:w-80"
        >
          <Image
            src="/profile.png"
            alt="Amin Dhouib"
            width={320}
            height={320}
            className="h-full w-full object-cover"
            priority
          />
          {painMounted && (
            <Image
              src="/profile-ouch.png"
              alt="Amin Dhouib wincing in pain"
              width={320}
              height={320}
              loading="eager"
              fetchPriority="low"
              aria-hidden={!ouch}
              data-testid="hero-photo-ouch"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-120 motion-reduce:duration-300 ${ouch ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </motion.div>
      </button>

      {/* Speech bubble: decorative, the status line below carries the text for AT. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-2 right-0 origin-bottom-left translate-x-1/4 transition-[opacity,scale] duration-180 motion-reduce:scale-100 motion-reduce:duration-300 sm:top-4 ${ouch ? "scale-100 opacity-100" : "scale-60 opacity-0"}`}
      >
        <div className="relative rounded-2xl bg-white px-3 py-1.5 font-display text-base font-black text-black shadow-lg sm:text-lg">
          Ouch!
          <span className="absolute -bottom-1.5 left-3 h-3 w-3 rotate-45 bg-white" />
        </div>
      </div>

      <span role="status" className="sr-only">
        {ouch ? "Ouch!" : ""}
      </span>
    </div>
  );
}
