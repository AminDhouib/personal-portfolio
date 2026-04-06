import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getAllBlogPosts } from "@/lib/blog";
import { formatRelativeDate, formatDate } from "@/lib/date-utils";

export const metadata = {
  title: "Blog — Amin Dhouib",
  description: "Thoughts on engineering, open source, and building products.",
};

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-12">
          Blog
        </h1>

        <div className="space-y-0">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex items-start justify-between py-8 border-b border-(--border) transition-colors hover:border-accent-blue/30"
            >
              <div className="pr-8">
                <h2 className="font-display text-xl font-bold tracking-tight group-hover:text-accent-blue transition-colors mb-2">
                  {post.title}
                </h2>
                <p className="text-sm text-(--muted) mb-2">{post.excerpt}</p>
                <div className="flex items-center gap-3">
                  {post.date && (
                    <span className="text-xs text-(--muted)/60" title={formatDate(post.date)}>
                      {formatRelativeDate(post.date)}
                    </span>
                  )}
                  <span className="text-xs text-(--muted)/60">·</span>
                  <span className="text-xs text-(--muted)/60">
                    {post.readingTime}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 mt-1 text-(--muted) group-hover:text-accent-blue group-hover:translate-x-1 transition-all" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
