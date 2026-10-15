/**
 * Pure helpers for the Central Dogma Explorer: band colours, the gene drawn
 * 5'→3', the codon window split into codons, transcription, and the query
 * string for a request. No React, so all of it is unit-tested.
 */
import type { Band, CodingWindow, GeneLocus } from "@/lib/explorer-types";

export const LEVELS = [
  { id: "genome", label: "Genome" },
  { id: "locus", label: "Gene" },
  { id: "helix", label: "DNA" },
  { id: "translation", label: "mRNA → protein" },
  { id: "protein", label: "3D protein" },
] as const;
export type LevelId = (typeof LEVELS)[number]["id"];

/** Giemsa stain → fill. Dark bands are AT-rich and gene-poor. */
export function bandFill(stain: string): string {
  if (stain === "acen") return "#f43f5e";
  if (stain === "gvar" || stain === "stalk") return "#64748b";
  const m = /^gpos(\d+)?$/.exec(stain);
  if (m) {
    const depth = Number(m[1] ?? 100) / 100;
    const level = Math.round(212 - depth * 160);
    return `rgb(${level},${level},${level + 8})`;
  }
  return "#e4e4e7";
}

export const BASE_COLORS: Record<string, string> = {
  A: "#22c55e",
  T: "#ef4444",
  U: "#f97316",
  G: "#eab308",
  C: "#3b82f6",
};

const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };

export function complement(dna: string): string {
  return [...dna].map((b) => PAIR[b] ?? "N").join("");
}

export function transcribe(dna: string): string {
  return dna.replaceAll("T", "U");
}

export interface CodonCell {
  number: number;
  bases: string;
  aa: string;
}

/** The window as codons, each with its protein position and amino acid. */
export function codons(
  window: CodingWindow,
  which: "ref" | "alt",
): CodonCell[] {
  const dna = window[which];
  const protein = which === "ref" ? window.ref_protein : window.alt_protein;
  const out: CodonCell[] = [];
  for (let i = 0; i + 3 <= dna.length; i += 3) {
    out.push({
      number: window.first_codon + i / 3,
      bases: dna.slice(i, i + 3),
      aa: protein[i / 3] ?? "X",
    });
  }
  return out;
}

/** 0..1 along the gene, measured from the 5' end whatever the strand. */
export function fromFivePrime(gene: GeneLocus, coordinate: number): number {
  const span = Math.max(1, gene.end - gene.start);
  const forward = (coordinate - gene.start) / span;
  return gene.strand === 1 ? forward : 1 - forward;
}

export interface ExonBox {
  number: number;
  x: number;
  width: number;
}

export function exonBoxes(gene: GeneLocus): ExonBox[] {
  return gene.exons.map((e) => {
    const a = fromFivePrime(gene, e.start);
    const b = fromFivePrime(gene, e.end);
    return { number: e.number, x: Math.min(a, b), width: Math.abs(b - a) };
  });
}

/** The band a coordinate falls in, if the karyotype has one. */
export function bandAt(bands: Band[], position: number): Band | null {
  return bands.find((b) => b.start <= position && position <= b.end) ?? null;
}

export type ExplorerQuery =
  | { scenario: string }
  | { gene: string; change: string };

export function explorerPath(q: ExplorerQuery): string {
  const params = new URLSearchParams(
    "scenario" in q ? { scenario: q.scenario } : q,
  );
  return `/api/explorer?${params.toString()}`;
}

export function formatBp(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} Mb`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kb`;
  return `${n} bp`;
}

/** The coding part of each exon (UTRs trimmed off), drawn taller. */
export function codingBoxes(gene: GeneLocus): ExonBox[] {
  const out: ExonBox[] = [];
  for (const e of gene.exons) {
    const start = Math.max(e.start, gene.cds_start);
    const end = Math.min(e.end, gene.cds_end);
    if (start > end) continue;
    const a = fromFivePrime(gene, start);
    const b = fromFivePrime(gene, end);
    out.push({ number: e.number, x: Math.min(a, b), width: Math.abs(b - a) });
  }
  return out;
}

const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;

/** `?scenario=` wins; else `?gene=&change=`; else nothing (use the default). */
export function queryFromParams(params: URLSearchParams): ExplorerQuery | null {
  const scenario = params.get("scenario");
  if (scenario) return { scenario };
  const gene = params.get("gene")?.trim();
  const change = params.get("change")?.trim();
  if (gene && change && SYMBOL.test(gene)) return { gene, change };
  return null;
}

export function explorePageHref(q: ExplorerQuery): string {
  const params = new URLSearchParams(
    "scenario" in q ? { scenario: q.scenario } : q,
  );
  return `/explore?${params.toString()}`;
}

/** Up to `flank` codons each side of the variant codon, as one DNA string. */
export function helixSlice(
  window: CodingWindow,
  position: number,
  which: "ref" | "alt",
  flank = 3,
): { dna: string; offset: number; firstCodon: number } {
  const k = position - window.first_codon;
  const from = Math.max(0, k - flank);
  const to = Math.min(window.ref.length / 3, k + flank + 1);
  return {
    dna: window[which].slice(from * 3, to * 3),
    offset: (k - from) * 3,
    firstCodon: window.first_codon + from,
  };
}
