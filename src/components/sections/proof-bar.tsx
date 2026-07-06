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
  subtitle: string;
  color: string;
  inView: boolean;
  decimals?: number;
}

function Counter({
  target,
  prefix = "",
  suffix = "",
  label,
  subtitle,
  color,
  inView,
  decimals = 0,
}: CounterProps) {
  const count = useMotionValue(0);
  const display = useTransform(count, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString(),
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
      <div className="mb-1 font-display text-3xl font-black tracking-tight sm:text-4xl">
        {prefix}
        <motion.span>{display}</motion.span>
        {suffix}
      </div>
      <div className="mb-2 text-xs tracking-wider text-(--muted) uppercase">{label}</div>
      <div className="mx-auto mb-2 h-0.5 w-10 rounded-full" style={{ backgroundColor: color }} />
      <div className="mx-auto max-w-45 text-[11px] leading-snug text-(--muted)/70">{subtitle}</div>
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
      subtitle: "Generated for clients",
      color: "var(--color-accent-green)",
    },
    {
      target: 50,
      suffix: "+",
      label: "Clients",
      subtitle: "Successful projects shipped",
      color: "var(--color-accent-blue)",
    },
    {
      target: 30,
      suffix: "K+",
      label: "Users",
      subtitle: "Across my services",
      color: "var(--color-accent-cyan)",
    },
    {
      target: 5.0,
      suffix: "",
      label: "Rating",
      subtitle: "Avg across client reviews",
      color: "var(--color-accent-amber)",
      isStar: true,
    },
    {
      target: 99.99,
      suffix: "%",
      label: "Uptime",
      subtitle: "Across all hosted services",
      color: "var(--color-accent-green)",
      decimals: 2,
    },
  ];

  return (
    <section ref={ref} className="border-y border-(--border) py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-5"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col items-center">
              {"isStar" in m && m.isStar ? (
                <div className="text-center">
                  <div className="mb-1 flex items-center justify-center gap-1 font-display text-3xl font-black tracking-tight sm:text-4xl">
                    5.0
                    <Star className="h-5 w-5 fill-accent-amber text-accent-amber" />
                  </div>
                  <div className="mb-2 text-xs tracking-wider text-(--muted) uppercase">
                    {m.label}
                  </div>
                  <div
                    className="mx-auto mb-2 h-0.5 w-10 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  <div className="mx-auto max-w-45 text-[11px] leading-snug text-(--muted)/70">
                    {m.subtitle}
                  </div>
                </div>
              ) : (
                <Counter
                  target={m.target}
                  prefix={m.prefix}
                  suffix={m.suffix}
                  label={m.label}
                  subtitle={m.subtitle}
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
            <span className="text-sm">Did you know this site runs on my home server?</span>
          </div>
          <p className="text-xs text-(--muted)/60">
            Docker Swarm &nbsp;/&nbsp; Tailscale &nbsp;/&nbsp; Cloudflared
          </p>
        </motion.div>
      </div>
    </section>
  );
}
