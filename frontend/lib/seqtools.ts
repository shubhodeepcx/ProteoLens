import { apiPost } from "@/lib/api";

/**
 * P14 sequence tools: client types and calls for `/api/tools/*`.
 *
 * Every position here is 1-based on the forward strand of the sequence as
 * submitted, whichever strand the feature lies on (see the backend's
 * `services/seqtools.py`), so all four tools can draw on one ruler.
 */

export type Strand = "+" | "-";

export interface SequenceStats {
  length: number;
  gc_percent: number;
  counts: Record<string, number>;
  reverse_complement: string;
  molecular_weight_ds: number;
}

export interface Orf {
  frame: 1 | 2 | 3 | -1 | -2 | -3;
  strand: Strand;
  start: number;
  end: number;
  length_nt: number;
  length_aa: number;
  complete: boolean;
  protein: string;
}

export interface OrfResponse {
  stats: SequenceStats;
  orfs: Orf[];
  frames: { frame: Orf["frame"]; protein: string }[];
}

export interface EnzymeCuts {
  name: string;
  site: string;
  overhang: "5'" | "3'" | "blunt" | "unknown";
  cuts: number[];
  fragments: number[];
}

export interface RestrictionResponse {
  length: number;
  circular: boolean;
  enzymes: EnzymeCuts[];
  unique_cutters: string[];
  non_cutters: string[];
}

export interface Primer {
  sequence: string;
  strand: Strand;
  start: number;
  end: number;
  length: number;
  tm: number;
  gc_percent: number;
  gc_clamp: boolean;
  max_run: number;
  self_dimer_3prime: number;
  penalty: number;
}

export interface PrimerPair {
  forward: Primer;
  reverse: Primer;
  product_size: number;
  tm_difference: number;
  pair_dimer_3prime: number;
  penalty: number;
}

export interface PrimerResponse {
  target_start: number;
  target_end: number;
  pairs: PrimerPair[];
  notes: string[];
}

export interface CrisprGuide {
  protospacer: string;
  pam: string;
  strand: Strand;
  start: number;
  end: number;
  cut_site: number;
  gc_percent: number;
  flags: string[];
  off_targets_in_sequence: number;
  score: number;
}

export interface CrisprResponse {
  nuclease: string;
  guides: CrisprGuide[];
  total_sites: number;
  notes: string[];
}

export interface ToolInput {
  sequence: string;
  circular: boolean;
  targetStart: number | null;
  targetEnd: number | null;
  minCodons: number;
}

export interface ToolResults {
  orfs: OrfResponse;
  restriction: RestrictionResponse;
  primers: PrimerResponse;
  crispr: CrisprResponse;
}

const target = (input: ToolInput) => ({
  target_start: input.targetStart ?? undefined,
  target_end: input.targetEnd ?? undefined,
});

/**
 * Run all four tools on one input. They are cheap, local computations, so
 * running them together keeps every tab in step with the sequence on screen
 * instead of one tab silently showing an older sequence's results.
 */
export async function runAllTools(input: ToolInput): Promise<ToolResults> {
  const sequence = input.sequence;
  const [orfs, restriction, primers, crispr] = await Promise.all([
    apiPost<OrfResponse>("/api/tools/orfs", { sequence, min_codons: input.minCodons }),
    apiPost<RestrictionResponse>("/api/tools/restriction", {
      sequence,
      circular: input.circular,
    }),
    apiPost<PrimerResponse>("/api/tools/primers", { sequence, ...target(input) }),
    apiPost<CrisprResponse>("/api/tools/crispr", { sequence, ...target(input) }),
  ]);
  return { orfs, restriction, primers, crispr };
}

/** Bases in a pasted sequence, ignoring FASTA headers, spaces and numbering. */
export function countBases(text: string): number {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*[>;]/.test(line))
    .join("")
    .replace(/[\s\d]/g, "").length;
}

/** "1,234 bp" */
export function bp(n: number): string {
  return `${n.toLocaleString("en-US")} bp`;
}

/** Frame label as printed by most tools: +1, +2, +3, -1, -2, -3. */
export function frameLabel(frame: number): string {
  return frame > 0 ? `+${frame}` : String(frame);
}

/**
 * A deterministic demo construct: an 80-codon ORF behind a short 5' flank and
 * followed by a multiple cloning site, padded with pseudo-random sequence.
 * It is synthetic on purpose; it exists to show every tool returning results,
 * not to stand in for a real gene.
 */
export function exampleSequence(): string {
  // mulberry32: 32-bit integer maths only, so the sequence is identical in
  // every JS engine and never loses precision the way a float LCG does.
  let state = 20240917;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const random = (n: number) =>
    Array.from({ length: n }, () => "ACGT"[next() % 4]).join("");
  const codons = ["GCT", "AAA", "GAG", "CTG", "TTC", "CGC", "GAT", "ACC", "CAG", "TGG"];
  const orf =
    "ATG" + Array.from({ length: 80 }, () => codons[next() % codons.length]).join("") + "TAA";
  const mcs = "GAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTT";
  const body = random(180) + orf + random(120) + mcs + random(240);
  return body.match(/.{1,60}/g)!.join("\n");
}
