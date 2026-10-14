import { CompositionBarChart } from "@/components/charts/composition-bar-chart";
import { HydrophobicityLineChart } from "@/components/charts/hydrophobicity-line-chart";
import { SecondaryStructureDonut } from "@/components/charts/secondary-structure-donut";
import { sequenceLines } from "@/lib/report";
import type { AnalyticsResponse, ChainInfo, ProteinAnnotations } from "@/lib/types";

export function Facts({ rows }: { rows: [string, string | number | null][] }) {
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {rows
          .filter(([, value]) => value !== null && value !== "")
          .map(([label, value]) => (
            <tr key={label} className="border-b border-neutral-200">
              <th scope="row" className="w-40 py-1 pr-3 text-left font-medium text-neutral-500">
                {label}
              </th>
              <td className="py-1 text-neutral-900">{value}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 pt-6">
      <h2 className="border-b border-neutral-300 pb-1 text-[13px] font-semibold tracking-wide text-neutral-900 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function BiologySection({ biology }: { biology: ProteinAnnotations }) {
  return (
    <Section title="Biology (UniProt)">
      <Facts
        rows={[
          ["Protein", biology.protein_name],
          ["Genes", biology.gene_names.join(", ") || null],
          ["Location", biology.subcellular_locations.map((l) => l.location).join(", ") || null],
          ["EC numbers", biology.catalytic_activity.map((c) => c.ec_number).filter(Boolean).join(", ") || null],
        ]}
      />
      {biology.function.length > 0 && (
        <p className="text-[12px] leading-relaxed text-neutral-800">{biology.function.join(" ")}</p>
      )}
      {biology.diseases.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-[12px] font-semibold">Disease associations</h3>
          <ul className="list-disc space-y-1 pl-5 text-[12px] text-neutral-800">
            {biology.diseases.map((d) => (
              <li key={d.name}>
                <span className="font-medium">{d.name}</span>
                {d.mim_id ? ` (MIM ${d.mim_id})` : ""}
                {d.description ? `: ${d.description}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

export function AnalyticsSection({ analytics }: { analytics: AnalyticsResponse }) {
  return (
    <Section title="Analytics">
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div className="break-inside-avoid">
          <h3 className="mb-1 text-[12px] font-semibold">Amino-acid composition</h3>
          <CompositionBarChart data={analytics.composition} />
        </div>
        <div className="break-inside-avoid">
          <h3 className="mb-1 text-[12px] font-semibold">Secondary structure</h3>
          <SecondaryStructureDonut data={analytics.secondary_structure} />
        </div>
      </div>
      <div className="break-inside-avoid">
        <h3 className="mb-1 text-[12px] font-semibold">
          Hydropathy, chain {analytics.hydrophobicity.chain_id} (Kyte-Doolittle, window{" "}
          {analytics.hydrophobicity.window})
        </h3>
        <HydrophobicityLineChart data={analytics.hydrophobicity} />
      </div>
    </Section>
  );
}

export function SequencesSection({ chains }: { chains: ChainInfo[] }) {
  return (
    <Section title="Sequences">
      {chains.map((chain) => (
        <div key={chain.label} className="break-inside-avoid space-y-1">
          <h3 className="text-[12px] font-semibold">
            Chain {chain.label} · {chain.sequence.length} residues
          </h3>
          <pre className="font-mono text-[10.5px] leading-snug whitespace-pre-wrap text-neutral-800">
            {sequenceLines(chain.sequence)
              .map((line) => `${String(line.start).padStart(5)}  ${line.text}`)
              .join("\n")}
          </pre>
        </div>
      ))}
    </Section>
  );
}
