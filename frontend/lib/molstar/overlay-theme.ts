/**
 * A Mol* colour theme that paints residues from a precomputed table.
 *
 * Mol*'s built-in themes read properties the file already carries (chain,
 * B-factor, residue name). Clinical evidence and AlphaMissense live outside the
 * file, so the colour of each residue is decided in React (see
 * `lib/clinical-format.ts`) and handed to this theme as a residue-index ->
 * colour map. Residues absent from the map get `fallback`, which is the honest
 * rendering of "no evidence here".
 *
 * Keyed by Mol*'s model residue index — the same handle `residue-index.ts`
 * builds for selection — so the overlay inherits that mapping's immunity to
 * gaps, insertion codes and non-1-based numbering.
 */

import { Bond, StructureElement, Unit } from "molstar/lib/mol-model/structure";
import type { Location } from "molstar/lib/mol-model/location";
import type { ColorTheme } from "molstar/lib/mol-theme/color";
import type { ThemeDataContext } from "molstar/lib/mol-theme/theme";
import { Color } from "molstar/lib/mol-util/color";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";

export const OVERLAY_THEME_NAME = "proteolens-residue-overlay";

/** Neutral grey for residues the overlay says nothing about. */
export const OVERLAY_FALLBACK = 0xe4e4e7;

const OverlayParams = {
  colors: PD.Value<ReadonlyMap<number, number>>(new Map(), { isHidden: true }),
  fallback: PD.Color(Color(OVERLAY_FALLBACK)),
};
type OverlayParams = typeof OverlayParams;

function residueIndexOf(location: Location): number | null {
  if (StructureElement.Location.is(location)) {
    return Unit.isAtomic(location.unit)
      ? location.unit.residueIndex[location.element]
      : null;
  }
  if (Bond.isLocation(location)) {
    const unit = location.aUnit;
    return Unit.isAtomic(unit)
      ? unit.residueIndex[unit.elements[location.aIndex]]
      : null;
  }
  return null;
}

function OverlayColorTheme(
  _ctx: ThemeDataContext,
  props: PD.Values<OverlayParams>,
): ColorTheme<OverlayParams> {
  const colors = props.colors;
  const fallback = props.fallback;
  return {
    factory: OverlayColorTheme,
    granularity: "group",
    color: (location: Location): Color => {
      const index = residueIndexOf(location);
      const value = index === null ? undefined : colors.get(index);
      return value === undefined ? fallback : Color(value);
    },
    props,
    description: "Residue colours supplied by a ProteoLens panel.",
  };
}

export const OverlayColorThemeProvider: ColorTheme.Provider<
  OverlayParams,
  typeof OVERLAY_THEME_NAME
> = {
  name: OVERLAY_THEME_NAME,
  label: "ProteoLens overlay",
  category: "ProteoLens",
  factory: OverlayColorTheme,
  getParams: () => OverlayParams,
  defaultValues: PD.getDefaultValues(OverlayParams),
  isApplicable: () => true,
};
