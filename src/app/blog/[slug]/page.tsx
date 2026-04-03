import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

const blogContent: Record<string, { title: string; content: string }> = {
  "self-hosting-home-server": {
    title: "How I Self-Host Everything on a Home Server with 99.99% Uptime",
    content:
      "This post is coming soon. It will cover the full architecture of running Docker Swarm on a home server using Dokploy, with Tailscale for mesh networking and Cloudflare tunnels for public access.",
  },
  "caramel-open-source-story": {
    title: "Building an Open-Source Honey Alternative: The Caramel Story",
    content:
      "This post is coming soon. It will tell the story of why Caramel was built, how the extension works under the hood, and the lessons from shipping open-source software.",
  },
  "ai-agents-dev-workflow": {
    title: "Why I Use AI Agents to Automate My Entire Dev Workflow",
    content:
      "This post is coming soon. It will explore how AI-powered agents handle code reviews, deployments, testing, and more in my daily workflow.",
  },
};

const slugs = Object.keys(blogContent);

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = blogContent[slug];
  if (!post) return {};
  return {
    title: `${post.title} — Amin Dhouib`,
    description: post.content.slice(0, 155),
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = blogContent[slug];
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

        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mb-8">
          {post.title}
        </h1>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          <p className="text-lg text-(--muted) leading-relaxed">
            {post.content}
          </p>
        </div>
      </div>
    </div>
  );
}
