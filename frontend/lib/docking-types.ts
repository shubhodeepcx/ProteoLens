/** Mirrors `backend/app/models/docking.py` (docking sites and POST /dock). */

export interface DockingSite {
  id: string;
  code: string;
  name: string | null;
  chain: string;
  auth_seq_id: number | null;
  atom_count: number;
  center: number[];
  size: number[];
  smiles: string | null;
}

export interface DockingSites {
  protein_id: string;
  sites: DockingSite[];
  vina_available: boolean;
  vina_note: string | null;
}

export interface DockRequest {
  smiles: string;
  site?: string;
  residues?: string[];
  exhaustiveness: number;
}

export interface DockPose {
  rank: number;
  affinity: number;
  rmsd_lb: number;
  rmsd_ub: number;
  rmsd_to_crystal: number | null;
  sdf: string;
  contacts: string[];
}

export interface DockResult {
  protein_id: string;
  smiles: string;
  site_label: string;
  center: number[];
  size: number[];
  exhaustiveness: number;
  poses: DockPose[];
  vina_version: string | null;
  elapsed_seconds: number;
  receptor_residues_skipped: number;
  notes: string[];
}
