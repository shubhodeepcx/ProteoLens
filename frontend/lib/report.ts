import type { AnalyticsResponse, ProteinSummary } from "@/lib/types";

/**
 * Pure helpers behind the report page (spec F9): the CSV and JSON exports,
 * and the hand-off of a viewer snapshot from `/viewer/<id>` to `/report/<id>`.
 */

/** sessionStorage key for the 3D snapshot the viewer takes before opening the report. */
export function snapshotKey(id: string): string {
  return `proteolens:snapshot:${id}`;
}

/** Store a snapshot for the report page. Storage can be missing or full; never throws. */
export function saveSnapshot(id: string, dataUri: string): void {
  try {
    sessionStorage.setItem(snapshotKey(id), dataUri);
  } catch {
    // Private mode or quota: the report renders without a picture.
  }
}

export function loadSnapshot(id: string): string | null {
  try {
    return sessionStorage.getItem(snapshotKey(id));
  } catch {
    return null;
  }
}

/** RFC 4180 quoting: a field with a comma, quote or newline is wrapped and its quotes doubled. */
export function csvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
}

/** Amino-acid composition, one row per residue type. */
export function compositionCsv(analytics: AnalyticsResponse): string {
  return toCsv([
    ["amino_acid", "name", "count", "percent"],
    ...analytics.composition.map((e) => [e.aa, e.label, e.count, e.percent]),
  ]);
}

/**
 * Kyte-Doolittle profile, one row per window centre. The first value sits at
 * the centre of the first full window, i.e. position (window + 1) / 2.
 */
export function hydrophobicityCsv(analytics: AnalyticsResponse): string {
  const { chain_id, window, values } = analytics.hydrophobicity;
  const offset = Math.floor(window / 2) + 1;
  return toCsv([
    ["chain", "position", "kyte_doolittle", "window"],
    ...values.map((v, i) => [chain_id, i + offset, v, window]),
  ]);
}

/** Everything the report shows, as one JSON document. */
export function reportJson(
  summary: ProteinSummary,
  analytics: AnalyticsResponse | null,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify(
    { generated_by: "ProteoLens", protein: summary, analytics, ...extra },
    null,
    2,
  );
}

/** Safe file stem: the source id when there is one, else the uid. */
export function fileStem(summary: ProteinSummary): string {
  return (summary.source_id ?? summary.id).replace(/[^A-Za-z0-9._-]/g, "_");
}

/** Trigger a browser download of `text`. */
export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * A sequence as FASTA-style lines of `perLine` residues in groups of ten,
 * each line led by the 1-based position of its first residue.
 */
export function sequenceLines(
  sequence: string,
  perLine = 60,
): { start: number; text: string }[] {
  const lines: { start: number; text: string }[] = [];
  for (let i = 0; i < sequence.length; i += perLine) {
    const chunk = sequence.slice(i, i + perLine);
    const groups = chunk.match(/.{1,10}/g) ?? [];
    lines.push({ start: i + 1, text: groups.join(" ") });
  }
  return lines;
}
