"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { apiGet } from "@/lib/api";
import { fileStem, loadSnapshot } from "@/lib/report";
import type { AnalyticsResponse, ProteinAnnotations, ProteinSummary } from "@/lib/types";
import { AnalyticsSection, BiologySection, Facts, Section, SequencesSection } from "./report-sections";
import { ReportToolbar } from "./report-toolbar";

/**
 * F9 — a printable one-protein report: what the structure is, its analytics,
 * and (when UniProt resolves) its biology, with the 3D view the user was
 * looking at. "Save as PDF" is the browser's own print-to-PDF, so the PDF is
 * exactly this page and needs no server-side renderer.
 *
 * The page is laid out as paper (white, A4 width) whatever the app theme,
 * because that is what it will become.
 */

interface ReportData {
  summary: ProteinSummary;
  analytics: AnalyticsResponse | null;
  annotations: ProteinAnnotations | null;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [generated] = useState(() => new Date());

  useEffect(() => {
    if (!id) return;
    setSnapshot(loadSnapshot(id));
    let cancelled = false;
    (async () => {
      try {
        const summary = await apiGet<ProteinSummary>(`/api/proteins/${id}`);
        const [analytics, annotations] = await Promise.all([
          apiGet<AnalyticsResponse>(`/api/proteins/${id}/analytics`).catch(() => null),
          apiGet<ProteinAnnotations>(`/api/proteins/${id}/annotations`).catch(() => null),
        ]);
        if (!cancelled) setData({ summary, analytics, annotations });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this protein");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm">
        <p role="alert" className="text-red-600">{error}</p>
        <Link href="/" className="mt-4 inline-block text-primary underline">Back to ProteoLens</Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Building report&hellip;
      </main>
    );
  }

  const { summary, analytics, annotations } = data;
  const stem = fileStem(summary);
  const title = summary.name ?? annotations?.protein_name ?? summary.source_id ?? "Uploaded structure";
  const biology = annotations?.accession_resolved ? annotations : null;

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <ReportToolbar id={id} stem={stem} summary={summary} analytics={analytics} annotations={annotations} />

      <article
        data-testid="report"
        className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="flex items-start gap-3 border-b-2 border-neutral-900 pb-3">
          <ProteoLensLogo className="mt-1 size-7" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] tracking-wide text-neutral-500 uppercase">ProteoLens structure report</p>
            <h1 className="text-xl leading-tight font-semibold">{title}</h1>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {summary.source_id ? `${summary.source_id} · ` : ""}
              {summary.source} · generated {generated.toLocaleString()}
            </p>
          </div>
        </header>

        <Section title="Structure">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr] print:grid-cols-2">
            {snapshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={snapshot}
                alt={`3D view of ${title}`}
                className="w-full rounded border border-neutral-200 bg-neutral-50 object-contain"
              />
            ) : (
              <p className="rounded border border-dashed border-neutral-300 p-4 text-[11px] text-neutral-500">
                Open this report from the viewer&apos;s Report button to include a snapshot of the
                3D view.
              </p>
            )}
            <Facts
              rows={[
                ["Organism", summary.organism ?? biology?.organism ?? null],
                ["Source", summary.source_id ? `${summary.source} ${summary.source_id}` : summary.source],
                ["UniProt", biology?.accession ?? null],
                ["File format", summary.file_format.toUpperCase()],
                ["Protein chains", summary.chains.length],
                ["Residues", summary.residue_count],
                ["Atoms", summary.atom_count],
                ["Molecular weight", `${summary.molecular_weight.toFixed(0)} Da`],
                ["B-factor column", summary.has_plddt ? "pLDDT confidence" : "Temperature factors"],
              ]}
            />
          </div>
        </Section>

        {biology && <BiologySection biology={biology} />}

        {analytics && <AnalyticsSection analytics={analytics} />}

        <SequencesSection chains={summary.chains} />

        <footer className="mt-8 border-t border-neutral-200 pt-2 text-[10px] leading-relaxed text-neutral-500">
          Generated by ProteoLens from the stored structure file
          {biology ? ` and UniProt entry ${biology.accession}` : ""}. Analytics are computed from the
          coordinates; secondary structure comes from the file&apos;s own records when present.
        </footer>
      </article>
    </div>
  );
}
