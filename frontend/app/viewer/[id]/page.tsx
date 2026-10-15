"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { MolstarViewerRef } from "@/components/molstar-viewer";
import { ChainTree } from "@/components/chain-tree";
import { ViewerRail } from "@/components/viewer-rail";
import { ViewerHeader } from "@/components/viewer-header";
import {
  ViewerOverlays,
  type ViewerError,
} from "@/components/viewer-overlays";
import { API_BASE_URL } from "@/lib/api";
import { selectKeyFromSearch } from "@/lib/deep-link";
import { saveSnapshot } from "@/lib/report";
import { useStore } from "@/lib/store";
import { fetchElectrostatics, potentialByKey } from "@/lib/electrostatics";

// Mol* must be dynamically imported (no SSR — it touches WebGL/window).
const MolstarViewer = dynamic(() => import("@/components/molstar-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function DynamicViewerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const viewerRef = useRef<MolstarViewerRef>(null);
  const router = useRouter();

  // Report: capture the current 3D view first, so the report shows what the
  // user was looking at, then hand off through sessionStorage.
  const openReport = useCallback(async () => {
    const image = await viewerRef.current?.snapshot();
    if (image) saveSnapshot(id, image);
    router.push(`/report/${id}`);
  }, [id, router]);

  // Protein metadata lives in the shared Zustand store so other surfaces
  // (sequence panel, analytics) read the same `current` protein.
  const summary = useStore((s) => s.current);
  const metaLoading = useStore((s) => s.isLoading);
  const metaError = useStore((s) => s.error);
  const loadProtein = useStore((s) => s.loadProtein);
  const clearProtein = useStore((s) => s.clearProtein);
  const selected = useStore((s) => s.selected);
  const setSelection = useStore((s) => s.setSelection);
  const toggleResidue = useStore((s) => s.toggleResidue);
  const clearSelection = useStore((s) => s.clearSelection);
  const representation = useStore((s) => s.representation);
  const coloring = useStore((s) => s.coloring);
  const residueOverlay = useStore((s) => s.residueOverlay);
  const dockedPose = useStore((s) => s.dockedPose);
  const setColoring = useStore((s) => s.setColoring);
  const resetView = useStore((s) => s.resetView);
  /** Does this structure's B-factor column hold pLDDT? Drives both the
   *  coloring domain and which coloring options the toolbar offers. */
  const hasPlddt = summary?.has_plddt ?? false;

  // Mol*-specific load state stays local — it's not shareable across surfaces.
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  // Bumped every time a structure finishes loading, so the imperative effects
  // below re-apply their state against the freshly built Mol* hierarchy.
  const [structureVersion, setStructureVersion] = useState(0);

  // Reset ALL Mol*-local state on route change: each flag outlives a
  // MolstarViewer unmount/remount on /viewer/A → /viewer/B and would otherwise
  // describe the previous protein. viewerReady would fire the load effect at
  // the old plugin; structureVersion would push state at a dead hierarchy;
  // structureError would keep the `summary && !error` gate shut so the next
  // route's viewer never mounts and onReady never fires again; and
  // structureLoading sticks on because the cancelled load skips its `finally`.
  useEffect(() => {
    setViewerReady(false);
    setStructureVersion(0);
    setStructureError(null);
    setStructureLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void loadProtein(id);
    return () => {
      clearProtein();
      clearSelection();
      resetView();
    };
    // loadProtein/clearProtein are stable Zustand actions; depending only on id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!viewerReady || !summary) return;
    let cancelled = false;
    setStructureLoading(true);
    // Clear any prior structure error so a successful retry on the same id
    // wipes the previous failure rather than stacking on top of it.
    setStructureError(null);

    (async () => {
      try {
        await viewerRef.current!.loadStructure(
          `${API_BASE_URL}${summary.file_url}`,
          summary.file_format,
        );
        if (!cancelled) setStructureVersion((v) => v + 1);
      } catch (e) {
        if (!cancelled) {
          setStructureError(
            `Could not load structure: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      } finally {
        if (!cancelled) setStructureLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, summary]);

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

  // Mol* -> store: a 3D click toggles the residue, empty space clears.
  const onResidueClick = useCallback(
    (key: string | null) => {
      if (key === null) clearSelection();
      else toggleResidue(key);
    },
    [clearSelection, toggleResidue],
  );

  const loading = metaLoading || structureLoading;
  const error: ViewerError | null = metaError
    ? {
        kind: metaError.status === 404 ? "notfound" : "other",
        message: metaError.message,
      }
    : structureError
      ? { kind: "other", message: structureError }
      : null;

  const title =
    summary?.name && summary.name.trim().length > 0
      ? summary.name
      : `Protein ${id?.slice(0, 8) ?? ""}`;

  return (
    <>
      {/* Mol* ships a bundled CSS — load it as a static asset. */}
      <link rel="stylesheet" href="/molstar.css" />

      <div className="flex h-screen flex-col bg-background text-foreground">
        <ViewerHeader
          title={title}
          source={summary?.source ?? null}
          hasPlddt={hasPlddt}
          proteinId={summary ? id : undefined}
          onResetCamera={() => viewerRef.current?.resetCamera()}
          onOpenReport={summary ? () => void openReport() : undefined}
        />

        {/* Split content: chain tree left, viewer centre, tabbed rail right
            (xl+); at narrower widths the viewer takes the full width and the
            rail stacks below. */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[15rem_1fr_24rem]">
          {/* xl+ left rail — the chain tree. Drives the same selection slice
              the sequence panel and the 3D click handler already share. */}
          <aside className="hidden min-h-0 border-r border-border bg-background xl:block">
            {summary && <ChainTree />}
          </aside>

          <div className="relative overflow-hidden">
            <ViewerOverlays
              loading={loading}
              error={error}
              label={summary ? title : "metadata"}
            />
            {summary && !error && (
              <MolstarViewer
                ref={viewerRef}
                className="h-full w-full"
                onReady={() => setViewerReady(true)}
                onResidueClick={onResidueClick}
                chains={summary.chains}
              />
            )}
          </div>

          {/* xl+ side panel */}
          <aside className="hidden min-h-0 border-l border-border bg-background xl:block">
            {id && summary && <ViewerRail proteinId={id} />}
          </aside>
        </div>

        {/* Narrow viewports: stacked rail below the viewer. */}
        <div className="border-t border-border bg-background xl:hidden">
          {id && summary && <ViewerRail proteinId={id} />}
        </div>
      </div>
    </>
  );
}
