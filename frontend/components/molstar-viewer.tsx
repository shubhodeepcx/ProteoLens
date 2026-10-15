"use client";

import React, { useEffect, useRef, useImperativeHandle } from "react";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { Structure } from "molstar/lib/mol-model/structure";
import { createViewerPlugin } from "@/lib/molstar/plugin";
import type { ColoringOptions, MolstarFormat } from "@/lib/molstar/actions";
import { isOtherStructure } from "@/lib/molstar/docked-pose";
import {
  resolveResidueLocus,
  residueClickPayload,
  EMPTY_RESIDUE_INDEX,
  type ResidueIndexMap,
} from "@/lib/molstar/residue-index";
import type {
  MolstarColoring,
  MolstarRepresentation,
} from "@/lib/molstar/theming";
import { createViewerHandle } from "@/lib/molstar/viewer-handle";
import type { MolstarViewerProps, MolstarViewerRef } from "./molstar-viewer-types";

export type {
  ColoringOptions,
  MolstarFormat,
  MolstarRepresentation,
  MolstarColoring,
  MolstarViewerProps,
  MolstarViewerRef,
};

const MolstarViewer = React.forwardRef<MolstarViewerRef, MolstarViewerProps>(
  function MolstarViewer(
    { className, style, onReady, onResidueClick, chains },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pluginRef = useRef<PluginUIContext | null>(null);
    const structureRef = useRef<Structure | null>(null);
    const indexRef = useRef<ResidueIndexMap>(EMPTY_RESIDUE_INDEX);
    const onReadyRef = useRef(onReady);
    const onResidueClickRef = useRef(onResidueClick);
    const chainsRef = useRef(chains);
    // Monotonic token so a superseded or torn-down load cannot write its
    // results over a newer one.
    const loadSeqRef = useRef(0);
    // Serialises mount/teardown cycles on the same container. `createViewerPlugin`
    // is async and owns a React root on `target`, but cleanup runs synchronously
    // — so under StrictMode's double-invoke (or any fast remount) the teardown
    // fires while the first plugin is still constructing, disposes nothing, and
    // the next mount calls createRoot() on a container that already has one.
    // Chaining each init behind the previous teardown makes the cycles ordered.
    const teardownRef = useRef<Promise<void>>(Promise.resolve());

    // Keep refs in sync without re-running the init effect (which would tear
    // down and rebuild the WebGL context on every parent render).
    useEffect(() => {
      onReadyRef.current = onReady;
      onResidueClickRef.current = onResidueClick;
      chainsRef.current = chains;
    }, [onReady, onResidueClick, chains]);

    useEffect(() => {
      const target = containerRef.current;
      if (!target) return;

      let disposed = false;
      let pluginInstance: PluginUIContext | null = null;
      let clickSub: { unsubscribe(): void } | null = null;

      async function init() {
        // Wait for any previous cycle's plugin to be fully disposed first.
        await teardownRef.current;
        if (disposed) return;
        const plugin = await createViewerPlugin(target!);
        if (disposed) {
          plugin.dispose();
          return;
        }
        pluginInstance = plugin;
        pluginRef.current = plugin;

        // Direction 1: 3D click -> store. `click` is a BehaviorSubject whose
        // replayed seed value is swallowed, else mounting clears the selection.
        let seeded = false;
        clickSub = plugin.behaviors.interaction.click.subscribe((e) => {
          if (!seeded) {
            seeded = true;
            return;
          }
          // `undefined` means "say nothing": the user clicked a ligand or
          // water, which must not be mistaken for a background click.
          if (isOtherStructure(e.current.loci, structureRef.current)) return;
          const payload = residueClickPayload(
            resolveResidueLocus(e.current.loci, indexRef.current),
          );
          if (payload !== undefined) onResidueClickRef.current?.(payload);
        });

        onReadyRef.current?.();
      }

      // eslint-disable-next-line no-console
      const started = init().catch((err) => console.error("Mol* init failed:", err));

      return () => {
        disposed = true;
        // Only settles once this cycle's plugin — which may still be mid-construction
        // — has actually been torn down, so the next mount cannot race it.
        teardownRef.current = started.then(() => {
          clickSub?.unsubscribe();
          pluginInstance?.dispose();
          pluginRef.current = null;
          structureRef.current = null;
          indexRef.current = EMPTY_RESIDUE_INDEX;
        });
      };
    }, []);

    useImperativeHandle(ref, () =>
      createViewerHandle({ pluginRef, structureRef, indexRef, chainsRef, loadSeqRef }),
    );

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", width: "100%", height: "100%", ...style }}
      />
    );
  },
);

export default MolstarViewer;
