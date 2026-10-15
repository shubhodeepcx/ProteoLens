import type { ExplorerView, Scenario } from "@/lib/explorer-types";

/**
 * `GET /api/explorer?scenario=sickle-cell`, produced by the backend from
 * `backend/tests/fixtures/explorer_HBB.json`. Trimmed to two chromosomes and a
 * few bands; nothing else edited.
 */
export const SICKLE: ExplorerView = {
  scenario: {
    id: "sickle-cell",
    title: "Sickle cell disease",
    disease: "Sickle cell anaemia",
    field: "Molecular biology",
    gene: "HBB",
    change: "E7V",
    summary:
      "One base, GAG to GTG, swaps a charged glutamate for a sticky valine on the surface of haemoglobin.",
    story: [
      "Codon 7 of HBB (written Glu6Val in the older numbering that skips the first Met) changes from GAG to GTG: an A-to-T transversion.",
      "The mRNA carries GUG, and the ribosome inserts valine where glutamate belongs.",
    ],
    structure_note: null,
  },
  gene: {
    symbol: "HBB",
    description: "hemoglobin subunit beta",
    ensembl_gene: "ENSG00000244734",
    chromosome: "11",
    start: 5225464,
    end: 5229395,
    strand: -1,
    cytoband: "11p15.4",
    transcript: "ENST00000335295",
    exons: [
      { number: 1, start: 5226930, end: 5227071 },
      { number: 2, start: 5226577, end: 5226799 },
      { number: 3, start: 5225464, end: 5225726 },
    ],
    cds_start: 5225598,
    cds_end: 5227021,
  },
  chromosomes: [
    {
      name: "1",
      length: 248956422,
      bands: [
        { id: "p36.33", start: 1, end: 2300000, stain: "gneg" },
        { id: "p36.32", start: 2300001, end: 5300000, stain: "gpos25" },
      ],
    },
    {
      name: "11",
      length: 135086622,
      bands: [
        { id: "p15.5", start: 1, end: 2800000, stain: "gneg" },
        { id: "p15.4", start: 2800001, end: 11700000, stain: "gpos50" },
        { id: "p11.11", start: 51000001, end: 53400000, stain: "acen" },
      ],
    },
  ],
  variant: {
    protein_position: 7,
    ref_aa: "E",
    alt_aa: "V",
    ref_aa3: "Glu",
    alt_aa3: "Val",
    ref_codon: "GAG",
    alt_codon: "GTG",
    changed_bases: [1],
    consequence: "missense",
    hgvs_p: "p.Glu7Val",
    hgvs_c: "c.20A>T",
    genomic_position: 5227002,
    genomic_ref: "T",
    genomic_alt: "A",
    exon_number: 1,
  },
  window: {
    first_codon: 1,
    ref: "ATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGC",
    alt: "ATGGTGCATCTGACTCCTGTGGAGAAGTCTGCCGTTACTGCCCTGTGGGGC",
    ref_protein: "MVHLTPEEKSAVTALWG",
    alt_protein: "MVHLTPVEKSAVTALWG",
  },
  accession: "P68871",
  protein_length: 147,
  handoff_ok: true,
  notes: [],
};

export const SCENARIOS: Scenario[] = [
  SICKLE.scenario!,
  {
    id: "kras-g12c",
    title: "KRAS G12C",
    disease: "Lung adenocarcinoma",
    field: "Oncology",
    gene: "KRAS",
    change: "G12C",
    summary: "A switch stuck on.",
    story: ["Codon 12 of KRAS changes from GGT to TGT."],
    structure_note: "RCSB 6OIM shows KRAS G12C with sotorasib bound to Cys12.",
  },
];
