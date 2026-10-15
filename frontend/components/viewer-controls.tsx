"use client";

import { useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  REPRESENTATION_OPTIONS,
  coloringOptionsFor,
} from "@/lib/molstar/theming";
import type { Representation, ColoringScheme } from "@/lib/store";

const OVERLAY_VALUE = "__overlay";
// Not a Mol* built-in, so it is appended here rather than listed in
// `COLORING_OPTIONS`, which the comparison view also offers.
const ELECTROSTATICS_OPTION = ["electrostatics", "Electrostatic potential"] as const;

const SELECT_CLASS =
  "h-7 rounded-md border border-input bg-card px-1.5 text-[11px] text-foreground/80 focus:border-ring focus:outline-none";

/**
 * Toolbar controls bound to `viewerSlice`. The page owns the effects that push
 * these values into the Mol* imperative API, keeping one direction per effect.
 */
export function ViewerControls({
  disabled,
  hasPlddt = false,
}: {
  disabled?: boolean;
  /**
   * `ProteinSummary.has_plddt` — picks which of the two B-factor-column
   * schemes the coloring menu offers: `pLDDT confidence` when true, plain
   * `B-factor` when false.
   */
  hasPlddt?: boolean;
}) {
  const representation = useStore((s) => s.representation);
  const coloring = useStore((s) => s.coloring);
  const setRepresentation = useStore((s) => s.setRepresentation);
  const setColoring = useStore((s) => s.setColoring);
  const overlay = useStore((s) => s.residueOverlay);

  const coloringOptions = useMemo(
    () => [...coloringOptionsFor(hasPlddt), ELECTROSTATICS_OPTION],
    [hasPlddt],
  );

  // `coloring` lives in the store and survives navigation, so leaving an
  // AlphaFold model on pLDDT and opening an X-ray entry would leave the select
  // bound to a value it no longer lists — the browser then shows the first
  // option while Mol* still renders the old scheme. Fall back explicitly.
  // Symmetric by construction: `bfactor` carried onto an AlphaFold model is
  // just as unlisted, and resets the same way.
  useEffect(() => {
    if (!coloringOptions.some(([value]) => value === coloring)) {
      setColoring("chain");
    }
  }, [coloringOptions, coloring, setColoring]);

  return (
    <>
      <select
        aria-label="Representation"
        title="Representation"
        className={SELECT_CLASS}
        disabled={disabled}
        value={representation}
        onChange={(e) => setRepresentation(e.target.value as Representation)}
      >
        {REPRESENTATION_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        aria-label="Coloring"
        title="Coloring"
        className={SELECT_CLASS}
        disabled={disabled}
        value={overlay ? OVERLAY_VALUE : coloring}
        onChange={(e) => {
          if (e.target.value !== OVERLAY_VALUE) {
            setColoring(e.target.value as ColoringScheme);
          }
        }}
      >
        {/* A rail panel is painting the structure; any real scheme clears it. */}
        {overlay && <option value={OVERLAY_VALUE}>{overlay.label}</option>}
        {coloringOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </>
  );
}
