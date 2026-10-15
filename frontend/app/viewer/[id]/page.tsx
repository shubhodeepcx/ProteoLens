"use client";

import React, { useRef, useEffect, useCallback } from "react";
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
import { saveSnapshot } from "@/lib/report";
import { useStore } from "@/lib/store";
import { useStructureLoad } from "@/lib/use-structure-load";
import { useViewerSync } from "@/lib/use-viewer-sync";

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
  const toggleResidue = useStore((s) => s.toggleResidue);
  const clearSelection = useStore((s) => s.clearSelection);
  const resetView = useStore((s) => s.resetView);
  /** Does this structure's B-factor column hold pLDDT? Drives both the
   *  coloring domain and which coloring options the toolbar offers. */
  const hasPlddt = summary?.has_plddt ?? false;

  const { structureLoading, structureError, structureVersion, onViewerReady } =
    useStructureLoad(id, summary, viewerRef);

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

  useViewerSync(id, viewerRef, structureVersion, hasPlddt);


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
                onReady={onViewerReady}
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
