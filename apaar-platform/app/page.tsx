import CircuitHero from "./components/CircuitHero";
import Footer from "./components/Footer";
import HowItWorks from "./components/HowItWorks";
import Navbar from "./components/Navbar";
import { I18nProvider } from "./components/portal/I18n";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";

export default async function Home() {
  const lang = await currentLang();
  return (
    <I18nProvider lang={lang}>
      <a href="#main-content" className="sr-only rounded-xl bg-paper px-4 py-2 text-sm font-semibold text-deep focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">{translate(lang, "a11y.skip")}</a>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1600px] p-3 outline-none sm:p-5">
        <CircuitHero />
        {/* The hero's example cards overhang into this block, hence the generous top padding. */}
        <div className="rounded-b-[28px] bg-deep pt-16 lg:pt-44">
          <HowItWorks />
          <Footer />
        </div>
      </main>
    </I18nProvider>
  );
}
