"use client";

import Link from "next/link";
import { ArrowLeft, FileJson, FileSpreadsheet, Printer } from "lucide-react";
import { compositionCsv, download, hydrophobicityCsv, reportJson } from "@/lib/report";
import type { AnalyticsResponse, ProteinAnnotations, ProteinSummary } from "@/lib/types";

/** Screen-only actions above the paper: back, print, and the data downloads. */
export function ReportToolbar({
  id,
  stem,
  summary,
  analytics,
  annotations,
}: {
  id: string;
  stem: string;
  summary: ProteinSummary;
  analytics: AnalyticsResponse | null;
  annotations: ProteinAnnotations | null;
}) {
  return (
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
  );
}
