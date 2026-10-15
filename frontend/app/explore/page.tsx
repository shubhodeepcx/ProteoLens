import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { ExploreView } from "./explore-view";

export const metadata = {
  title: "Central Dogma Explorer | ProteoLens",
  description:
    "Follow one disease variant from its chromosome to the gene, the DNA double helix, the mRNA and the protein, then into the 3D structure.",
};

/**
 * `/explore?scenario=sickle-cell` or `/explore?gene=BRAF&change=V600E`.
 *
 * A server shell around a client view, like `/compare`: the view reads the
 * query string with `useSearchParams`, which needs the Suspense boundary.
 */
export default function ExplorePage() {
  return (
    <div className="dark flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </Link>
        <span className="h-5 w-px bg-zinc-800" aria-hidden />
        <ProteoLensLogo className="size-4" />
        <h1 className="text-sm font-semibold tracking-tight">
          Central Dogma Explorer
        </h1>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Chromosome · Gene · DNA · mRNA · Protein
        </span>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Loader2
              className="size-5 animate-spin text-zinc-600"
              aria-hidden
            />
          </div>
        }
      >
        <ExploreView />
      </Suspense>
    </div>
  );
}
