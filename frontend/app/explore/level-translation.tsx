"use client";

import { useEffect, useState } from "react";
import type { ExplorerView } from "@/lib/explorer-types";
import { codons, transcribe, type CodonCell } from "@/lib/explorer-format";

/** Level 4: transcription to mRNA, then a ribosome reading codon by codon. */
export function LevelTranslation({ view }: { view: ExplorerView }) {
  const { variant, window } = view;
  const normal = codons(window, "ref");
  const mutant = codons(window, "alt");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const done = step >= normal.length;

  useEffect(() => {
    if (!playing || done) return;
    const t = setTimeout(() => setStep((s) => s + 1), 450);
    return () => clearTimeout(t);
  }, [playing, done, step]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-300">
        RNA polymerase copies the coding strand into mRNA (T becomes U). The
        ribosome then reads it three bases at a time; each codon brings in one
        amino acid on its tRNA.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setStep((s) => Math.min(s + 1, normal.length))}
          disabled={done}
          className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          Next codon
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={done}
          className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => setStep(normal.length)}
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          Translate all
        </button>
        <button
          onClick={() => {
            setStep(0);
            setPlaying(false);
          }}
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          Reset
        </button>
      </div>
      <Strand
        label="Normal"
        cells={normal}
        step={step}
        position={variant.protein_position}
      />
      <Strand
        label="Mutant"
        cells={mutant}
        step={step}
        position={variant.protein_position}
      />
      {done && (
        <p className="text-sm text-zinc-200" data-testid="translation-result">
          Codon {variant.protein_position}: {transcribe(variant.ref_codon)} →{" "}
          {variant.ref_aa3} becomes {transcribe(variant.alt_codon)} →{" "}
          {variant.alt_aa3}. A {variant.consequence} change, {variant.hgvs_p}.
        </p>
      )}
    </div>
  );
}

function Strand({
  label,
  cells,
  step,
  position,
}: {
  label: string;
  cells: CodonCell[];
  step: number;
  position: number;
}) {
  return (
    <div className="flex flex-col gap-1" aria-label={`${label} translation`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {cells.map((c, i) => {
          const variant = c.number === position;
          const reading = i === step;
          return (
            <div
              key={c.number}
              className={`flex w-11 flex-col items-center rounded border py-1 font-mono text-[11px] ${
                variant
                  ? "border-rose-500/70"
                  : reading
                    ? "border-indigo-400"
                    : "border-zinc-800"
              } ${reading ? "bg-indigo-500/15" : ""}`}
              title={`Codon ${c.number}`}
            >
              <span className="text-zinc-300">{transcribe(c.bases)}</span>
              <span
                className={
                  i < step
                    ? variant
                      ? "text-rose-300"
                      : "text-emerald-300"
                    : "text-transparent"
                }
              >
                {i < step ? (c.aa === "*" ? "Stop" : c.aa) : "·"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
