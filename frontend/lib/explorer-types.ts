/** Mirrors `backend/app/models/explorer.py` (GET /api/explorer). */

export type Consequence = "missense" | "nonsense" | "synonymous";

export interface Band {
  id: string;
  start: number;
  end: number;
  stain: string;
}

export interface Chromosome {
  name: string;
  length: number;
  bands: Band[];
}

export interface Exon {
  number: number;
  start: number;
  end: number;
}

export interface GeneLocus {
  symbol: string;
  description: string | null;
  ensembl_gene: string;
  chromosome: string;
  start: number;
  end: number;
  strand: 1 | -1;
  cytoband: string | null;
  transcript: string;
  exons: Exon[];
  cds_start: number;
  cds_end: number;
}

export interface VariantChange {
  protein_position: number;
  ref_aa: string;
  alt_aa: string;
  ref_aa3: string;
  alt_aa3: string;
  ref_codon: string;
  alt_codon: string;
  changed_bases: number[];
  consequence: Consequence;
  hgvs_p: string;
  hgvs_c: string;
  genomic_position: number;
  genomic_ref: string;
  genomic_alt: string;
  exon_number: number | null;
}

export interface CodingWindow {
  first_codon: number;
  ref: string;
  alt: string;
  ref_protein: string;
  alt_protein: string;
}

export interface Scenario {
  id: string;
  title: string;
  disease: string;
  field: string;
  gene: string;
  change: string;
  summary: string;
  story: string[];
  structure_note: string | null;
}

export interface ExplorerView {
  scenario: Scenario | null;
  gene: GeneLocus;
  chromosomes: Chromosome[];
  variant: VariantChange;
  window: CodingWindow;
  accession: string | null;
  protein_length: number | null;
  handoff_ok: boolean;
  notes: string[];
}
