"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Outbound } from "@/components/annotation-section";
import { CLASS_META, formatAf, hex } from "@/lib/clinical-format";
import type { ClinicalClass, ClinicalVariant } from "@/lib/clinical-types";

const PAGE = 60;

/**
 * The itemised variants, most severe and best attested first (the backend's
 * order). Clicking a row selects every copy of that residue in 3D.
 */
export function ClinicalVariantList({
  variants,
  filter,
}: {
  variants: readonly ClinicalVariant[];
  filter: ClinicalClass | null;
}) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variants.filter(
      (v) =>
        (filter === null || v.clinical_class === filter) &&
        (q === "" ||
          v.short.toLowerCase().includes(q) ||
          v.hgvs.toLowerCase().includes(q) ||
          v.diseases.some((d) => d.toLowerCase().includes(q))),
    );
  }, [variants, filter, query]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShown(PAGE);
        }}
        placeholder="Find a variant or disease, e.g. R175H"
        aria-label="Find a variant"
        className="h-7 w-full rounded-md border border-border bg-muted/50 px-2 text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none"
      />
      {visible.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No variant matches.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {visible.slice(0, shown).map((v, i) => (
            <VariantRow key={`${i}-${v.hgvs}-${v.consequence ?? ""}`} variant={v} />
          ))}
        </ul>
      )}
      {visible.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="text-[11px] text-sky-700 hover:underline"
        >
          Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}
        </button>
      )}
    </div>
  );
}

function VariantRow({ variant: v }: { variant: ClinicalVariant }) {
  const setSelection = useStore((s) => s.setSelection);
  const meta = CLASS_META[v.clinical_class];
  const keys = v.residues.map((r) => r.key);

  return (
    <li className="px-2.5 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={keys.length === 0}
          onClick={() => setSelection(keys)}
          title={keys.length ? `Select ${keys.join(", ")} in 3D` : "Not in this structure"}
          className="font-mono font-semibold text-foreground hover:text-sky-700 disabled:text-muted-foreground"
        >
          {v.short}
        </button>
        <span className="font-mono text-muted-foreground">{v.hgvs}</span>
        <span
          className="ml-auto rounded px-1.5 py-px text-[10px] font-medium text-[#fff]"
          style={{ backgroundColor: hex(meta.color) }}
        >
          {meta.label}
        </span>
      </div>
      {v.diseases.length > 0 && (
        <p className="mt-1 text-muted-foreground">{v.diseases.join(" · ")}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {v.consequence && <span>{v.consequence}</span>}
        <span>gnomAD AF {formatAf(v.gnomad_af)}</span>
        {v.alphamissense !== null && <span>AM residue {v.alphamissense.toFixed(2)}</span>}
        {v.predictions.map((p) => (
          <span key={p.algorithm}>
            {p.algorithm} {p.label}
          </span>
        ))}
        {v.somatic && <span className="text-amber-700">somatic</span>}
        {keys.length === 0 && <span className="text-amber-700">not modelled here</span>}
      </div>
      {(v.clinvar_ids.length > 0 || v.dbsnp_id) && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px]">
          {v.clinvar_ids.slice(0, 2).map((rcv) => (
            <Outbound key={rcv} href={`https://www.ncbi.nlm.nih.gov/clinvar/${rcv}/`}>
              {rcv}
            </Outbound>
          ))}
          {v.dbsnp_id && (
            <Outbound href={`https://www.ncbi.nlm.nih.gov/snp/${v.dbsnp_id}`}>
              {v.dbsnp_id}
            </Outbound>
          )}
        </div>
      )}
    </li>
  );
}
