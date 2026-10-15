/**
 * Pure presentation rules for the Oncology tab: overlay colour maps and the
 * lollipop plot's scale. Colours are 0xRRGGBB, shared by canvas and legend.
 */

import type { Hotspot, MutationPosition } from "@/lib/oncology-types";

export const HOTSPOT_LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["Not a hotspot", 0xe4e4e7],
  ["Hotspot", 0xfb923c],
  ["Top hotspot (most tumours)", 0x9f1239],
];

/** Hotspots shaded from orange to deep red by their share of the top hotspot's tumours. */
export function hotspotColors(hotspots: readonly Hotspot[]): Record<string, number> {
  const top = Math.max(1, ...hotspots.map((h) => h.tumor_count));
  const out: Record<string, number> = {};
  for (const h of hotspots) {
    const color = ramp(0xfb923c, 0x9f1239, Math.sqrt(h.tumor_count / top));
    for (const key of h.keys) out[key] = color;
  }
  return out;
}

export const DENSITY_LEGEND: ReadonlyArray<readonly [string, number]> = [
  ["No TCGA mutation", 0xe4e4e7],
  ["Few", 0xfde68a],
  ["Many", 0xdc2626],
];

/** TCGA mutation density on a log scale, so one hotspot does not wash out the rest. */
export function densityColors(positions: readonly MutationPosition[]): Record<string, number> {
  const top = Math.log1p(Math.max(1, ...positions.map((p) => p.count)));
  const out: Record<string, number> = {};
  for (const p of positions) {
    const color = ramp(0xfde68a, 0xdc2626, Math.log1p(p.count) / top);
    for (const key of p.keys) out[key] = color;
  }
  return out;
}

export function ramp(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const lerp = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k) << s;
  return lerp(16) | lerp(8) | lerp(0);
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction >= 0.1 ? 0 : 1)}%`;
}

export function phaseLabel(phase: number | null): string {
  if (phase === null) return "phase unknown";
  if (phase >= 4) return "approved";
  if (phase <= 0) return "preclinical";
  return `phase ${Math.floor(phase)}`;
}
