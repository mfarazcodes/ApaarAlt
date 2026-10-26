import ArchitectureFlow from "./components/ArchitectureFlow";
import CircuitHero from "./components/CircuitHero";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import SatinFeaturePanel from "./components/SatinFeaturePanel";

export default function Home() {
  return (
    <>
      <a href="#main-content" className="sr-only rounded-xl bg-paper px-4 py-2 text-sm font-semibold text-deep focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">Skip to content</a>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1600px] p-3 outline-none sm:p-5">
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
