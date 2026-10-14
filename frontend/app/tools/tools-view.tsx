"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countBases, exampleSequence, runAllTools, type ToolResults } from "@/lib/seqtools";
import { CrisprResults, OrfResults, PrimerResults, RestrictionResults } from "./tool-results";

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const detail =
      typeof e.body === "object" && e.body !== null ? (e.body.detail as unknown) : null;
    if (typeof detail === "string") return detail;
    return `The tools request failed (${e.status}).`;
  }
  return e instanceof Error ? e.message : String(e);
}

const INPUT =
  "h-8 rounded-md border border-input bg-background px-2 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function parsePosition(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * P14 sequence tools. One sequence in, four analyses out: the ORF finder,
 * restriction map, PCR primer design and SpCas9 guide design all read the
 * same input and the same optional target region.
 */
export function ToolsView() {
  const [sequence, setSequence] = useState("");
  const [circular, setCircular] = useState(false);
  const [targetStart, setTargetStart] = useState("");
  const [targetEnd, setTargetEnd] = useState("");
  const [minCodons, setMinCodons] = useState("30");
  const [results, setResults] = useState<ToolResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const bases = countBases(sequence);

  async function run() {
    const mine = ++seq.current;
    if (!bases) {
      setError("Paste a DNA sequence or load the example first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await runAllTools({
        sequence,
        circular,
        targetStart: parsePosition(targetStart),
        targetEnd: parsePosition(targetEnd),
        minCodons: Math.max(5, parsePosition(minCodons) ?? 30),
      });
      if (mine === seq.current) setResults(data);
    } catch (e) {
      if (mine === seq.current) {
        setError(errorMessage(e));
        setResults(null);
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  const length = results?.orfs.stats.length ?? 0;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="dna" className="text-xs font-semibold">
            DNA sequence <span className="font-normal text-muted-foreground">(plain or FASTA)</span>
          </label>
          <span className="text-[11px] text-muted-foreground tabular-nums">{bases.toLocaleString("en-US")} nt</span>
        </div>
        <textarea
          id="dna"
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
          spellCheck={false}
          rows={6}
          placeholder={">my_construct\nATGGCTAAAGAGCTGTTC..."}
          className="w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-[11px] leading-relaxed focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Target start</span>
            <input aria-label="Target start" inputMode="numeric" className={`${INPUT} w-24`} value={targetStart} onChange={(e) => setTargetStart(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Target end</span>
            <input aria-label="Target end" inputMode="numeric" className={`${INPUT} w-24`} value={targetEnd} onChange={(e) => setTargetEnd(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Min ORF (codons)</span>
            <input aria-label="Minimum ORF length in codons" inputMode="numeric" className={`${INPUT} w-24`} value={minCodons} onChange={(e) => setMinCodons(e.target.value)} />
          </label>
          <label className="flex h-8 items-center gap-2">
            <input type="checkbox" checked={circular} onChange={(e) => setCircular(e.target.checked)} />
            Circular (plasmid)
          </label>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSequence(exampleSequence());
                setTargetStart("");
                setTargetEnd("");
              }}
            >
              Load example
            </Button>
            <Button type="button" size="sm" onClick={() => void run()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              Analyse
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The target region steers primer and guide design: primers flank it, guides cut inside it. Leave it blank to use the whole sequence.
        </p>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {results && (
        <Tabs defaultValue="orfs" className="gap-3">
          <TabsList>
            <TabsTrigger value="orfs" className="text-xs">ORFs ({results.orfs.orfs.length})</TabsTrigger>
            <TabsTrigger value="restriction" className="text-xs">Restriction ({results.restriction.unique_cutters.length} unique)</TabsTrigger>
            <TabsTrigger value="primers" className="text-xs">Primers ({results.primers.pairs.length})</TabsTrigger>
            <TabsTrigger value="crispr" className="text-xs">CRISPR ({results.crispr.guides.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="orfs"><OrfResults data={results.orfs} /></TabsContent>
          <TabsContent value="restriction"><RestrictionResults data={results.restriction} /></TabsContent>
          <TabsContent value="primers"><PrimerResults data={results.primers} length={length} /></TabsContent>
          <TabsContent value="crispr"><CrisprResults data={results.crispr} length={length} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
