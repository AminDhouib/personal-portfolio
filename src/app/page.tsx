import { GeometricBackgroundLoader } from "@/components/three/loader";
import { BackgroundFX } from "@/components/three/background-fx";
import {
  Hero,
  ProofBar,
  Work,
  Services,
  Reviews,
  OpenSource,
  Background,
  Experience,
  Game,
  Blog,
  BeyondCode,
  Faq,
  Contact,
} from "@/components/sections";
import { fetchAllMAU } from "@/lib/ga4";
import { combinedMonthlyUsers, usersFloorInThousands } from "@/lib/user-reach";
import { fetchRepoStats, fetchContributionGraph, type RepoStats } from "@/lib/github";
import { getAllBlogPosts } from "@/lib/blog";
import { ossProjects } from "@/data/oss-projects";
import { faqs } from "@/data/faq";
import { projects } from "@/data/projects";
import {
  faqPageNode,
  graph,
  profilePageNode,
  projectListNode,
  serializeJsonLd,
} from "@/lib/structured-data";

// ISR: revalidate every 24h for live MAU + GitHub data
export const revalidate = 86400;

const SITE_ORIGIN = "https://amindhou.com";

export const metadata = {
  alternates: {
    canonical: SITE_ORIGIN,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
};

export default async function Home() {
  const [mauData, ossRepoStats, contributions] = await Promise.all([
    fetchAllMAU(),
    Promise.all(ossProjects.map((p) => fetchRepoStats(p.owner, p.repo))),
    fetchContributionGraph("AminDhouib"),
  ]);
  const ossStats: Record<string, RepoStats | null> = Object.fromEntries(
    ossProjects.map((p, i) => [p.key, ossRepoStats[i] ?? null]),
  );
  const blogPosts = getAllBlogPosts();
  const jsonLd = graph(profilePageNode(), projectListNode(projects), faqPageNode(faqs));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <GeometricBackgroundLoader />
      <BackgroundFX />
      <main className="relative z-10">
        <Hero />
        <ProofBar usersK={usersFloorInThousands(combinedMonthlyUsers(mauData))} />
        <Work mauData={mauData} />
        <OpenSource stats={ossStats} contributions={contributions} />
        <Services />
        <Reviews />
        <Background />
        <Experience />
        <Game />
        <Blog posts={blogPosts} />
        <BeyondCode />
        <Faq faqs={faqs} />
        <Contact />
      </main>
    </>
  );
}
