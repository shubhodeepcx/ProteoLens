import Link from "next/link";
import { Database, Dna, Search, Upload } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { HealthPill } from "@/components/health-pill";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/** The landing page's top bar: brand, search entry point and route buttons. */
export function LandingHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        <ProteoLensLogo className="size-6 drop-shadow-[0_0_6px_rgba(129,140,248,0.5)]" />
        <span className="font-heading text-lg font-semibold tracking-tight">
          ProteoLens
        </span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex max-w-xl flex-1 items-center">
        {/* Entry point to the P5 database search page. */}
        <Link
          href="/search"
          className="relative flex h-8 w-full items-center rounded-md border border-input bg-muted/40 pr-3 pl-8 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          Search RCSB PDB, AlphaFold DB, or UniProt&hellip;
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <HealthPill />
        <Link
          href="/explore"
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          <Dna aria-hidden />
          Explore DNA
        </Link>
        <Link
          href="/tools"
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          <Dna aria-hidden />
          DNA tools
        </Link>
        <Link
          href="/search"
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          <Database aria-hidden />
          Databases
        </Link>
        <Link href="#upload" className={buttonVariants({ size: "sm" })}>
          <Upload aria-hidden />
          Upload
        </Link>
      </div>
    </header>
  );
}
