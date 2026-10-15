"use client";

import { useState } from "react";
import type { ExplorerView } from "@/lib/explorer-types";
import { BASE_COLORS, complement, helixSlice } from "@/lib/explorer-format";
import { usePhase } from "./use-phase";

const STEP = 26;
const MID = 70;
const AMP = 34;
const TWIST = (2 * Math.PI) / 10.5; // B-DNA: ~10.5 base pairs per turn

/** Level 3: the double helix around the variant codon, normal or mutant. */
export function LevelHelix({ view }: { view: ExplorerView }) {
  const { variant, gene } = view;
  const [mutant, setMutant] = useState(true);
  const [running, setRunning] = useState(true);
  const phase = usePhase(running);
  const slice = helixSlice(
    view.window,
    variant.protein_position,
    mutant ? "alt" : "ref",
  );
  const changed = new Set(variant.changed_bases.map((b) => slice.offset + b));
  const template = complement(slice.dna);
  const width = slice.dna.length * STEP + 40;
  const y = (i: number, s: 1 | -1) =>
    MID + s * AMP * Math.sin(phase + i * TWIST);
  const strand = (s: 1 | -1) =>
    [...slice.dna]
      .map((_, i) => `${i ? "L" : "M"}${20 + i * STEP},${y(i, s)}`)
      .join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Allele"
          className="flex rounded-md border border-zinc-700 p-0.5"
        >
          {[false, true].map((m) => (
            <button
              key={String(m)}
              aria-pressed={mutant === m}
              onClick={() => setMutant(m)}
              className={`rounded px-2.5 py-1 text-xs ${mutant === m ? "bg-zinc-700 text-zinc-50" : "text-zinc-400"}`}
            >
              {m
                ? `Mutant ${variant.alt_codon}`
                : `Normal ${variant.ref_codon}`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRunning((r) => !r)}
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          {running ? "Pause" : "Spin"}
        </button>
      </div>
      <svg
        viewBox={`0 0 ${width} 140`}
        className="w-full"
        role="img"
        aria-label="DNA double helix"
      >
        {[...slice.dna].map((base, i) => {
          const x = 20 + i * STEP;
          const front = Math.cos(phase + i * TWIST) > 0;
          const hit = changed.has(i);
          return (
            <g key={i} data-base={hit ? "changed" : undefined}>
              <line
                x1={x}
                x2={x}
                y1={y(i, 1)}
                y2={MID}
                stroke={BASE_COLORS[base]}
                strokeWidth={5}
                strokeOpacity={front ? 1 : 0.45}
              />
              <line
                x1={x}
                x2={x}
                y1={MID}
                y2={y(i, -1)}
                stroke={BASE_COLORS[template[i]]}
                strokeWidth={5}
                strokeOpacity={front ? 1 : 0.45}
              />
              {hit && (
                <circle
                  cx={x}
                  cy={MID}
                  r={11}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth={2}
                />
              )}
              <text
                x={x}
                y={10}
                textAnchor="middle"
                fontSize={10}
                fill={hit ? "#fda4af" : "#d4d4d8"}
              >
                {base}
              </text>
              <text
                x={x}
                y={136}
                textAnchor="middle"
                fontSize={10}
                fill="#71717a"
              >
                {template[i]}
              </text>
            </g>
          );
        })}
        <path d={strand(1)} fill="none" stroke="#a1a1aa" strokeWidth={3} />
        <path d={strand(-1)} fill="none" stroke="#52525b" strokeWidth={3} />
      </svg>
      <p className="text-xs text-zinc-400">
        Top row: the coding strand, 5′→3′, codons {slice.firstCodon}–
        {slice.firstCodon + slice.dna.length / 3 - 1}. Bottom row: the template
        strand the RNA polymerase reads. A pairs with T, G with C. Codon{" "}
        {variant.protein_position} {variant.ref_codon}→{variant.alt_codon} (
        {variant.hgvs_c}).
      </p>
      <p className="text-xs text-zinc-500">
        On the chromosome&apos;s + strand this is chr{gene.chromosome}:
        {variant.genomic_position.toLocaleString()} {variant.genomic_ref}&gt;
        {variant.genomic_alt}
        {gene.strand === -1 &&
          `, the complement, because ${gene.symbol} is read from the minus strand`}
        .
      </p>
    </div>
  );
}
