/**
 * A Mol* colour theme that paints each residue by a value ProteoLens supplies:
 * the P15 Coulombic surface potential, red (acidic) through white to blue
 * (basic), the convention every electrostatics viewer uses.
 *
 * Mol* builds themes from params, and a per-residue table is not something to
 * put in a param, so the values live in this module and the theme reads them
 * at construction. `version` is the param that changes whenever they do, which
 * is what makes Mol* rebuild the theme instead of reusing the old one.
 */

import { Bond, StructureElement, Unit } from "molstar/lib/mol-model/structure";
import type { Location } from "molstar/lib/mol-model/location";
import type { ColorTheme } from "molstar/lib/mol-theme/color";
import type { ThemeDataContext } from "molstar/lib/mol-theme/theme";
import { Color, ColorScale } from "molstar/lib/mol-util/color";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";

export const ELECTROSTATICS_THEME = "proteolens-electrostatics";

const NO_VALUE = Color(0xb0b0b0);

let residueValues: ReadonlyMap<number, number> = new Map();
let colorRange = 10;
let version = 0;

/**
 * Replace the values the theme paints (model residue index -> potential) and
 * return the new version to pass as the theme's `version` param.
 */
export function setResidueValues(values: ReadonlyMap<number, number>, range: number): number {
  residueValues = values;
  colorRange = range > 0 ? range : 10;
  version += 1;
  return version;
}

const Params = {
  version: PD.Numeric(0, {}, { isHidden: true }),
};
type Params = typeof Params;

function residueIndexOf(location: Location): number | undefined {
  if (StructureElement.Location.is(location)) {
    return Unit.isAtomic(location.unit)
      ? location.unit.residueIndex[location.element]
      : undefined;
  }
  if (Bond.isLocation(location)) {
    const unit = location.aUnit;
    return Unit.isAtomic(unit) ? unit.residueIndex[unit.elements[location.aIndex]] : undefined;
  }
  return undefined;
}

function ElectrostaticsColorTheme(
  _ctx: ThemeDataContext,
  props: PD.Values<Params>,
): ColorTheme<Params> {
  const values = residueValues;
  const scale = ColorScale.create({
    listOrName: [Color(0xd7301f), Color(0xffffff), Color(0x2166ac)],
    domain: [-colorRange, colorRange],
    minLabel: "Acidic",
    maxLabel: "Basic",
  });
  const color = (location: Location): Color => {
    const index = residueIndexOf(location);
    const value = index === undefined ? undefined : values.get(index);
    return value === undefined ? NO_VALUE : scale.color(value);
  };
  return {
    factory: ElectrostaticsColorTheme,
    granularity: "group",
    preferSmoothing: true,
    color,
    props,
    description: "Coulombic surface potential per residue, from the ProteoLens backend.",
    legend: scale.legend,
  };
}

export const ElectrostaticsColorThemeProvider: ColorTheme.Provider<
  Params,
  typeof ELECTROSTATICS_THEME
> = {
  name: ELECTROSTATICS_THEME,
  label: "Electrostatic potential",
  category: "Residue Property",
  factory: ElectrostaticsColorTheme,
  getParams: () => Params,
  defaultValues: PD.getDefaultValues(Params),
  isApplicable: (ctx: ThemeDataContext) => !!ctx.structure,
};
