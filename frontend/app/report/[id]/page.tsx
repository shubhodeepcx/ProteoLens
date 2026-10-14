"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileJson, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { ProteoLensLogo } from "@/components/logo";
import { CompositionBarChart } from "@/components/charts/composition-bar-chart";
import { HydrophobicityLineChart } from "@/components/charts/hydrophobicity-line-chart";
import { SecondaryStructureDonut } from "@/components/charts/secondary-structure-donut";
import { apiGet } from "@/lib/api";
import {
  compositionCsv,
  download,
  fileStem,
  hydrophobicityCsv,
  loadSnapshot,
  reportJson,
  sequenceLines,
} from "@/lib/report";
import type { AnalyticsResponse, ProteinAnnotations, ProteinSummary } from "@/lib/types";

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

function Facts({ rows }: { rows: [string, string | number | null][] }) {
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {rows
          .filter(([, value]) => value !== null && value !== "")
          .map(([label, value]) => (
            <tr key={label} className="border-b border-neutral-200">
              <th scope="row" className="w-40 py-1 pr-3 text-left font-medium text-neutral-500">
                {label}
              </th>
              <td className="py-1 text-neutral-900">{value}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 pt-6">
      <h2 className="border-b border-neutral-300 pb-1 text-[13px] font-semibold tracking-wide text-neutral-900 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
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
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 text-xs">
        <Link href={`/viewer/${id}`} className="inline-flex items-center gap-1 text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="size-3.5" aria-hidden /> Back to viewer
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          >
            <Printer className="size-3.5" aria-hidden /> Print or save as PDF
          </button>
          <button
            type="button"
            onClick={() =>
              download(`${stem}-proteolens.json`, reportJson(summary, analytics, { annotations }), "application/json")
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-800"
          >
            <FileJson className="size-3.5" aria-hidden /> JSON
          </button>
          {analytics && (
            <>
              <button
                type="button"
                onClick={() => download(`${stem}-composition.csv`, compositionCsv(analytics), "text/csv")}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-800"
              >
                <FileSpreadsheet className="size-3.5" aria-hidden /> Composition CSV
              </button>
              <button
                type="button"
                onClick={() => download(`${stem}-hydropathy.csv`, hydrophobicityCsv(analytics), "text/csv")}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-800"
              >
                <FileSpreadsheet className="size-3.5" aria-hidden /> Hydropathy CSV
              </button>
            </>
          )}
        </div>
      </div>

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

        {biology && (
          <Section title="Biology (UniProt)">
            <Facts
              rows={[
                ["Protein", biology.protein_name],
                ["Genes", biology.gene_names.join(", ") || null],
                ["Location", biology.subcellular_locations.map((l) => l.location).join(", ") || null],
                ["EC numbers", biology.catalytic_activity.map((c) => c.ec_number).filter(Boolean).join(", ") || null],
              ]}
            />
            {biology.function.length > 0 && (
              <p className="text-[12px] leading-relaxed text-neutral-800">{biology.function.join(" ")}</p>
            )}
            {biology.diseases.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-[12px] font-semibold">Disease associations</h3>
                <ul className="list-disc space-y-1 pl-5 text-[12px] text-neutral-800">
                  {biology.diseases.map((d) => (
                    <li key={d.name}>
                      <span className="font-medium">{d.name}</span>
                      {d.mim_id ? ` (MIM ${d.mim_id})` : ""}
                      {d.description ? `: ${d.description}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {analytics && (
          <Section title="Analytics">
            <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
              <div className="break-inside-avoid">
                <h3 className="mb-1 text-[12px] font-semibold">Amino-acid composition</h3>
                <CompositionBarChart data={analytics.composition} />
              </div>
              <div className="break-inside-avoid">
                <h3 className="mb-1 text-[12px] font-semibold">Secondary structure</h3>
                <SecondaryStructureDonut data={analytics.secondary_structure} />
              </div>
            </div>
            <div className="break-inside-avoid">
              <h3 className="mb-1 text-[12px] font-semibold">
                Hydropathy, chain {analytics.hydrophobicity.chain_id} (Kyte-Doolittle, window{" "}
                {analytics.hydrophobicity.window})
              </h3>
              <HydrophobicityLineChart data={analytics.hydrophobicity} />
            </div>
          </Section>
        )}

        <Section title="Sequences">
          {summary.chains.map((chain) => (
            <div key={chain.label} className="break-inside-avoid space-y-1">
              <h3 className="text-[12px] font-semibold">
                Chain {chain.label} · {chain.sequence.length} residues
              </h3>
              <pre className="font-mono text-[10.5px] leading-snug whitespace-pre-wrap text-neutral-800">
                {sequenceLines(chain.sequence)
                  .map((line) => `${String(line.start).padStart(5)}  ${line.text}`)
                  .join("\n")}
              </pre>
            </div>
          ))}
        </Section>

        <footer className="mt-8 border-t border-neutral-200 pt-2 text-[10px] leading-relaxed text-neutral-500">
          Generated by ProteoLens from the stored structure file
          {biology ? ` and UniProt entry ${biology.accession}` : ""}. Analytics are computed from the
          coordinates; secondary structure comes from the file&apos;s own records when present.
        </footer>
      </article>
    </div>
  );
}
