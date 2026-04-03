"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";

const blogPosts = [
  {
    slug: "self-hosting-home-server",
    title: "How I Self-Host Everything on a Home Server with 99.99% Uptime",
  },
  {
    slug: "caramel-open-source-story",
    title: "Building an Open-Source Honey Alternative: The Caramel Story",
  },
  {
    slug: "ai-agents-dev-workflow",
    title: "Why I Use AI Agents to Automate My Entire Dev Workflow",
  },
];

export function Blog() {
  return (
    <section id="blog" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="09"
          title="Blog"
          color="var(--color-accent-blue)"
        />

        <div className="space-y-0">
          {blogPosts.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link
                href={`/blog/${post.slug}`}
                className="group flex items-center justify-between py-6 border-b border-(--border) transition-colors hover:border-accent-blue/30"
              >
                <h3 className="font-display text-lg font-bold tracking-tight group-hover:text-accent-blue transition-colors pr-4">
                  {post.title}
                </h3>
                <ArrowRight className="h-4 w-4 shrink-0 text-(--muted) group-hover:text-accent-blue group-hover:translate-x-1 transition-all" />
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent-blue hover:brightness-110 transition-all"
          >
            View all posts
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
