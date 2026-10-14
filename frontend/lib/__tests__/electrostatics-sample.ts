import type { ElectrostaticsResponse } from "@/lib/electrostatics";

/** Shared fixture for the electrostatics lib and panel tests. */
export const SAMPLE: ElectrostaticsResponse = {
  protein_id: "p1",
  units: "kcal/(mol·e)",
  color_range: 10,
  chains: [
    { chain: "A", sequence: "KDE", potential: [6.5, -3, -7.25], exposed: [true, false, true], net_charge: -1, isoelectric_point: 4.5 },
    { chain: "B", sequence: "R", potential: [8], exposed: null, net_charge: 1, isoelectric_point: 11.2 },
  ],
  patches: [
    {
      sign: "positive",
      residues: [
        { chain: "A", ordinal: 1, key: "A:1", residue: "K", auth_seq_id: 33, insertion_code: null },
        { chain: "B", ordinal: 1, key: "B:1", residue: "R", auth_seq_id: 5, insertion_code: "A" },
      ],
      mean_potential: 7.25,
      label: "Basic patch: a candidate surface for DNA/RNA.",
    },
  ],
  net_charge: 0,
  dipole_debye: 120.4,
  charged_atoms: 6,
  notes: ["Coulombic potential, not Poisson-Boltzmann."],
};
