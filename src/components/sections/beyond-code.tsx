"use client";

import { motion } from "framer-motion";
import { Target, Palette, Dumbbell, Rocket } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";

const interests = [
  { icon: Target, label: "Team Sports", detail: "Soccer, Volleyball" },
  { icon: Palette, label: "Design & Modeling", detail: "" },
  { icon: Dumbbell, label: "Fitness", detail: "" },
  { icon: Rocket, label: "Building & Shipping", detail: "" },
];

export function BeyondCode() {
  return (
    <section id="beyond" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="10"
          title="Beyond Code"
          color="var(--color-accent-amber)"
        />

        <div className="grid grid-cols-2 gap-6 max-w-md">
          {interests.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex flex-col gap-2"
              >
                <Icon className="h-5 w-5 text-accent-amber" />
                <p className="font-display text-sm font-bold">{item.label}</p>
                {item.detail && (
                  <p className="text-xs text-(--muted)">{item.detail}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
