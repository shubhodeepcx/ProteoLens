/** Mirrors `backend/app/models/neoantigen.py` (GET /api/proteins/{id}/neoantigens). */

export type BindingClass = "strong" | "weak";

export interface NeoantigenCandidate {
  peptide: string;
  wild_type: string;
  allele: string;
  length: number;
  start: number;
  mutant_offset: number;
  mutant_rank: number;
  wild_type_rank: number | null;
  mutant_score: number;
  binding: BindingClass;
  fold_change: number | null;
  anchor: boolean;
  residue_keys: string[];
}

export interface NeoantigenReport {
  protein_id: string;
  accession: string | null;
  gene: string | null;
  change: string | null;
  alleles: string[];
  lengths: number[];
  method: string;
  peptides_scored: number;
  candidates: NeoantigenCandidate[];
  variant_keys: string[];
  resolution_note: string;
  notes: string[];
}
