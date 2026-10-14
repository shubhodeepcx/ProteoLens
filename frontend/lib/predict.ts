import { apiPost } from "@/lib/api";
import type { ProteinSummary } from "@/lib/types";

/** ESM Atlas folds at most this many residues; the backend enforces it too. */
export const MAX_PREDICT_LENGTH = 400;
export const MIN_PREDICT_LENGTH = 10;

/** Human ubiquitin (P0CG48, residues 1-76): small, well folded, a quick demo. */
export const EXAMPLE_SEQUENCE =
  "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG";
export const EXAMPLE_NAME = "Ubiquitin (ESMFold)";

/** Residue count of plain or FASTA input, ignoring headers, whitespace and a stop. */
export function residueCount(raw: string): number {
  return raw
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("")
    .replace(/\s+/g, "")
    .replace(/\*$/, "").length;
}

export function predictStructure(sequence: string, name?: string): Promise<ProteinSummary> {
  const label = name?.trim();
  return apiPost<ProteinSummary>("/api/proteins/predict", {
    sequence,
    ...(label ? { name: label } : {}),
  });
}
