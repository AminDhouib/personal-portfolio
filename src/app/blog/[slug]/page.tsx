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
import type { Metadata } from "next";
import type { Options } from "rehype-pretty-code";

export async function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

const SITE_ORIGIN = "https://amindhou.com";

function toIsoDate(date: string): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const url = `${SITE_ORIGIN}/blog/${slug}`;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
    openGraph: {
      type: "article",
      publishedTime: toIsoDate(post.date),
      url,
      title: post.title,
      description: post.excerpt,
      siteName: "Amin Dhouib",
      locale: "en_US",
    },
  };
}

const prettyCodeOptions: Options = {
  theme: "github-dark-dimmed",
  keepBackground: false,
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const toc = extractToc(post.content);

  const url = `${SITE_ORIGIN}/blog/${slug}`;
  const publishedTime = toIsoDate(post.date);
  const blogPostingLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: publishedTime,
    dateModified: publishedTime,
    author: { "@id": "https://amindhou.com/#person" },
    publisher: { "@id": "https://amindhou.com/#person" },
    url,
    mainEntityOfPage: url,
    // Extensionless on purpose: the file-convention route (opengraph-image.tsx in
    // this segment) serves /opengraph-image; the .png-suffixed path 404s.
    image: `${SITE_ORIGIN}/blog/${slug}/opengraph-image`,
    keywords: post.tags,
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(blogPostingLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        {/* Header — full width */}
        <header className="mb-10 max-w-3xl">
          <h1 className="mb-4 font-display text-3xl font-black tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-(--muted)">
            {post.date && (
              <span title={formatDate(post.date)}>{formatRelativeDate(post.date)}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {post.readingTime}
            </span>
            {post.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5" />
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/blog?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-(--border) bg-(--surface) px-2.5 py-0.5 text-xs transition-colors hover:border-accent-blue/30 hover:text-(--foreground)"
                  >
                    {tag}
                  </Link>
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
        <div className="mt-16 flex items-center justify-between border-t border-(--border) pt-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
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
