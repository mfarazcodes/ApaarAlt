import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PortalStub({ title, blurb }: { title: string; blurb: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-deep px-6 text-center text-white">
      <div className="max-w-md">
        <h1 className="text-4xl tracking-[-0.04em]">{title}</h1>
        <p className="mt-4 text-white/60">{blurb}</p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-paper px-5 py-3 text-sm font-semibold text-deep"
        >
          <ArrowLeft width={16} height={16} className="h-4 w-4 shrink-0" />
          Back to APAAR Bridge
        </Link>
      </div>
    </main>
  );
}
