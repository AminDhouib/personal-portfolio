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
        <article className="prose prose-neutral dark:prose-invert max-w-none
          prose-headings:font-display prose-headings:tracking-tight
          prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4
          prose-h3:text-xl prose-h3:font-semibold
          prose-p:text-base prose-p:leading-relaxed prose-p:text-(--foreground)
          prose-a:text-accent-blue prose-a:no-underline hover:prose-a:underline
          prose-strong:text-(--foreground)
          prose-code:rounded prose-code:bg-(--surface) prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:text-accent-green prose-code:before:content-none prose-code:after:content-none
          prose-pre:rounded-xl prose-pre:border prose-pre:border-(--border) prose-pre:bg-(--card) prose-pre:p-4
          prose-blockquote:border-l-accent-blue prose-blockquote:text-(--muted)
          prose-hr:border-(--border)
          prose-li:text-(--foreground)">
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

