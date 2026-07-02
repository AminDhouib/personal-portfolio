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
  Contact,
} from "@/components/sections";
import { fetchAllMAU } from "@/lib/ga4";
import { fetchRepoStats, fetchContributionGraph, type RepoStats } from "@/lib/github";
import { getAllBlogPosts } from "@/lib/blog";
import { ossProjects } from "@/data/oss-projects";

// ISR: revalidate every 24h for live MAU + GitHub data
export const revalidate = 86400;

export default async function Home() {
  const [mauData, ossRepoStats, contributions] = await Promise.all([
    fetchAllMAU(),
    Promise.all(ossProjects.map((p) => fetchRepoStats(p.owner, p.repo))),
    fetchContributionGraph("AminDhouib"),
  ]);
  const ossStats: Record<string, RepoStats | null> = Object.fromEntries(
    ossProjects.map((p, i) => [p.key, ossRepoStats[i]]),
  );
  const blogPosts = getAllBlogPosts();

  return (
    <>
      <GeometricBackgroundLoader />
      <BackgroundFX />
      <main className="relative z-10">
        <Hero />
        <ProofBar />
        <Work mauData={mauData} />
        <OpenSource stats={ossStats} contributions={contributions} />
        <Services />
        <Reviews />
        <Background />
        <Experience />
        <Game />
        <Blog posts={blogPosts} />
        <BeyondCode />
        <Contact />
      </main>
    </>
  );
}
