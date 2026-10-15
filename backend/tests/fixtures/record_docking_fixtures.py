"""Records the docking fixtures. Needs network and a Vina binary. Output committed.

    cd backend && python scripts/install_vina.py
    python tests/fixtures/record_docking_fixtures.py

Provenance for:

* ``1HSG.pdb`` - HIV-1 protease with indinavir (MK1), from the RCSB, unedited.
  Redocking indinavir into it is the standard Vina sanity check.
* ``rcsb_chemcomp_MK1.json`` - the RCSB chemical component entry for MK1.
* ``vina_1HSG_MK1_out.pdbqt`` - Vina 1.2's poses for that SMILES in the MK1
  site, through this repo's own receptor and ligand preparation, with the
  service's seed, exhaustiveness 8 and 9 modes. The tests read poses, scores,
  contacts and crystal RMSD from it without running Vina.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))
from Bio.PDB import PDBParser

from app.services import chemcomp, docking


def main() -> None:
    binary = docking.find_vina()
    if binary is None:
        sys.exit(docking.unavailable_note())
    with httpx.Client(timeout=120) as c:
        pdb = c.get("https://files.rcsb.org/download/1HSG.pdb").raise_for_status().text
        comp = c.get(chemcomp.RCSB_CHEMCOMP_URL.format(code="MK1")).raise_for_status().json()
    (HERE / "1HSG.pdb").write_text(pdb)
    (HERE / "rcsb_chemcomp_MK1.json").write_text(json.dumps(comp) + "\n")

    structure = PDBParser(QUIET=True).get_structure("1HSG", str(HERE / "1HSG.pdb"))
    site = docking.ligand_sites(structure, {"MK1"})[0]
    center, size = docking.box_around(site.coords, 8.0)
    receptor, _ = docking.prepare_receptor(docking.receptor_pdb(structure))
    ligand = docking.prepare_ligand(docking.ligand_from_smiles(chemcomp.smiles_from(comp) or ""))
    out, seconds = docking.run_vina(
        binary, receptor, ligand, center, size, exhaustiveness=8, num_modes=9
    )
    (HERE / "vina_1HSG_MK1_out.pdbqt").write_text(out)
    print(f"wrote 1HSG.pdb, rcsb_chemcomp_MK1.json, vina_1HSG_MK1_out.pdbqt ({seconds:.0f} s)")


if __name__ == "__main__":
    main()
