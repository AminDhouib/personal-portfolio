"use client";

import { useRef } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { Star, Server } from "lucide-react";
import { useEffect } from "react";

interface CounterProps {
  target: number;
  prefix?: string;
  suffix?: string;
  label: string;
  color: string;
  inView: boolean;
  decimals?: number;
}

function Counter({ target, prefix = "", suffix = "", label, color, inView, decimals = 0 }: CounterProps) {
  const count = useMotionValue(0);
  const display = useTransform(count, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString()
  );

  useEffect(() => {
    if (inView) {
      const controls = animate(count, target, {
        duration: 2,
        ease: "easeOut",
      });
      return controls.stop;
    }
  }, [inView, count, target]);

  return (
    <div className="text-center">
      <div className="font-display text-3xl sm:text-4xl font-black tracking-tight mb-1">
        {prefix}
        <motion.span>{display}</motion.span>
        {suffix}
      </div>
      <div className="text-xs text-(--muted) uppercase tracking-wider mb-2">
        {label}
      </div>
      <div
        className="mx-auto h-0.5 w-10 rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function ProofBar() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  const metrics = [
    {
      target: 1,
      prefix: "$",
      suffix: "M+",
      label: "Revenue",
      color: "var(--color-accent-green)",
    },
    {
      target: 100,
      suffix: "+",
      label: "Clients",
      color: "var(--color-accent-blue)",
    },
    {
      target: 30,
      suffix: "K+",
      label: "Users",
      color: "var(--color-accent-cyan)",
    },
    {
      target: 5.0,
      suffix: "",
      label: "Rating",
      color: "var(--color-accent-amber)",
      isStar: true,
    },
    {
      target: 99.99,
      suffix: "%",
      label: "Uptime",
      color: "var(--color-accent-green)",
      decimals: 2,
    },
  ];

  return (
    <section ref={ref} className="py-20 border-y border-(--border)">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col items-center">
              {"isStar" in m && m.isStar ? (
                <div className="text-center">
                  <div className="font-display text-3xl sm:text-4xl font-black tracking-tight mb-1 flex items-center justify-center gap-1">
                    5.0
                    <Star className="h-5 w-5 fill-accent-amber text-accent-amber" />
                  </div>
                  <div className="text-xs text-(--muted) uppercase tracking-wider mb-2">
                    {m.label}
                  </div>
                  <div
                    className="mx-auto h-0.5 w-10 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                </div>
              ) : (
                <Counter
                  target={m.target}
                  prefix={m.prefix}
                  suffix={m.suffix}
                  label={m.label}
                  color={m.color}
                  inView={inView}
                  decimals={"decimals" in m ? m.decimals : 0}
                />
              )}
            </div>
          ))}
        </motion.div>

        {/* Self-hosted callout */}
        <motion.div
          className="mt-12 flex flex-col items-center gap-2 text-center"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex items-center gap-2 text-(--muted)">
            <Server className="h-4 w-4 shrink-0" />
            <span className="text-sm">
              Did you know this site runs on my home server?
            </span>
          </div>
          <p className="text-xs text-(--muted)/60">
            Docker Swarm &nbsp;/&nbsp; Tailscale &nbsp;/&nbsp; Cloudflared
          </p>
        </motion.div>
      </div>
    </section>
  );
}
