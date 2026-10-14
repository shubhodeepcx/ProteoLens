import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { ToolsView } from "./tools-view";

export const metadata = {
  title: "Sequence tools | ProteoLens",
  description: "ORF finder, restriction map, PCR primers and CRISPR guide design for a DNA sequence.",
};

export default function ToolsPage() {
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
        <span className="h-5 w-px bg-border" aria-hidden />
        <ProteoLensLogo className="size-4" />
        <h1 className="text-sm font-semibold tracking-tight">Sequence tools</h1>
        <span className="ml-auto hidden text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:inline">
          ORFs · Restriction · Primers · CRISPR
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <ToolsView />
      </main>
    </div>
  );
}
