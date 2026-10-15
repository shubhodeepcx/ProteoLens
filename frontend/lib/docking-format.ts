/**
 * Wording for docking results. Vina scores are rough free-energy estimates:
 * good for ranking poses of one ligand, much weaker for ranking ligands.
 */
import type { DockPose, DockingSite } from "@/lib/docking-types";

/** Heavy-atom RMSD under which a redocked pose counts as the crystal pose. */
export const REDOCK_SUCCESS_ANGSTROMS = 2.0;
export const EXHAUSTIVENESS_CHOICES = [4, 8, 16] as const;

export function kcal(affinity: number): string {
  return `${affinity.toFixed(1)} kcal/mol`;
}

export function siteTitle(site: DockingSite): string {
  const where = `chain ${site.chain}${site.auth_seq_id === null ? "" : ` ${site.auth_seq_id}`}`;
  return `${site.code}${site.name ? ` (${shortName(site.name)})` : ""}, ${where}`;
}

function shortName(name: string): string {
  return name.length > 40 ? `${name.slice(0, 38)}…` : name;
}

export function poseLabel(pose: DockPose): string {
  return `Pose ${pose.rank}, ${kcal(pose.affinity)}`;
}

/** "0.8 Å from the crystal pose" with a verdict, or null when not redocking. */
export function crystalVerdict(pose: DockPose): {
  text: string;
  reproduced: boolean;
} | null {
  if (pose.rmsd_to_crystal === null) return null;
  const reproduced = pose.rmsd_to_crystal <= REDOCK_SUCCESS_ANGSTROMS;
  return {
    text: `${pose.rmsd_to_crystal.toFixed(2)} Å from the crystal pose`,
    reproduced,
  };
}

/** Rough binding strength; Vina's error is about 2 kcal/mol, so only coarse bins. */
export function strength(affinity: number): string {
  if (affinity <= -10) return "very strong";
  if (affinity <= -8) return "strong";
  if (affinity <= -6) return "moderate";
  return "weak";
}
