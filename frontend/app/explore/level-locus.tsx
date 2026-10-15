import type { ExplorerView } from "@/lib/explorer-types";
import {
  codingBoxes,
  exonBoxes,
  formatBp,
  fromFivePrime,
} from "@/lib/explorer-format";

const X0 = 40;
const SPAN = 520;
const MID = 60;

/** Level 2: the gene drawn 5'→3' — exons, UTRs, introns, and the variant. */
export function LevelLocus({ view }: { view: ExplorerView }) {
  const { gene, variant } = view;
  const at = (f: number) => X0 + f * SPAN;
  const mark = at(fromFivePrime(gene, variant.genomic_position));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-300">
        {gene.description ? (
          <>
            {gene.symbol} encodes {gene.description}.{" "}
          </>
        ) : null}
        Its canonical transcript, {gene.transcript}, has {gene.exons.length}{" "}
        exons. The variant falls in{" "}
        {variant.exon_number ? (
          <>exon {variant.exon_number}</>
        ) : (
          <>a region outside the exons</>
        )}
        .
      </p>
      <svg
        viewBox="0 0 600 120"
        className="w-full"
        role="img"
        aria-label={`${gene.symbol} gene model`}
      >
        <line
          x1={X0}
          x2={X0 + SPAN}
          y1={MID}
          y2={MID}
          stroke="#52525b"
          strokeWidth={1.5}
        />
        <text
          x={X0 - 8}
          y={MID + 4}
          textAnchor="end"
          fontSize={10}
          fill="#a1a1aa"
        >
          5′
        </text>
        <text x={X0 + SPAN + 8} y={MID + 4} fontSize={10} fill="#a1a1aa">
          3′
        </text>
        {exonBoxes(gene).map((b) => (
          <rect
            key={`u${b.number}`}
            x={at(b.x)}
            y={MID - 6}
            width={Math.max(2, b.width * SPAN)}
            height={12}
            fill="#3f3f46"
          />
        ))}
        {codingBoxes(gene).map((b) => (
          <g key={`c${b.number}`}>
            <rect
              x={at(b.x)}
              y={MID - 12}
              width={Math.max(2, b.width * SPAN)}
              height={24}
              rx={2}
              fill="#6366f1"
            />
            <text
              x={at(b.x + b.width / 2)}
              y={MID + 28}
              textAnchor="middle"
              fontSize={9}
              fill="#a5b4fc"
            >
              exon {b.number}
            </text>
          </g>
        ))}
        <line
          x1={mark}
          x2={mark}
          y1={MID - 30}
          y2={MID + 14}
          stroke="#f43f5e"
          strokeWidth={2}
        />
        <text
          x={mark}
          y={MID - 34}
          textAnchor="middle"
          fontSize={10}
          fill="#fda4af"
        >
          {variant.hgvs_c}
        </text>
        <text x={X0} y={110} fontSize={9} fill="#71717a">
          chr{gene.chromosome}:{gene.start.toLocaleString()}–
          {gene.end.toLocaleString()} ({gene.strand === 1 ? "+" : "−"} strand) ·{" "}
          {formatBp(gene.end - gene.start + 1)}
        </text>
      </svg>
      <p className="text-xs text-zinc-500">
        Tall boxes are coding sequence, short boxes are untranslated regions,
        and the line between them is intron, spliced out of the mRNA.
        {gene.strand === -1 &&
          ` ${gene.symbol} is read from the minus strand, so it is drawn mirrored: its 5′ end has the higher chromosome coordinate.`}
      </p>
    </div>
  );
}
