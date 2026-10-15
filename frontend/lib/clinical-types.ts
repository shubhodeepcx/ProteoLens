/**
 * Wire types for `GET /api/proteins/{id}/clinical-evidence`, mirroring
 * `backend/app/models/clinical.py`. Kept out of `lib/types.ts` so the clinical
 * layer can grow without every other feature's types churning beside it.
 */

import type { ResidueRef } from "@/lib/types";

export type ClinicalClass =
  | "pathogenic"
  | "likely_pathogenic"
  | "uncertain"
  | "likely_benign"
  | "benign"
  | "conflicting"
  | "other";

export interface Prediction {
  algorithm: string;
  label: string;
  score: number | null;
}

export interface ClinicalVariant {
  position: number;
  end: number;
  ref: string;
  alt: string;
  hgvs: string;
  short: string;
  consequence: string | null;
  clinical_class: ClinicalClass;
  significance_labels: string[];
  significance_sources: string[];
  diseases: string[];
  clinvar_ids: string[];
  dbsnp_id: string | null;
  gnomad_af: number | null;
  somatic: boolean;
  predictions: Prediction[];
  /** AlphaMissense residue mean at `position`, not this change's own score. */
  alphamissense: number | null;
  residues: ResidueRef[];
}

export interface ResidueEvidence {
  position: number;
  pathogenic: number;
  benign: number;
  uncertain: number;
  somatic: number;
  alphamissense: number | null;
  keys: string[];
}

export interface DiseaseCount {
  name: string;
  variants: number;
}

export interface ClinicalEvidence {
  id: string;
  accession: string | null;
  accession_resolved: boolean;
  resolution_note: string;
  gene: string | null;
  class_counts: Partial<Record<ClinicalClass, number>>;
  total_variants: number;
  variants: ClinicalVariant[];
  variants_truncated: number;
  residues: ResidueEvidence[];
  top_diseases: DiseaseCount[];
  alphamissense_available: boolean;
  mapped_positions: number;
  notes: string[];
}
