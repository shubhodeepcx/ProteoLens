"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { EXHAUSTIVENESS_CHOICES, siteTitle } from "@/lib/docking-format";
import type { DockRequest, DockingSite } from "@/lib/docking-types";

const SELECTION = "selection";

/** Where to dock, what to dock, and how hard to search. */
export function DockingForm({
  sites,
  running,
  onDock,
}: {
  sites: readonly DockingSite[];
  running: boolean;
  onDock: (request: DockRequest) => void;
}) {
  const selected = useStore((s) => s.selected);
  const [target, setTarget] = useState<string>(sites[0]?.id ?? SELECTION);
  const [smiles, setSmiles] = useState<string>(sites[0]?.smiles ?? "");
  const [exhaustiveness, setExhaustiveness] = useState<number>(8);

  const site = sites.find((s) => s.id === target);
  const residues = [...selected];
  const noTarget = target === SELECTION && residues.length === 0;

  function pickTarget(id: string) {
    setTarget(id);
    const next = sites.find((s) => s.id === id);
    if (next?.smiles) setSmiles(next.smiles);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (noTarget || !smiles.trim()) return;
    onDock({
      smiles: smiles.trim(),
      exhaustiveness,
      ...(site ? { site: site.id } : { residues }),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Dock a ligand">
      <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
        Dock into
        <select
          value={target}
          onChange={(e) => pickTarget(e.target.value)}
          className="mt-1 block w-full rounded border border-border bg-card px-2 py-1 text-xs normal-case tracking-normal text-foreground"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {siteTitle(s)} pocket
            </option>
          ))}
          <option value={SELECTION}>
            Selected residues ({residues.length})
          </option>
        </select>
      </label>
      {noTarget && (
        <p className="text-[11px] text-amber-700">
          Select the pocket residues in 3D or in the sequence first.
        </p>
      )}
      <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
        Ligand SMILES
        <textarea
          value={smiles}
          onChange={(e) => setSmiles(e.target.value)}
          rows={3}
          maxLength={500}
          spellCheck={false}
          placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
          className="mt-1 block w-full resize-y rounded border border-border bg-card px-2 py-1 font-mono text-[11px] normal-case tracking-normal text-foreground"
        />
      </label>
      {site?.smiles && smiles.trim() === site.smiles && (
        <p className="text-[11px] text-muted-foreground">
          This is {site.code} itself, so poses are scored against its crystal pose.
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Search effort
          <select
            value={exhaustiveness}
            onChange={(e) => setExhaustiveness(Number(e.target.value))}
            className="mt-1 block rounded border border-border bg-card px-2 py-1 text-xs normal-case tracking-normal text-foreground"
          >
            {EXHAUSTIVENESS_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 4 ? "Quick" : n === 8 ? "Standard" : "Thorough"} ({n})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={running || noTarget || !smiles.trim()}
          className="ml-auto rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? "Docking…" : "Dock"}
        </button>
      </div>
    </form>
  );
}
