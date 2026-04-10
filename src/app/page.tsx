import { GeometricBackgroundLoader } from "@/components/three/loader";
import {
  Hero,
  ProofBar,
  Work,
  Services,
  Reviews,
  OpenSource,
  Background,
  Game,
  Blog,
  BeyondCode,
  Contact,
} from "@/components/sections";
import { fetchAllMAU } from "@/lib/ga4";
import { fetchRepoStats, fetchContributionGraph } from "@/lib/github";
import { getAllBlogPosts } from "@/lib/blog";

// ISR: revalidate every 24h for live MAU + GitHub data
export const revalidate = 86400;

export default async function Home() {
  const [mauData, caramelStats, upupStats, contributions] = await Promise.all([
    fetchAllMAU(),
    fetchRepoStats("DevinoSolutions", "caramel"),
    fetchRepoStats("DevinoSolutions", "upup"),
    fetchContributionGraph("AminDhouib"),
  ]);
  const blogPosts = getAllBlogPosts();

  return (
    <>
      <GeometricBackgroundLoader />
      <main className="relative z-10">
        <Hero />
        <ProofBar />
        <Work mauData={mauData} />
        <Services />
        <Reviews />
        <OpenSource
          caramelStats={caramelStats}
          upupStats={upupStats}
          contributions={contributions}
        />
        <Background />
        <Game />
        <Blog posts={blogPosts} />
        <BeyondCode />
        <Contact />
      </main>
    </>
  );
}
