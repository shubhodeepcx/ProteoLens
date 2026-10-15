/** Mirrors `backend/app/models/conservation.py` (GET /api/proteins/{id}/conservation). */

export interface ResidueConservation {
  position: number;
  residue: string;
  information: number;
  dominant: string;
  dominant_probability: number;
  keys: string[];
}

export interface ConservationProfile {
  protein_id: string;
  accession: string | null;
  accession_resolved: boolean;
  resolution_note: string;
  source: string;
  sequence_length: number;
  residues: ResidueConservation[];
  most_conserved: number[];
  mean_information: number | null;
  placed: number;
  notes: string[];
}
