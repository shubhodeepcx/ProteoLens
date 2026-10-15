"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { ExplorerView, Scenario } from "@/lib/explorer-types";
import {
  LEVELS,
  explorePageHref,
  explorerPath,
  queryFromParams,
  type ExplorerQuery,
  type LevelId,
} from "@/lib/explorer-format";
import { ExplorePicker } from "./explore-picker";
import { LevelGenome } from "./level-genome";
import { LevelLocus } from "./level-locus";
import { LevelHelix } from "./level-helix";
import { LevelTranslation } from "./level-translation";
import { LevelProtein } from "./level-protein";

const DEFAULT: ExplorerQuery = { scenario: "sickle-cell" };

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const detail =
      typeof e.body === "object" && e.body ? (e.body.detail as string) : null;
    return detail ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * One variant, five zoom levels. The whole journey comes from one request
 * (`GET /api/explorer`), so every level describes the same base and codon.
 */
export function ExploreView() {
  const params = useSearchParams();
  const router = useRouter();
  const query =
    queryFromParams(new URLSearchParams(params.toString())) ?? DEFAULT;
  const path = explorerPath(query);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [view, setView] = useState<ExplorerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelId>("genome");

  useEffect(() => {
    apiGet<Scenario[]>("/api/explorer/scenarios").then(setScenarios, () =>
      setScenarios([]),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError(null);
    setLevel("genome");
    apiGet<ExplorerView>(path).then(
      (v) => !cancelled && setView(v),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  const index = LEVELS.findIndex((l) => l.id === level);
  const go = (step: number) => setLevel(LEVELS[index + step].id);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
      <ExplorePicker
        scenarios={scenarios}
        current={query}
        onPick={(q) => router.push(explorePageHref(q))}
      />

      <nav
        aria-label="Zoom level"
        className="flex flex-wrap items-center gap-1"
        role="tablist"
      >
        {LEVELS.map((l, i) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={l.id === level}
            disabled={!view}
            onClick={() => setLevel(l.id)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
              l.id === level
                ? "bg-indigo-500/20 text-indigo-200"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {i + 1}. {l.label}
          </button>
        ))}
      </nav>

      <section className="min-h-[22rem] rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm text-rose-300"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : !view ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2
              className="size-5 animate-spin text-zinc-600"
              aria-label="Loading"
            />
          </div>
        ) : level === "genome" ? (
          <LevelGenome view={view} />
        ) : level === "locus" ? (
          <LevelLocus view={view} />
        ) : level === "helix" ? (
          <LevelHelix view={view} />
        ) : level === "translation" ? (
          <LevelTranslation view={view} />
        ) : (
          <LevelProtein view={view} />
        )}
      </section>

      {view && (
        <div className="flex justify-between">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 disabled:invisible"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Zoom out
          </button>
          <button
            onClick={() => go(1)}
            disabled={index === LEVELS.length - 1}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/30 disabled:invisible"
          >
            Zoom in to {LEVELS[Math.min(index + 1, LEVELS.length - 1)].label}
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </main>
  );
}
