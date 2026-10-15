/** Wire types for `GET /api/proteins/{id}/oncology` (`backend/app/models/oncology.py`). */

export type SourceState = "ok" | "empty" | "unavailable" | "skipped";

export interface SourceStatus {
  name: string;
  state: SourceState;
  detail: string | null;
}

export interface CountedLabel {
  label: string;
  count: number;
}

export interface Hotspot {
  residue: string;
  position: number;
  tumor_count: number;
  q_value: number | null;
  alternates: CountedLabel[];
  tumor_types: CountedLabel[];
  keys: string[];
}

export interface MutationPosition {
  position: number;
  count: number;
  truncating: number;
  top_change: string;
  keys: string[];
}

export interface CancerTypeFrequency {
  study_id: string;
  cancer_type: string;
  mutated_samples: number;
  samples: number;
  fraction: number;
}

export interface TcgaSummary {
  studies: number;
  samples: number;
  mutated_samples: number;
  by_cancer_type: CancerTypeFrequency[];
  mutation_types: CountedLabel[];
  positions: MutationPosition[];
}

export interface Drug {
  chembl_id: string;
  name: string;
  max_phase: number | null;
  first_approval: number | null;
  molecule_type: string | null;
  mechanism: string | null;
  action_type: string | null;
  variant: string | null;
  url: string;
}

export interface EvidenceItem {
  id: number;
  profile: string;
  evidence_type: string;
  significance: string | null;
  direction: string | null;
  level: string | null;
  rating: number | null;
  therapies: string[];
  disease: string | null;
  positions: number[];
  keys: string[];
  url: string;
}

export interface Pathway {
  id: string;
  name: string;
  in_disease: boolean;
  url: string;
}

export interface Interactor {
  name: string;
  score: number;
}

export interface OncologyContext {
  id: string;
  accession: string | null;
  accession_resolved: boolean;
  resolution_note: string;
  gene: string | null;
  sequence_length: number;
  hotspots: Hotspot[];
  tcga: TcgaSummary | null;
  drugs: Drug[];
  evidence: EvidenceItem[];
  evidence_total: number;
  pathways: Pathway[];
  pathways_total: number;
  interactors: Interactor[];
  sources: SourceStatus[];
  notes: string[];
}
