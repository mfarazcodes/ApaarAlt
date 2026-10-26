import ArchitectureFlow from "./components/ArchitectureFlow";
import CircuitHero from "./components/CircuitHero";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import SatinFeaturePanel from "./components/SatinFeaturePanel";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-[1600px] p-3 sm:p-5">
        <CircuitHero />
        {/* The hero's dashboard cards overhang into this block, hence the generous top padding. */}
        <div className="rounded-b-[28px] bg-deep pt-16 lg:pt-44">
          <SatinFeaturePanel />
          <ArchitectureFlow />
          <Footer />
        </div>
      </main>
    </>
  );
}
