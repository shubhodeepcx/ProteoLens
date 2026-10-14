import type { SearchSource } from "@/lib/types";

const SOURCE_LABEL: Record<SearchSource, string> = {
  rcsb: "RCSB PDB",
  alphafold: "AlphaFold",
  uniprot: "UniProt",
};

// One accent per database so a mixed result list stays scannable.
const SOURCE_CLASS: Record<SearchSource, string> = {
  rcsb: "border-sky-200 bg-sky-50 text-sky-700",
  alphafold: "border-violet-200 bg-violet-50 text-violet-700",
  uniprot: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function sourceLabel(source: SearchSource): string {
  return SOURCE_LABEL[source];
}

export function SourceBadge({ source }: { source: SearchSource }) {
  return (
    <span
      data-testid={`source-badge-${source}`}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SOURCE_CLASS[source]}`}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}
