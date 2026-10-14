import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { SearchView } from "./search-view";

export const metadata = {
  title: "Search databases | ProteoLens",
  description: "Search RCSB PDB, AlphaFold DB, and UniProt, and import a structure.",
};

export default function SearchPage() {
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
        <h1 className="text-sm font-semibold tracking-tight">Database search</h1>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          RCSB · AlphaFold · UniProt
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <SearchView />
      </main>
    </div>
  );
}
