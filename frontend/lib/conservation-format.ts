/**
 * Conservation colours: ConSurf's convention, turquoise for variable positions
 * through white to maroon for conserved ones, on a fixed bits scale so two
 * proteins painted side by side mean the same thing.
 */
import type { ResidueConservation } from "@/lib/conservation-types";
import { ramp } from "@/lib/oncology-format";

const VARIABLE = 0x10c8d1;
const AVERAGE = 0xffffff;
const CONSERVED = 0xa02560;
/** Information (bits) mapped to white; below is variable, above conserved. */
export const MIDPOINT_BITS = 1.0;
/** At and above this, full maroon. A residue fixed in ~85% of homologues. */
export const CONSERVED_BITS = 2.5;

export function conservationColor(bits: number): number {
  if (bits <= MIDPOINT_BITS)
    return ramp(VARIABLE, AVERAGE, bits / MIDPOINT_BITS);
  return ramp(
    AVERAGE,
    CONSERVED,
    (bits - MIDPOINT_BITS) / (CONSERVED_BITS - MIDPOINT_BITS),
  );
}

export const CONSERVATION_LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["Variable (0 bits)", VARIABLE],
  [`Average (${MIDPOINT_BITS} bit)`, AVERAGE],
  [`Conserved (≥${CONSERVED_BITS} bits)`, CONSERVED],
];

export function conservationColors(
  residues: readonly ResidueConservation[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of residues) {
    const color = conservationColor(r.information);
    for (const key of r.keys) out[key] = color;
  }
  return out;
}

export function bits(value: number): string {
  return `${value.toFixed(1)} bits`;
}
