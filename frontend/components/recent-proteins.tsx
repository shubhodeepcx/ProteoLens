"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ProteinSummary } from "@/lib/types";

/**
 * The last few proteins this backend has loaded, newest first. The backend
 * keeps them in SQLite, so this list survives a restart and lets someone
 * reopen yesterday's structure without uploading it again. Renders nothing
 * when the list is empty or the backend is down — the quick actions above
 * already cover a first visit.
 */
export function RecentProteins({ limit = 5 }: { limit?: number }) {
  const [proteins, setProteins] = useState<ProteinSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiGet<ProteinSummary[]>(`/api/proteins?limit=${limit}`)
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setProteins(list);
      })
      .catch(() => {
        // Backend down: the health pill already says so.
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (proteins.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="flex flex-col gap-1 p-3">
      <h3
        id="recent-heading"
        className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
      >
        <History className="size-3" aria-hidden />
        Recent structures
      </h3>
      {proteins.map((p) => (
        <Link
          key={p.id}
          href={`/viewer/${p.id}`}
          className="rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent/40"
        >
          <span className="block truncate font-medium text-foreground">
            {p.source_id ? `${p.source_id} · ` : ""}
            {p.name ?? "Uploaded structure"}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {p.residue_count} residues · {p.chains.length}{" "}
            {p.chains.length === 1 ? "chain" : "chains"} · {p.source}
          </span>
        </Link>
      ))}
    </section>
  );
}
