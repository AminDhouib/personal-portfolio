import Link from "next/link";
import { ArrowLeft, Clock, Tag } from "lucide-react";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { getBlogPost, getAllBlogSlugs, extractToc } from "@/lib/blog";
import { formatDate, formatRelativeDate } from "@/lib/date-utils";
import { ShareButton, TableOfContents } from "@/components/blog/toc-share";
import type { Options } from "rehype-pretty-code";

export async function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Amin Dhouib`,
    description: post.excerpt,
  };
}

const prettyCodeOptions: Options = {
  theme: "github-dark-dimmed",
  keepBackground: false,
};

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const toc = extractToc(post.content);

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        {/* Header — full width */}
        <header className="mb-10 max-w-3xl">
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mb-4">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-(--muted)">
            {post.date && (
                    <span title={formatDate(post.date)}>
                      {formatRelativeDate(post.date)}
                    </span>
                  )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {post.readingTime}
            </span>
            {post.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5" />
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-(--surface) border border-(--border) px-2.5 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="ml-auto">
              <ShareButton title={post.title} />
            </div>
          </div>
          <div className="mt-6 h-px bg-gradient-to-r from-accent-blue/50 via-accent-blue/20 to-transparent" />
        </header>

        {/* Two-column layout: article + ToC */}
        <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
          {/* MDX Content */}
          <article className="prose max-w-none min-w-0">
            <MDXRemote
              source={post.content}
              options={{
                mdxOptions: {
                  rehypePlugins: [
                    rehypeSlug,
                    [rehypeAutolinkHeadings, { behavior: "wrap" }],
                    [rehypePrettyCode, prettyCodeOptions],
                  ],
                },
              }}
            />
          </article>

          {/* Sticky ToC sidebar */}
          <TableOfContents entries={toc} />
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-(--border) flex items-center justify-between">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All posts
          </Link>
          <ShareButton title={post.title} />
        </div>
      </div>
    </div>
  );
}

