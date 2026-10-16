---
title: 'ProteoLens: a web workspace for protein structure visualisation, annotation and variant interpretation'
tags:
  - Python
  - TypeScript
  - structural biology
  - bioinformatics
  - protein structure
  - variant interpretation
  - molecular visualisation
authors:
  - name: Shubhodeep Chatterjee
    orcid: 0009-0007-0487-4089
    affiliation: 1
affiliations:
  - name: Department of Biotechnology, Techno India University, Kolkata, India
    index: 1
date: 16 October 2026
bibliography: paper.bib
---

# Summary

ProteoLens is an open-source web application that brings the routine steps of interpreting a protein structure into a single browser workspace. A user loads a structure by uploading a PDB or mmCIF file, by entering an RCSB PDB, AlphaFold DB or UniProt identifier, or by pasting a sequence to be folded. The structure is rendered with the Mol\* engine [@sehnal2021], and every analysis, chart and evidence track refers to the same residues: selecting a residue in the 3D view, the sequence panel, the chain tree or any plot selects it everywhere.

Around this shared residue model, ProteoLens provides composition and hydropathy analytics, solvent accessibility, AlphaFold confidence (pLDDT and binned PAE), UniProt feature mapping, bound-compound classification, Kabsch superposition and RMSD comparison [@kabsch1976], structural impact estimates for missense variants, Coulombic surface electrostatics, clinical and oncology evidence painted on the structure, MHC class I neoantigen ranking, evolutionary conservation, AutoDock Vina docking [@eberhardt2021], ESMFold prediction [@lin2023], DNA sequence tools and a printable report. The client is written in TypeScript with Next.js and React; a FastAPI service written in Python parses structures with Biopython [@cock2009], computes analytics and mediates every call to the more than twenty public resources it uses, including RCSB PDB, AlphaFold DB, UniProt, ClinVar, gnomAD, cBioPortal, ChEMBL, CIViC, PDBe-KB, Ensembl and IEDB. A cancer-variant question that would otherwise span eight or more of these resources can be answered from one imported structure, with the source of each value shown next to it.

# Statement of need

The number of available structures is no longer the bottleneck. The PDB holds more than two hundred thousand experimental structures [@burley2023] and AlphaFold DB covers over 214 million sequences [@varadi2024]. Interpreting a structure, however, still means moving between separate resources: functional annotation in UniProt [@uniprot2023], clinical variants in ClinVar and gnomAD [@landrum2018; @karczewski2020], tumour mutation frequencies in cBioPortal [@cerami2012], drug mechanisms in ChEMBL [@zdrazil2024], conservation in PDBe-KB [@pdbekb2022], and viewing in a desktop program such as PyMOL [@pymol] or UCSF ChimeraX [@meng2023].

These resources often number the same residue differently. KRAS residue 12 is ordinal 13 in PDB entry 6OIM because that construct begins at Gly0, and the sickle-cell mutation written Glu6Val is E7V in UniProt numbering because UniProt counts the initiator methionine. Carrying identifiers between tabs and reconciling numbering by hand is slow, and an off-by-one error places evidence on a plausible but wrong residue.

ProteoLens is aimed at students learning structural biology, researchers who need a fast first look at an unfamiliar protein, and small teams who do not maintain a local structural-bioinformatics stack. Its organising rule is explicit provenance: external evidence is placed on the structure only after its residue mapping has been verified by sequence alignment, each source fails independently, and a value whose mapping cannot be checked is withheld rather than approximated.

# State of the field

Desktop viewers such as PyMOL and UCSF ChimeraX offer deep visualisation and scripting but leave annotation, clinical evidence and docking to separate tools. The Mol\* viewer and the RCSB PDB and UniProt portals provide excellent web viewing and annotation for their own data, and servers such as NetMHCpan [@reynisson2020] or web docking services each answer one question. ProteoLens does not replace these engines and databases; it builds on them (Mol\*, AutoDock Vina, ESMFold and the public APIs) and contributes the integration layer: one verified residue model shared by visualisation, analytics, clinical, oncology, immunology, docking and prediction views.

# Software design

The central design decision is a single residue model. Every component reads
and writes one selection keyed by chain and residue ordinal, and no second
selection path exists to drift out of sync with the viewer, the sequence panel
or the charts. The cost is that every external source must be mapped onto that
model before it can be shown, so ProteoLens maps external positions by sequence
alignment and checks the reference residue. A mapping below its identity or
coverage threshold, an RMSD with fewer than three verified residue pairs, or a
conservation profile computed on a different sequence version is refused with a
stated reason rather than shown approximately.

The same caution shapes variant interpretation. Structural impact is reported
as explicit rules with reasons and a three-level concern rather than a
pathogenicity probability, because a small set of structural rules has no
calibration behind a probability. Clinical evidence is kept in a separate
payload so that a structural estimate cannot borrow the authority of ClinVar.

The Python service owns all network access: the browser never contacts an
external database. Timeouts, bounded retries, a per-host concurrency cap and a
time-to-live cache live in one layer, API keys never reach the client, and each
source degrades independently, so an outage in one oncology source leaves the
others visible and names the missing one. Analyses are pure functions without
I/O, and external HTTP responses are recorded as fixtures, so the test suites
run offline and reproducibly. Long operations follow the cost of the work: BLAST
runs as a polled asynchronous job, while docking runs behind a process-wide lock
because AutoDock Vina already uses every core.

# Research impact statement

ProteoLens is a recent, single-author project and does not yet have external
users or citing publications. Its near-term significance rests on reproducible
evidence. Redocking indinavir into HIV-1 protease (PDB 1HSG) with the built-in
AutoDock Vina pipeline reproduces the crystal pose at 0.78 Å RMSD with a score of
−10.5 kcal/mol, and the local analyses return in under 0.3 s on structures of up
to 1,514 atoms. The software is covered by 778 backend and 565 frontend
automated tests that run in continuous integration on every pull request, each
of its 25 development phases has a written manual smoke test, and it runs with a
single `docker compose up` command or a one-click Windows launcher. Release
v1.0.0 is archived on Zenodo (doi:10.5281/zenodo.23422725). Because it needs no
local installation of structural-biology tools, it is suited to teaching
structural biology and to quick first-pass interpretation of a protein and its
variants.

# AI usage disclosure

During preparation of this manuscript, the author used Claude from Anthropic, strictly to check the main document for consistency with the figures and to obtain suggestions for improving the clarity and phrasing of the text. All suggestions were reviewed and edited by the author, who takes full responsibility for the content of the publication.

# Acknowledgements

This work was carried out under the internship program at IIIT Pune, under the supervision of Prof. Dr. Mahesh Joshi, Department of Computer Science and Engineering, IIIT Pune. The author thanks the teams who maintain the public databases and open-source engines on which ProteoLens is built.

# References
