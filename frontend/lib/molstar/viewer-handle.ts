import type { MutableRefObject } from "react";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import type { Structure } from "molstar/lib/mol-model/structure";
import type { MolstarViewerRef } from "@/components/molstar-viewer-types";
import {
  applyColoring,
  applyRepresentation,
  applyResidueOverlay,
  applyResidueValueColoring,
  applySelection,
  loadStructureInto,
  type MolstarFormat,
} from "@/lib/molstar/actions";
import { showDockedPose } from "@/lib/molstar/docked-pose";
import { setResidueValues } from "@/lib/molstar/electrostatics-theme";
import {
  buildResidueIndex,
  warnOnResidueDrift,
  EMPTY_RESIDUE_INDEX,
  type ResidueIndexMap,
} from "@/lib/molstar/residue-index";
import type { QueryChain } from "@/lib/residue";

/** The viewer component's refs, shared with its imperative handle. */
export interface ViewerRefs {
  pluginRef: MutableRefObject<PluginUIContext | null>;
  structureRef: MutableRefObject<Structure | null>;
  indexRef: MutableRefObject<ResidueIndexMap>;
  chainsRef: MutableRefObject<readonly QueryChain[] | undefined>;
  /** Monotonic token so a superseded or torn-down load cannot write its
   *  results over a newer one. */
  loadSeqRef: MutableRefObject<number>;
}

/** Builds the `MolstarViewerRef` the viewer exposes through `useImperativeHandle`. */
export function createViewerHandle({
  pluginRef,
  structureRef,
  indexRef,
  chainsRef,
  loadSeqRef,
}: ViewerRefs): MolstarViewerRef {
  return {
    async loadStructure(url: string, format: MolstarFormat = "pdb") {
      const plugin = pluginRef.current;
      if (!plugin) return;

      // Stale once the plugin is disposed (pluginRef is nulled on cleanup)
      // or once a newer loadStructure call has superseded this one.
      const seq = ++loadSeqRef.current;
      const isStale = () =>
        pluginRef.current !== plugin || loadSeqRef.current !== seq;

      structureRef.current = null;
      indexRef.current = EMPTY_RESIDUE_INDEX;

      const structure = await loadStructureInto(plugin, url, format, isStale);
      if (isStale()) return;
      structureRef.current = structure;
      indexRef.current = structure
        ? buildResidueIndex(structure)
        : EMPTY_RESIDUE_INDEX;
      warnOnResidueDrift(indexRef.current, chainsRef.current);
    },

    // The remaining entry points are one-liners over `lib/molstar/actions`,
    // each guarding on the asynchronously created plugin.
    highlightResidues: (keys, options) => {
      const plugin = pluginRef.current;
      const structure = structureRef.current;
      if (plugin && structure) {
        applySelection(plugin, structure, keys, indexRef.current, options?.focus);
      }
    },
    setRepresentation: (type) => {
      if (pluginRef.current) applyRepresentation(pluginRef.current, type);
    },
    setColoring: (scheme, options) => {
      if (pluginRef.current) applyColoring(pluginRef.current, scheme, options);
    },
    setResidueOverlay: (colors) => {
      const plugin = pluginRef.current;
      if (plugin) applyResidueOverlay(plugin, colors, indexRef.current);
    },
    showDockedPose: (sdf) => {
      if (pluginRef.current) void showDockedPose(pluginRef.current, sdf);
    },
    colorByResidueValues: (values, range) => {
      const plugin = pluginRef.current;
      if (!plugin) return;
      const byResidue = new Map<number, number>();
      for (const [key, value] of values) {
        const residue = indexRef.current.keyToResidue.get(key);
        if (residue !== undefined) byResidue.set(residue, value);
      }
      applyResidueValueColoring(plugin, setResidueValues(byResidue, range));
    },
    resetCamera: () => {
      if (pluginRef.current) PluginCommands.Camera.Reset(pluginRef.current, {});
    },
    snapshot: async () => {
      const helper = pluginRef.current?.helpers.viewportScreenshot;
      if (!helper) return null;
      try {
        return await helper.getImageDataUri();
      } catch {
        return null;
      }
    },
  };
}
