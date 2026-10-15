import type { StateCreator } from "zustand";

export type Representation =
  | "cartoon"
  | "surface"
  | "stick"
  | "ball-stick"
  | "spacefill";

/**
 * Mirrors `MolstarColoring` in `lib/molstar/theming.ts` (the store must not
 * import from the Mol* layer). `plddt` and `bfactor` both drive Mol*'s
 * `uncertainty` theme but differ in domain, and only one of the two is valid
 * for any given structure — `ViewerControls` resolves that from
 * `ProteinSummary.has_plddt`, since this slice has no idea which protein is
 * open.
 *
 * `electrostatics` is the one scheme that is not a Mol* built-in: the viewer
 * page fetches the P15 potential and paints it with ProteoLens' own theme.
 */
export type ColoringScheme =
  | "chain"
  | "ss"
  | "hydrophobicity"
  | "plddt"
  | "bfactor"
  | "residueType"
  | "electrostatics";

/**
 * Residue colours a rail panel paints onto the structure (clinical evidence,
 * AlphaMissense, oncology hotspots). While set, it replaces `coloring`; picking
 * any coloring scheme in the toolbar clears it.
 */
export interface ResidueOverlay {
  /** Short name for the toolbar, e.g. "AlphaMissense". */
  label: string;
  /** `"<chain>:<ordinal>"` -> 0xRRGGBB. */
  colors: Readonly<Record<string, number>>;
  /** Legend rows, label + colour, in display order. */
  legend: ReadonlyArray<readonly [string, number]>;
}

export interface ViewerSlice {
  representation: Representation;
  coloring: ColoringScheme;
  residueOverlay: ResidueOverlay | null;
  /**
   * Incremented to signal that the viewer should reset its camera. Components
   * subscribe to this counter rather than holding an imperative ref to Mol*.
   */
  cameraResetTick: number;
  setRepresentation: (representation: Representation) => void;
  setColoring: (coloring: ColoringScheme) => void;
  setResidueOverlay: (overlay: ResidueOverlay | null) => void;
  resetCamera: () => void;
  /**
   * Restores representation/coloring to their defaults. Called when leaving a
   * protein (route change) so the next one doesn't inherit e.g. "spacefill" +
   * "plddt" from a completely unrelated structure.
   */
  resetView: () => void;
}

const DEFAULT_REPRESENTATION: Representation = "cartoon";
const DEFAULT_COLORING: ColoringScheme = "chain";

export const createViewerSlice: StateCreator<ViewerSlice, [], [], ViewerSlice> = (
  set,
) => ({
  representation: DEFAULT_REPRESENTATION,
  coloring: DEFAULT_COLORING,
  residueOverlay: null,
  cameraResetTick: 0,
  setRepresentation: (representation) => set({ representation }),
  setColoring: (coloring) => set({ coloring, residueOverlay: null }),
  setResidueOverlay: (residueOverlay) => set({ residueOverlay }),
  resetCamera: () => set((state) => ({ cameraResetTick: state.cameraResetTick + 1 })),
  resetView: () =>
    set({
      representation: DEFAULT_REPRESENTATION,
      coloring: DEFAULT_COLORING,
      residueOverlay: null,
    }),
});
