"use client";

import { useEffect, type RefObject } from "react";
import type { MolstarViewerRef } from "@/components/molstar-viewer";
import { selectKeyFromSearch } from "@/lib/deep-link";
import { fetchElectrostatics, potentialByKey } from "@/lib/electrostatics";
import { useStore } from "@/lib/store";

/**
 * Pushes store state (selection, representation, colouring, overlays, the
 * docked pose) into Mol*. Every effect waits for `structureVersion` > 0 and
 * re-runs when it changes, so state is re-applied after each structure load.
 */
export function useViewerSync(
  id: string,
  viewerRef: RefObject<MolstarViewerRef | null>,
  structureVersion: number,
  hasPlddt: boolean,
) {
  const selected = useStore((s) => s.selected);
  const setSelection = useStore((s) => s.setSelection);
  const representation = useStore((s) => s.representation);
  const coloring = useStore((s) => s.coloring);
  const residueOverlay = useStore((s) => s.residueOverlay);
  const dockedPose = useStore((s) => s.dockedPose);
  const setColoring = useStore((s) => s.setColoring);

  // Store -> Mol*: selection. One effect, one direction — a Mol* click routes
  // through `onResidueClick` below and never re-enters this effect's source.
  useEffect(() => {
    if (structureVersion === 0) return;
    viewerRef.current?.highlightResidues([...selected]);
  }, [structureVersion, selected]);

  // Deep link: `?select=A:7` selects and focuses one residue, once, on the
  // first structure load (the Central Dogma Explorer's hand-off).
  useEffect(() => {
    if (structureVersion !== 1) return;
    const key = selectKeyFromSearch(window.location.search);
    if (!key) return;
    setSelection([key]);
    viewerRef.current?.highlightResidues([key], { focus: true });
  }, [structureVersion, setSelection]);

  // Store -> Mol*: representation + coloring.
  useEffect(() => {
    if (structureVersion === 0) return;
    viewerRef.current?.setRepresentation(representation);
  }, [structureVersion, representation]);

  // `hasPlddt` is part of this effect's input, not just a passenger: it decides
  // whether the shared `uncertainty` theme runs its scale forwards (B-factor)
  // or inverted (pLDDT), so the coloring must be re-applied when it changes.
  // A panel overlay (clinical evidence, oncology) takes precedence; clearing
  // it falls back to the toolbar scheme.
  useEffect(() => {
    if (structureVersion === 0) return;
    if (residueOverlay) {
      viewerRef.current?.setResidueOverlay(residueOverlay.colors);
      return;
    }
    if (coloring !== "electrostatics") {
      viewerRef.current?.setColoring(coloring, { hasPlddt });
      return;
    }
    // P15: the potential comes from the backend, so this scheme is async. A
    // switch away (or to another protein) before it lands must not repaint.
    let cancelled = false;
    fetchElectrostatics(id)
      .then((data) => {
        if (!cancelled) {
          viewerRef.current?.colorByResidueValues(potentialByKey(data), data.color_range);
        }
      })
      .catch(() => {
        if (!cancelled) setColoring("chain");
      });
    return () => {
      cancelled = true;
    };
  }, [structureVersion, coloring, hasPlddt, residueOverlay, id, setColoring]);

  // Store -> Mol*: the Docking tab's chosen pose, re-added after every load.
  useEffect(() => {
    if (structureVersion === 0) return;
    viewerRef.current?.showDockedPose(dockedPose?.sdf ?? null);
  }, [structureVersion, dockedPose]);
}
