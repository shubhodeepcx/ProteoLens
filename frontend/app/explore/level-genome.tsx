import type { ExplorerView } from "@/lib/explorer-types";
import { bandFill, formatBp } from "@/lib/explorer-format";

const W = 26;
const H = 190;
const TOP = 16;

/** Level 1: the 24 human chromosomes, G-banded, with the gene marked. */
export function LevelGenome({ view }: { view: ExplorerView }) {
  const { gene, chromosomes } = view;
  const longest = Math.max(...chromosomes.map((c) => c.length), 1);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-300">
        <span className="font-semibold text-zinc-100">{gene.symbol}</span> sits
        on chromosome {gene.chromosome}
        {gene.cytoband && <>, band {gene.cytoband}</>}, one of 3.1 billion base
        pairs in the human genome (GRCh38).
      </p>
      <svg
        viewBox={`0 0 ${chromosomes.length * W} ${H + TOP + 18}`}
        className="w-full"
        role="img"
        aria-label={`Human karyotype with ${gene.symbol} marked on chromosome ${gene.chromosome}`}
      >
        {chromosomes.map((c, i) => {
          const x = i * W + W / 2 - 5;
          const h = (c.length / longest) * H;
          const target = c.name === gene.chromosome;
          const mark = TOP + (gene.start / c.length) * h;
          return (
            <g
              key={c.name}
              opacity={target ? 1 : 0.55}
              data-chromosome={c.name}
            >
              <clipPath id={`chr-${c.name}`}>
                <rect x={x} y={TOP} width={10} height={h} rx={5} />
              </clipPath>
              <g clipPath={`url(#chr-${c.name})`}>
                <rect x={x} y={TOP} width={10} height={h} fill="#e4e4e7" />
                {c.bands.map((b) => (
                  <rect
                    key={b.id}
                    x={x}
                    y={TOP + (b.start / c.length) * h}
                    width={10}
                    height={Math.max(0.5, ((b.end - b.start) / c.length) * h)}
                    fill={bandFill(b.stain)}
                  />
                ))}
              </g>
              <rect
                x={x}
                y={TOP}
                width={10}
                height={h}
                rx={5}
                fill="none"
                stroke={target ? "#818cf8" : "#52525b"}
                strokeWidth={target ? 1.5 : 0.5}
              />
              {target && (
                <g>
                  <line
                    x1={x - 4}
                    x2={x + 14}
                    y1={mark}
                    y2={mark}
                    stroke="#f43f5e"
                    strokeWidth={2}
                  />
                  <text
                    x={x + 5}
                    y={TOP - 5}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#fda4af"
                  >
                    {gene.symbol}
                  </text>
                </g>
              )}
              <text
                x={x + 5}
                y={TOP + h + 12}
                textAnchor="middle"
                fontSize={8}
                fill={target ? "#e0e7ff" : "#71717a"}
              >
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-zinc-500">
        Dark G-bands are AT-rich and gene-poor; the red waist is the centromere.
        Chromosome {gene.chromosome} is{" "}
        {formatBp(
          chromosomes.find((c) => c.name === gene.chromosome)?.length ?? 0,
        )}{" "}
        long; {gene.symbol} covers {formatBp(gene.end - gene.start + 1)} of it.
      </p>
    </div>
  );
}
