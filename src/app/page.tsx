import { GeometricBackgroundLoader } from "@/components/three/loader";
import { Navbar } from "@/components/navbar";
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

export default function Home() {
  return (
    <>
      <GeometricBackgroundLoader />
      <Navbar />
      <main className="relative z-10">
        <Hero />
        <ProofBar />
        <Work />
        <Services />
        <Reviews />
        <OpenSource />
        <Background />
        <Game />
        <Blog />
        <BeyondCode />
        <Contact />
      </main>
    </>
  );
}
