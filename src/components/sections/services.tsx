"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { TechIcon } from "@/components/ui/tech-icon";
import { services } from "@/data/services";
import { BOOKING_URL } from "@/data/nav";

export function Services() {
  return (
    <section id="services" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="05" title="Services" color="var(--color-accent-purple)" />

        <div className="space-y-0">
          {services.map((service, i) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="group flex items-start gap-5 border-b border-(--border) py-6 last:border-b-0"
              >
                {/* Accent bar + icon */}
                <div className="flex shrink-0 items-center gap-3">
                  <div
                    className="h-10 w-0.5 rounded-full"
                    style={{ backgroundColor: service.accentColor }}
                  />
                  <Icon className="h-5 w-5" style={{ color: service.accentColor }} />
                </div>

                {/* Content */}
                <div>
                  <h3 className="mb-1 font-display text-lg font-bold tracking-tight">
                    {service.title}
                  </h3>
                  <p className="mb-1 text-sm text-(--muted)">{service.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {service.tools.map((tool) => (
                      <span key={tool} className="text-xs text-(--muted)">
                        <TechIcon name={tool} />
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          className="mt-12 flex justify-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent-green transition-all hover:brightness-110"
          >
            Book a Call
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
