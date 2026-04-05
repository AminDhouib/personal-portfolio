import Link from "next/link";
import { ArrowLeft, Clock, Tag } from "lucide-react";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import { getBlogPost, getAllBlogSlugs, formatDate } from "@/lib/blog";
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

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        {/* Header */}
        <header className="mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mb-4">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-(--muted)">
            {post.date && (
              <span>{formatDate(post.date)}</span>
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
          </div>
          <div className="mt-6 h-px bg-gradient-to-r from-accent-blue/50 via-accent-blue/20 to-transparent" />
        </header>

        {/* MDX Content */}
        <article className="prose max-w-none">
          <MDXRemote
            source={post.content}
            options={{
              mdxOptions: {
                rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
              },
            }}
          />
        </article>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-(--border)">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All posts
          </Link>
        </div>
      </div>
    </div>
  );
}

