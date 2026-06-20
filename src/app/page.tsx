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
  const [
    mauData,
    caramelStats,
    upupStats,
    stealthStats,
    notifierStats,
    contributions,
  ] = await Promise.all([
    fetchAllMAU(),
    fetchRepoStats("DevinoSolutions", "caramel"),
    fetchRepoStats("DevinoSolutions", "upup"),
    fetchRepoStats("DevinoSolutions", "stealth-chrome-devtools-mcp"),
    fetchRepoStats("DevinoSolutions", "ai-agent-notifier"),
    fetchContributionGraph("AminDhouib"),
  ]);
  const blogPosts = getAllBlogPosts();

  return (
    <>
      <GeometricBackgroundLoader />
      <BackgroundFX />
      <main className="relative z-10">
        <Hero />
        <ProofBar />
        <Work mauData={mauData} />
        <OpenSource
          caramelStats={caramelStats}
          upupStats={upupStats}
          stealthStats={stealthStats}
          notifierStats={notifierStats}
          contributions={contributions}
        />
        <Services />
        <Reviews />
        <Background />
        <Game />
        <Blog posts={blogPosts} />
        <BeyondCode />
        <Contact />
      </main>
    </>
  );
}
