"use client";

import { type CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SiIcon, TechIcon } from "@/components/ui/tech-icon";
import { experience } from "@/data/experience";

// Translucent tint of the active role's accent (exposed as --a on each row).
const tint = (pct: number) => `color-mix(in srgb, var(--a) ${pct}%, transparent)`;

export function Experience() {
  return (
    <section id="experience" className="py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="08"
          title="Experience"
          color="var(--color-accent-blue)"
        />
        <p className="-mt-8 mb-12 max-w-2xl text-sm leading-relaxed text-(--muted)">
          Eight roles across cryptography, optical systems, GIS, and full-stack
          product — from a defence internship to founding Devino.
        </p>

        <div className="relative">
          {/* Timeline rail threaded through the medallions, fading at both ends. */}
          <div
            className="absolute left-7 top-3 bottom-3 z-0 w-px"
            style={{
              background:
                "linear-gradient(to bottom, transparent, var(--border) 6%, var(--border) 94%, transparent)",
            }}
            aria-hidden="true"
          />

          <ol className="space-y-4">
            {experience.map((job, i) => (
              <motion.li
                key={`${job.company}-${job.role}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.3) }}
                className="relative flex gap-4 sm:gap-5"
                style={{ "--a": job.accent } as CSSProperties}
              >
                {/* Logo medallion on the rail */}
                <div className="relative z-10 shrink-0">
                  <div
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-white p-2"
                    style={{
                      color: "var(--a)",
                      borderColor: tint(40),
                      boxShadow: `0 0 0 4px var(--background), 0 10px 24px -14px ${tint(70)}`,
                    }}
                  >
                    {job.logo ? (
                      <Image
                        src={job.logo}
                        alt={`${job.company} logo`}
                        width={44}
                        height={44}
                        className="h-full w-full object-contain"
                      />
                    ) : job.brand ? (
                      <SiIcon slug={job.brand} className="h-7 w-7" />
                    ) : (
                      <span className="font-display text-sm font-bold tracking-tight">
                        {job.short}
                      </span>
                    )}
                  </div>

                  {job.current ? (
                    <span
                      className="absolute -right-1 -top-1 flex h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full"
                        style={{ backgroundColor: "var(--a)", opacity: 0.7 }}
                      />
                      <span
                        className="relative inline-flex h-3.5 w-3.5 rounded-full border-2"
                        style={{
                          backgroundColor: "var(--a)",
                          borderColor: "var(--background)",
                        }}
                      />
                    </span>
                  ) : null}
                </div>

                {/* Role card */}
                <div className="relative flex-1 overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-5 pl-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--a)] hover:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)]">
                  {/* Accent spine tying the card back to its medallion. */}
                  <span
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ backgroundColor: "var(--a)" }}
                    aria-hidden="true"
                  />

                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold leading-snug tracking-tight">
                        {job.role}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span
                          className="font-semibold"
                          style={{ color: "var(--a)" }}
                        >
                          {job.company}
                        </span>
                        {job.type ? (
                          <span className="text-(--muted)">· {job.type}</span>
                        ) : null}
                        {job.current ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              color: "var(--a)",
                              borderColor: tint(30),
                              backgroundColor: tint(10),
                            }}
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              <span
                                className="absolute inline-flex h-full w-full animate-ping rounded-full"
                                style={{ backgroundColor: "var(--a)", opacity: 0.7 }}
                              />
                              <span
                                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: "var(--a)" }}
                              />
                            </span>
                            Current
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <span className="shrink-0 whitespace-nowrap rounded-full border border-(--border) bg-(--surface) px-2.5 py-1 font-mono text-[11px] text-(--muted)">
                      {job.period}
                    </span>
                  </div>

                  {job.location ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-(--muted)">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {job.location}
                    </p>
                  ) : null}

                  <ul className="mt-3.5 space-y-2">
                    {job.highlights.map((h) => (
                      <li
                        key={h}
                        className="flex gap-2.5 text-sm leading-relaxed text-(--muted)"
                      >
                        <span
                          className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 rounded-[1px]"
                          style={{ backgroundColor: tint(75) }}
                          aria-hidden="true"
                        />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {job.skills.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center rounded-md border border-(--border) bg-(--surface) px-2 py-1 text-[11px] font-medium text-(--muted) transition-colors hover:text-(--foreground)"
                      >
                        <TechIcon name={s} />
                      </span>
                    ))}
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
