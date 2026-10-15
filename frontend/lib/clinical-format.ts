/**
 * Pure presentation rules for the clinical layer: class labels and colours,
 * and the per-residue colour maps the structure is painted with.
 *
 * Colours are 0xRRGGBB numbers because that is what Mol*'s `Color` is; the
 * same numbers render the legend swatches, so the legend can never disagree
 * with the canvas.
 */

import type {
  ClinicalClass,
  ResidueEvidence,
} from "@/lib/clinical-types";

export interface ClassMeta {
  label: string;
  color: number;
}

export const CLASS_META: Readonly<Record<ClinicalClass, ClassMeta>> = {
  pathogenic: { label: "Pathogenic", color: 0xb91c1c },
  likely_pathogenic: { label: "Likely pathogenic", color: 0xea580c },
  conflicting: { label: "Conflicting", color: 0xa855f7 },
  uncertain: { label: "Uncertain", color: 0x71717a },
  likely_benign: { label: "Likely benign", color: 0x0ea5e9 },
  benign: { label: "Benign", color: 0x2563eb },
  other: { label: "Other", color: 0xa1a1aa },
};

export const CLASS_ORDER: readonly ClinicalClass[] = [
  "pathogenic",
  "likely_pathogenic",
  "conflicting",
  "uncertain",
  "likely_benign",
  "benign",
  "other",
];

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * AlphaMissense's own published cut-offs (Cheng et al., Science 2023):
 * below 0.34 likely benign, above 0.564 likely pathogenic, ambiguous between.
 */
export const AM_BENIGN_MAX = 0.34;
export const AM_PATHOGENIC_MIN = 0.564;

export const AM_LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["Likely benign (< 0.34)", 0x3b82f6],
  ["Ambiguous", 0xd4d4d8],
  ["Likely pathogenic (> 0.564)", 0xdc2626],
];

/** Blue -> grey -> red along AlphaMissense's three bands. */
export function alphaMissenseColor(score: number): number {
  const s = Math.min(1, Math.max(0, score));
  if (s < AM_BENIGN_MAX) return mix(0x3b82f6, 0xd4d4d8, s / AM_BENIGN_MAX);
  if (s <= AM_PATHOGENIC_MIN) return 0xd4d4d8;
  return mix(0xf87171, 0xb91c1c, (s - AM_PATHOGENIC_MIN) / (1 - AM_PATHOGENIC_MIN));
}

export const BURDEN_LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["No pathogenic variant", 0xe4e4e7],
  ["1 pathogenic variant", 0xfdba74],
  ["2-3", 0xf97316],
  ["4+", 0xb91c1c],
];

/** Pathogenic-burden colour: how many (likely) pathogenic variants sit here. */
export function burdenColor(count: number): number {
  if (count <= 0) return BURDEN_LEGEND[0][1];
  if (count === 1) return BURDEN_LEGEND[1][1];
  if (count <= 3) return BURDEN_LEGEND[2][1];
  return BURDEN_LEGEND[3][1];
}

export type ClinicalPaint = "alphamissense" | "burden";

/**
 * `"A:12" -> colour` for every structure residue the evidence reaches. Residues
 * absent from the map keep the overlay's neutral fallback, which is the honest
 * rendering of "no evidence here".
 */
export function residueColors(
  residues: readonly ResidueEvidence[],
  paint: ClinicalPaint,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of residues) {
    let color: number | null = null;
    if (paint === "alphamissense") {
      if (r.alphamissense !== null) color = alphaMissenseColor(r.alphamissense);
    } else {
      color = burdenColor(r.pathogenic);
    }
    if (color === null) continue;
    for (const key of r.keys) out[key] = color;
  }
  return out;
}

export function formatAf(af: number | null): string {
  if (af === null) return "absent";
  if (af === 0) return "0";
  if (af >= 0.01) return `${(af * 100).toFixed(1)}%`;
  return af.toExponential(1);
}

function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (c: number, shift: number) => (c >> shift) & 0xff;
  const lerp = (shift: number) =>
    Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * k) << shift;
  return lerp(16) | lerp(8) | lerp(0);
}
