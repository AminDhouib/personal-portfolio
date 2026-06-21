"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { experience } from "@/data/experience";

export function Experience() {
  return (
    <section id="experience" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="08"
          title="Experience"
          color="var(--color-accent-blue)"
        />

        <div className="relative">
          {/* Vertical timeline rail, threaded through the monogram nodes. */}
          <div
            className="absolute left-5 top-3 bottom-3 w-px bg-(--border)"
            aria-hidden="true"
          />

          <div className="space-y-8">
            {experience.map((job, i) => (
              <motion.div
                key={`${job.company}-${job.role}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.3) }}
                className="relative flex gap-4 sm:gap-6"
              >
                {/* Monogram node */}
                <div
                  className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-blue/30 bg-accent-blue/10 text-[11px] font-bold text-accent-blue"
                  aria-hidden="true"
                >
                  {job.short}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-display text-base font-bold tracking-tight">
                      {job.role}
                    </h3>
                    <span className="text-xs text-(--muted) whitespace-nowrap">
                      {job.period}
                    </span>
                  </div>

                  <p className="text-sm text-(--muted) mt-0.5">
                    <span className="font-medium text-(--foreground)">
                      {job.company}
                    </span>
                    {job.type ? <> · {job.type}</> : null}
                    {job.current ? (
                      <span className="ml-2 inline-flex items-center rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 align-middle text-[10px] font-medium text-accent-green">
                        Current
                      </span>
                    ) : null}
                  </p>

                  {job.location ? (
                    <p className="mt-0.5 text-xs text-(--muted)/70">
                      {job.location}
                    </p>
                  ) : null}

                  <ul className="mt-3 space-y-1.5">
                    {job.highlights.map((h) => (
                      <li
                        key={h}
                        className="flex gap-2.5 text-sm text-(--muted)"
                      >
                        <span
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-blue/60"
                          aria-hidden="true"
                        />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-md border border-(--border) bg-(--surface) px-2 py-0.5 text-[11px] text-(--muted)"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
