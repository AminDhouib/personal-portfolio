import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getAllBlogPosts } from "@/lib/blog";
import { formatRelativeDate, formatDate } from "@/lib/date-utils";

export const metadata = {
  title: "Blog",
  description: "Thoughts on engineering, open source, and building products.",
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const allPosts = getAllBlogPosts();
  const posts = tag ? allPosts.filter((p) => p.tags.includes(tag)) : allPosts;
  const allTags = [...new Set(allPosts.flatMap((p) => p.tags))].sort();

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

        <h1 className="font-display text-4xl font-black tracking-tight mb-6">
          Blog
        </h1>

        {/* Tag filter bar */}
        <div className="flex flex-wrap gap-2 mb-10">
          <Link
            href="/blog"
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              !tag
                ? "bg-accent-blue/10 border-accent-blue/40 text-accent-blue"
                : "bg-(--surface) border-(--border) text-(--muted)/70 hover:border-accent-blue/30"
            }`}
          >
            All
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={tag === t ? "/blog" : `/blog?tag=${encodeURIComponent(t)}`}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                tag === t
                  ? "bg-accent-blue/10 border-accent-blue/40 text-accent-blue"
                  : "bg-(--surface) border-(--border) text-(--muted)/70 hover:border-accent-blue/30"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>

        <div className="space-y-0">
          {posts.length === 0 ? (
            <p className="py-12 text-center text-(--muted)">
              No posts tagged &ldquo;{tag}&rdquo;.{" "}
              <Link href="/blog" className="text-accent-blue hover:underline">
                View all posts
              </Link>
            </p>
          ) : (
            posts.map((post) => (
              <div
                key={post.slug}
                className="py-8 border-b border-(--border) hover:border-accent-blue/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <Link href={`/blog/${post.slug}`} className="group flex-1 pr-8">
                    <h2 className="font-display text-xl font-bold tracking-tight group-hover:text-accent-blue transition-colors mb-2">
                      {post.title}
                    </h2>
                    <p className="text-sm text-(--muted) mb-2">{post.excerpt}</p>
                    <div className="flex items-center gap-3">
                      {post.date && (
                        <span
                          className="text-xs text-(--muted)/60"
                          title={formatDate(post.date)}
                        >
                          {formatRelativeDate(post.date)}
                        </span>
                      )}
                      <span className="text-xs text-(--muted)/60">·</span>
                      <span className="text-xs text-(--muted)/60">
                        {post.readingTime}
                      </span>
                    </div>
                  </Link>
                  <ArrowRight className="h-5 w-5 shrink-0 mt-1 text-(--muted) group-hover:text-accent-blue group-hover:translate-x-1 transition-all" />
                </div>
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 3).map((t) => (
                      <Link
                        key={t}
                        href={
                          tag === t
                            ? "/blog"
                            : `/blog?tag=${encodeURIComponent(t)}`
                        }
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          tag === t
                            ? "bg-accent-blue/10 border-accent-blue/40 text-accent-blue"
                            : "bg-(--surface) border-(--border) text-(--muted)/70 hover:border-accent-blue/30 hover:text-(--foreground)"
                        }`}
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
