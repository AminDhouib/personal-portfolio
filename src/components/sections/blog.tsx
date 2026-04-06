"use client";

import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";
import type { BlogPostMeta } from "@/lib/blog";
import { formatRelativeDate } from "@/lib/date-utils";

const staticPosts: BlogPostMeta[] = [
  {
    slug: "devsecops-pipeline",
    title: "My Full DevSecOps Pipeline: ESLint, knip, CodeRabbit, and Beyond",
    excerpt: "Every tool in my CI/CD pipeline and why each one earns its place.",
    date: "2026-04-01",
    tags: ["devops"],
    readingTime: "7 min read",
  },
  {
    slug: "devino-solutions-lessons",
    title: "From $0 to $1M: What I Learned Building Devino Solutions",
    excerpt: "Pricing, hiring, retention, and the moment I almost quit.",
    date: "2026-03-25",
    tags: ["business"],
    readingTime: "9 min read",
  },
  {
    slug: "ai-agents-dev-workflow",
    title: "Why I Use AI Agents to Automate My Entire Dev Workflow",
    excerpt: "AI agents that save 6 hours per week.",
    date: "2026-03-10",
    tags: ["ai"],
    readingTime: "5 min read",
  },
];

export function Blog({ posts }: { posts?: BlogPostMeta[] }) {
  const displayPosts = posts?.length ? posts.slice(0, 3) : staticPosts;
  return (
    <section id="blog" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="09"
          title="Blog"
          color="var(--color-accent-blue)"
        />

        <div className="space-y-0">
          {displayPosts.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link
                href={`/blog/${post.slug}`}
                className="group flex items-start justify-between py-6 border-b border-(--border) transition-colors hover:border-accent-blue/30"
              >
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight group-hover:text-accent-blue transition-colors mb-1">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-(--muted)/60">
                    {post.date && <span>{formatRelativeDate(post.date)}</span>}
                    {post.readingTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readingTime}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-(--muted) group-hover:text-accent-blue group-hover:translate-x-1 transition-all mt-1" />
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
