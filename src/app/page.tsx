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
import { combinedMonthlyUsers, formatUsersFloor, usersFloorInThousands } from "@/lib/user-reach";
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

// The build prerender has no GA4 or GitHub credentials, so it bakes mauFallback and
// unauthenticated GitHub data. Five minutes is shorter than the gap between that build and
// the first request of the container it ships in, so that request serves the baked page and
// regenerates it in the background with the runtime env. The GA4 reading and the GitHub
// fetches keep their own 24h caches, so the short clock costs renders, not upstream calls.
// See DESIGN.md.
export const revalidate = 300;

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
  // One figure for the hero Users stat and the experience bullet.
  const combinedUsers = combinedMonthlyUsers(mauData);
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
        <ProofBar usersK={usersFloorInThousands(combinedUsers)} />
        <Work mauData={mauData} />
        <OpenSource stats={ossStats} contributions={contributions} />
        <Services />
        <Reviews />
        <Background />
        <Experience combinedUsers={formatUsersFloor(combinedUsers)} />
        <Game />
        <Blog posts={blogPosts} />
        <BeyondCode />
        <Faq faqs={faqs} />
        <Contact />
      </main>
    </>
  );
}
