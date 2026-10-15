"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MolstarViewerRef } from "@/components/molstar-viewer";
import { API_BASE_URL } from "@/lib/api";
import type { ProteinSummary } from "@/lib/types";

/**
 * Loads the current protein's structure file into Mol* once the viewer is
 * ready, and reports progress. `structureVersion` is bumped after every
 * successful load so effects that push store state into Mol* re-run against
 * the freshly built hierarchy.
 */
export function useStructureLoad(
  id: string,
  summary: ProteinSummary | null,
  viewerRef: RefObject<MolstarViewerRef | null>,
) {
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

  return {
    structureLoading,
    structureError,
    structureVersion,
    onViewerReady: () => setViewerReady(true),
  };
}
