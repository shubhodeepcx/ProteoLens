/**
 * Pure helpers for the Neoantigens tab: the request path, the allele panel,
 * peptide splitting around the mutated residue, and the epitope overlay.
 */
import type { NeoantigenCandidate } from "@/lib/neoantigen-types";
import { ramp } from "@/lib/oncology-format";

/** Representatives of the common HLA-I supertypes; the first four are the default. */
export const COMMON_ALLELES = [
  "HLA-A*02:01",
  "HLA-A*03:01",
  "HLA-A*11:01",
  "HLA-A*24:02",
  "HLA-A*01:01",
  "HLA-B*07:02",
  "HLA-B*08:01",
  "HLA-B*44:02",
] as const;
export const DEFAULT_ALLELES: readonly string[] = COMMON_ALLELES.slice(0, 4);

const CHANGE =
  /^\s*(?:p\.)?([A-Za-z]{3}|[A-Za-z])(\d{1,5})([A-Za-z]{3}|[A-Za-z])\s*$/;

export function looksLikeMissense(change: string): boolean {
  return CHANGE.test(change);
}

export function neoantigenPath(
  proteinId: string,
  change: string,
  alleles: readonly string[],
): string {
  const params = new URLSearchParams({
    change: change.trim(),
    alleles: alleles.join(","),
  });
  return `/api/proteins/${encodeURIComponent(proteinId)}/neoantigens?${params.toString()}`;
}

/** [before, mutated residue, after] for highlighting the change in a peptide. */
export function splitPeptide(
  peptide: string,
  offset: number,
): [string, string, string] {
  const i = offset - 1;
  return [peptide.slice(0, i), peptide.slice(i, i + 1), peptide.slice(i + 1)];
}

export function rankLabel(rank: number | null): string {
  if (rank === null) return "n/a";
  return `${rank < 0.1 ? rank.toFixed(2) : rank.toFixed(1)}%`;
}

/** How the mutant compares with the reference peptide on the same allele. */
export function comparisonLabel(c: NeoantigenCandidate): string {
  if (c.fold_change === null) return "no reference peptide";
  if (c.fold_change >= 2)
    return `${c.fold_change.toFixed(1)}× better than wild type`;
  if (c.fold_change <= 0.5) return "wild type binds better";
  return "similar to wild type";
}

export const EPITOPE_LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["Strong binder (<0.5%)", 0xdc2626],
  ["Weak binder (<2%)", 0xf59e0b],
  ["Mutated residue", 0x7c3aed],
];

/** Each residue coloured by the best candidate that covers it. */
export function epitopeColors(
  candidates: readonly NeoantigenCandidate[],
  variantKeys: readonly string[],
): Record<string, number> {
  const best: Record<string, number> = {};
  for (const c of candidates) {
    for (const key of c.residue_keys)
      best[key] = Math.min(best[key] ?? Infinity, c.mutant_rank);
  }
  const out: Record<string, number> = {};
  for (const [key, rank] of Object.entries(best)) {
    out[key] =
      rank < 0.5 ? 0xdc2626 : ramp(0xf59e0b, 0xfde68a, (rank - 0.5) / 1.5);
  }
  for (const key of variantKeys) out[key] = 0x7c3aed;
  return out;
}
