import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { CompareView } from "./compare-view";

export const metadata = {
  title: "Compare structures | ProteoLens",
  description:
    "Compare two protein structures side by side: metrics, composition, secondary structure, sequence alignment, and RMSD.",
};

/**
 * `/compare?a={id}&b={id}` — spec A3.
 *
 * A server shell around a client view, matching `/search`. `CompareView` reads
 * the two ids from the query string with `useSearchParams`, which suspends
 * during prerender, so the Suspense boundary is required rather than defensive.
 */
export default function ComparePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </Link>
        <span className="h-5 w-px bg-muted" aria-hidden />
        <ProteoLensLogo className="size-4" />
        <h1 className="text-sm font-semibold tracking-tight">Compare structures</h1>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Metrics · Alignment · RMSD
        </span>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground/70" aria-hidden />
          </div>
        }
      >
        <CompareView />
      </Suspense>
    </div>
  );
}
