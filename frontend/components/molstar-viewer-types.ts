import type React from "react";
import type { ColoringOptions, MolstarFormat } from "@/lib/molstar/actions";
import type { MolstarColoring, MolstarRepresentation } from "@/lib/molstar/theming";
import type { QueryChain } from "@/lib/residue";

export interface MolstarViewerRef {
  loadStructure(url: string, format?: MolstarFormat): Promise<void>;
  /** Keys are `"<chain>:<1-based position>"`, matching the sequence panel. */
  highlightResidues(keys: string[], options?: { focus?: boolean }): void;
  setRepresentation(type: MolstarRepresentation): void;
  /**
   * `options.hasPlddt` carries `ProteinSummary.has_plddt`; it is required
   * because the `plddt` scheme renders backwards without it.
   */
  setColoring(scheme: MolstarColoring, options: ColoringOptions): void;
  /** Paints residues from a `"A:12" -> 0xRRGGBB` table (rail-panel overlays). */
  setResidueOverlay(colors: Readonly<Record<string, number>>): void;
  /** Shows a docked ligand pose (MDL molfile) beside the protein; null removes it. */
  showDockedPose(sdf: string | null): void;
  /**
   * Colour by a per-residue value (P15 electrostatics), red at `-range`,
   * white at 0, blue at `+range`. Keys are `"<chain>:<ordinal>"`; residues
   * with no value render grey.
   */
  colorByResidueValues(values: ReadonlyMap<string, number>, range: number): void;
  resetCamera(): void;
  /** PNG data URI of the current view, or null before the plugin exists. */
  snapshot(): Promise<string | null>;
}

export interface MolstarViewerProps {
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  /**
   * Residue key on click, `null` on empty space, and nothing at all for
   * geometry outside the index (ligand, water) — see `residueClickPayload`.
   */
  onResidueClick?: (key: string | null) => void;
  /** Optional: used only to warn when Mol*'s residue count drifts from the API's. */
  chains?: readonly QueryChain[];
}
