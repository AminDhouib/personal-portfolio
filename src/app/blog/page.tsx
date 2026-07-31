import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getAllBlogPosts } from "@/lib/blog";
import { formatRelativeDate, formatDate } from "@/lib/date-utils";

const SITE_ORIGIN = "https://amindhou.com";

const DESCRIPTION = "Thoughts on engineering, open source, and building products.";

export const metadata = {
  title: "Blog",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/blog`,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/blog`,
    title: "Blog — engineering notes by Amin Dhouib",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Blog" }],
  },
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
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="mb-6 font-display text-4xl font-black tracking-tight">Blog</h1>

        {/* Tag filter bar */}
        <div className="mb-10 flex flex-wrap gap-2">
          <Link
            href="/blog"
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              !tag
                ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                : "border-(--border) bg-(--surface) text-(--muted)/70 hover:border-accent-blue/30"
            }`}
          >
            All
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={tag === t ? "/blog" : `/blog?tag=${encodeURIComponent(t)}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                tag === t
                  ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                  : "border-(--border) bg-(--surface) text-(--muted)/70 hover:border-accent-blue/30"
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
                className="group border-b border-(--border) py-8 transition-colors hover:border-accent-blue/30"
              >
                <div className="mb-3 flex items-start justify-between">
                  <Link href={`/blog/${post.slug}`} className="flex-1 pr-8">
                    <h2 className="mb-2 font-display text-xl font-bold tracking-tight transition-colors group-hover:text-accent-blue">
                      {post.title}
                    </h2>
                    <p className="mb-2 text-sm text-(--muted)">{post.excerpt}</p>
                    <div className="flex items-center gap-3">
                      {post.date && (
                        <span className="text-xs text-(--muted)/60" title={formatDate(post.date)}>
                          {formatRelativeDate(post.date)}
                        </span>
                      )}
                      <span className="text-xs text-(--muted)/60">·</span>
                      <span className="text-xs text-(--muted)/60">{post.readingTime}</span>
                    </div>
                  </Link>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-(--muted) transition-all group-hover:translate-x-1 group-hover:text-accent-blue" />
                </div>
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 3).map((t) => (
                      <Link
                        key={t}
                        href={tag === t ? "/blog" : `/blog?tag=${encodeURIComponent(t)}`}
                        className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                          tag === t
                            ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                            : "border-(--border) bg-(--surface) text-(--muted)/70 hover:border-accent-blue/30 hover:text-(--foreground)"
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
