import { apiGet } from "@/lib/api";

/**
 * P15 surface electrostatics: client types and a per-protein cached fetch.
 *
 * Both the Electrostatics section and the viewer's "Electrostatic potential"
 * colouring need the same response, so it is fetched once per protein and
 * shared rather than requested by each.
 */

export interface ResidueRef {
  chain: string;
  ordinal: number;
  key: string;
  residue: string;
  auth_seq_id: number | null;
  insertion_code: string | null;
}

export interface ChainPotential {
  chain: string;
  sequence: string;
  potential: number[];
  exposed: boolean[] | null;
  net_charge: number;
  isoelectric_point: number | null;
}

export interface ChargedPatch {
  sign: "positive" | "negative";
  residues: ResidueRef[];
  mean_potential: number;
  label: string;
}

export interface ElectrostaticsResponse {
  protein_id: string;
  units: string;
  color_range: number;
  chains: ChainPotential[];
  patches: ChargedPatch[];
  net_charge: number;
  dipole_debye: number | null;
  charged_atoms: number;
  notes: string[];
}

const cache = new Map<string, Promise<ElectrostaticsResponse>>();

export function fetchElectrostatics(proteinId: string): Promise<ElectrostaticsResponse> {
  let pending = cache.get(proteinId);
  if (!pending) {
    pending = apiGet<ElectrostaticsResponse>(
      `/api/proteins/${encodeURIComponent(proteinId)}/electrostatics`,
    );
    // A failed request must not stick: drop it so the next caller retries.
    pending.catch(() => cache.delete(proteinId));
    cache.set(proteinId, pending);
  }
  return pending;
}

/** Test seam: forget every cached response. */
export function clearElectrostaticsCache(): void {
  cache.clear();
}

/** `"A:12"` -> potential, the shape the viewer's colour theme consumes. */
export function potentialByKey(data: ElectrostaticsResponse): Map<string, number> {
  const out = new Map<string, number>();
  for (const chain of data.chains) {
    chain.potential.forEach((value, i) => out.set(`${chain.chain}:${i + 1}`, value));
  }
  return out;
}

/** "K33" or "K33A": one-letter code plus the file's own residue number. */
export function residueLabel(ref: ResidueRef): string {
  return `${ref.residue}${ref.auth_seq_id ?? ref.ordinal}${ref.insertion_code ?? ""}`;
}

/** "+8.1 e" */
export function signed(value: number, unit = ""): string {
  const text = value > 0 ? `+${value}` : String(value);
  return unit ? `${text} ${unit}` : text;
}
