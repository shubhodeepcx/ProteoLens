/** Static copy for the landing page: the rail preview and the data sources. */

export interface RailTab {
  value: string;
  title: string;
  /** Where the panel's data comes from. Named so the claim is checkable. */
  source: string;
  /** What the tab shows today — not what it is planned to show. */
  items: readonly string[];
}

/**
 * The landing page's preview of the viewer rail.
 *
 * This copy has drifted from reality twice already: it once promised features
 * that had shipped as though they were still to come, and it listed three tabs
 * for months after the rail grew to five. Every line below names something the
 * viewer renders right now, so the honest way to change it is to change it
 * when the rail changes.
 */
export const RAIL_TABS: readonly RailTab[] = [
  {
    value: "overview",
    title: "Overview",
    source: "Structure file",
    items: [
      "Name, organism, source database and accession",
      "File format, and whether B-factors hold pLDDT confidence",
      "Chains, residues, atoms and molecular weight",
      "Parser warnings, when the file raised any",
    ],
  },
  {
    value: "sequence",
    title: "Sequence",
    source: "Structure file",
    items: [
      "One-letter sequence per chain on a clickable grid",
      "Coloured by residue class, with a position ruler",
      "Click any residue to highlight it in 3D, and vice versa",
      "Find a residue by chain and position, e.g. A:12",
    ],
  },
  {
    value: "analytics",
    title: "Analytics",
    source: "Computed server-side",
    items: [
      "Amino-acid composition across all 20 residues",
      "Secondary-structure breakdown across helices, sheets, and coils",
      "Kyte-Doolittle hydrophobicity along the longest chain",
      "Chain lengths side by side",
    ],
  },
  {
    value: "annotations",
    title: "Annotations",
    source: "UniProtKB + this structure",
    items: [
      "Function, catalytic activity with EC and Rhea IDs",
      "Gene Ontology across all three aspects, and keywords",
      "Subcellular location, transmembrane spans, disease and PTM",
      "Curated active and ligand-binding sites mapped onto residues in the structure",
      "Ligands bound in the file, and the residues within 4 Å of them",
      "Per-chain surface hydrophobicity and charge",
    ],
  },
  {
    value: "variants",
    title: "Variants",
    source: "Structure file, UniProt",
    items: [
      "Type a protein change such as R175H, p.Arg175His, W53* or F508del",
      "Clinical numbering mapped through UniProt, with the reference residue checked",
      "Burial, neighbours, interfaces, DNA/RNA, ligands and disulfides at that residue",
      "Structural rules of thumb with their reasons, never a pathogenicity score",
    ],
  },
  {
    value: "compounds",
    title: "Compounds",
    source: "Structure file",
    items: [
      "DNA and RNA strands, with GC content and the protein residues that touch them",
      "Ligands, cofactors, ions and glycans, named from the file's own records",
      "Free amino acids told apart from modified residues inside the chain",
      "Click any contact residue to highlight it in 3D",
    ],
  },
  {
    value: "similarity",
    title: "Similarity",
    source: "EBI NCBI BLAST, UniRef",
    items: [
      "Precomputed UniRef homologs, returned immediately",
      "BLAST search against UniProtKB and the ENA nucleotide sets",
      "blastp, blastn, tblastn and blastx, with live progress",
      "Identity, E-value and score per hit, each openable in the viewer",
    ],
  },
  {
    value: "complexes",
    title: "Complexes",
    source: "EBI Complex Portal",
    items: [
      "Every curated complex this protein participates in",
      "Participants with their stoichiometry",
      "Links back to the Complex Portal record",
    ],
  },
  {
    value: "clinical",
    title: "Clinical",
    source: "EBI Proteins API, AlphaFold DB",
    items: [
      "ClinVar and UniProt significance for every reported variant",
      "Diseases named by pathogenic variants, ranked",
      "gnomAD allele frequency, SIFT and PolyPhen per variant",
      "Paint the structure by AlphaMissense or by pathogenic burden",
      "Click a variant to select it in 3D",
    ],
  },
  {
    value: "oncology",
    title: "Oncology",
    source: "cancerhotspots.org, cBioPortal, ChEMBL, CIViC, Reactome, STRING",
    items: [
      "Somatic mutation lollipop plot across 32 TCGA PanCancer studies",
      "Recurrent tumour hotspots and the cancer types that carry them",
      "Drugs acting on the protein, including mutant-specific inhibitors",
      "CIViC sensitivity, resistance and prognostic evidence",
      "Reactome pathways and STRING interaction partners",
      "Paint the structure by hotspot or by mutation density",
    ],
  },
  {
    value: "neoantigens",
    title: "Neoantigens",
    source: "IEDB (NetMHCpan 4.1)",
    items: [
      "Every mutant 8-11mer around a missense change, scored on HLA class I",
      "Each candidate next to its wild-type peptide and rank",
      "Anchor versus T-cell-facing changes flagged",
      "Paint the predicted epitopes onto the structure",
    ],
  },
  {
    value: "conservation",
    title: "Conservation",
    source: "PDBe-KB",
    items: [
      "Information content of every residue across homologous sequences",
      "Conservation plotted along the sequence",
      "The most conserved residues, one click from 3D",
      "Paint the structure from variable (turquoise) to conserved (maroon)",
    ],
  },
];

export interface DataSource {
  name: string;
  /** The host the backend actually talks to. Checkable against `backend/app/services/`. */
  host: string;
  body: string;
}

/**
 * The public services this app is wired to. Each host below appears in a
 * client under `backend/app/services/`, so this list is falsifiable rather
 * than aspirational — which is the standard the landing page failed before.
 */
export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: "RCSB PDB",
    host: "data.rcsb.org",
    body: "Search, import, and download experimental coordinates in mmCIF or PDB format.",
  },
  {
    name: "AlphaFold DB",
    host: "alphafold.ebi.ac.uk",
    body: "Predicted models with per-residue pLDDT confidence scores and coloring.",
  },
  {
    name: "UniProtKB",
    host: "rest.uniprot.org",
    body: "Functional annotations, catalytic activity, Gene Ontology, subcellular location, and PTMs.",
  },
  {
    name: "EBI Proteins API",
    host: "ebi.ac.uk/proteins",
    body: "Variants with ClinVar significance, disease associations and gnomAD frequencies.",
  },
  {
    name: "cBioPortal",
    host: "www.cbioportal.org",
    body: "Somatic mutations across the TCGA PanCancer Atlas, with cancerhotspots.org hotspots.",
  },
  {
    name: "ChEMBL + CIViC",
    host: "civicdb.org",
    body: "Drugs with a mechanism on the protein, and curated sensitivity and resistance evidence.",
  },
  {
    name: "PDBe-KB",
    host: "ebi.ac.uk/pdbe/graph-api",
    body: "Per-residue conservation profiles built from homologous sequences.",
  },
  {
    name: "IEDB",
    host: "iedb.org",
    body: "NetMHCpan 4.1 HLA class I presentation of mutant peptides.",
  },
  {
    name: "Complex Portal",
    host: "ebi.ac.uk/intact",
    body: "Curated macromolecular complexes with participant lists and stoichiometry.",
  },
];
