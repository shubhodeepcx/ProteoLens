/**
 * A docked ligand pose shown next to the protein as its own small structure.
 *
 * The pose is a second structure in the hierarchy, so the toolbar actions in
 * `actions.ts` skip it through `proteinStructures`: a cartoon or an overlay
 * colour applied to a lone ligand would hide it or paint it wrongly. Clicks
 * on it are ignored for selection (`isOtherStructure`), since its residue
 * index would otherwise be read as a protein residue.
 */

import type { PluginContext } from "molstar/lib/mol-plugin/context";
import type { StructureRef } from "molstar/lib/mol-plugin-state/manager/structure/hierarchy-state";
import {
  Structure,
  StructureElement,
} from "molstar/lib/mol-model/structure";
import { Loci } from "molstar/lib/mol-model/loci";
import { Color } from "molstar/lib/mol-util/color";

const POSE_LABEL = "Docked pose";
/** Amber carbons, so the pose stands out from grey crystal ligands. */
export const POSE_CARBON = 0xf59e0b;

/** The data cell each plugin's current pose hangs from. */
const poseRoots = new WeakMap<PluginContext, string>();

function isUnder(plugin: PluginContext, ref: string, root: string): boolean {
  const tree = plugin.state.data.tree;
  let current: string | undefined = ref;
  while (current && tree.transforms.has(current)) {
    if (current === root) return true;
    const parent: string = tree.transforms.get(current)!.parent;
    if (parent === current) return false;
    current = parent;
  }
  return false;
}

/** Every structure in the viewer except a docked pose. */
export function proteinStructures(plugin: PluginContext): StructureRef[] {
  const root = poseRoots.get(plugin);
  const all = plugin.managers.structure.hierarchy.current.structures;
  if (!root) return all;
  return all.filter((s) => !isUnder(plugin, s.cell.transform.ref, root));
}

/** True when a clicked loci lies in a structure other than the protein. */
export function isOtherStructure(loci: Loci, protein: Structure | null): boolean {
  const normalized = Loci.normalize(loci, "residue", true);
  if (!protein || !StructureElement.Loci.is(normalized)) return false;
  return normalized.structure.models[0] !== protein.models[0];
}

/** Replaces the shown pose with `sdf` (an MDL molfile), or removes it for null. */
export async function showDockedPose(
  plugin: PluginContext,
  sdf: string | null,
): Promise<void> {
  const previous = poseRoots.get(plugin);
  poseRoots.delete(plugin);
  if (previous && plugin.state.data.cells.has(previous)) {
    await plugin.build().delete(previous).commit();
  }
  if (!sdf) return;

  const data = await plugin.builders.data.rawData({ data: sdf, label: POSE_LABEL });
  poseRoots.set(plugin, data.ref);
  const trajectory = await plugin.builders.structure.parseTrajectory(data, "sdf");
  const model = await plugin.builders.structure.createModel(trajectory);
  const structure = await plugin.builders.structure.createStructure(model);
  const component = await plugin.builders.structure.tryCreateComponentStatic(
    structure,
    "all",
  );
  if (!component) return;
  await plugin.builders.structure.representation.addRepresentation(component, {
    type: "ball-and-stick",
    color: "element-symbol",
    colorParams: {
      carbonColor: { name: "uniform", params: { value: Color(POSE_CARBON) } },
    },
  });
  const pose = structure.cell?.obj?.data;
  if (pose) {
    plugin.managers.camera.focusLoci(Structure.toStructureElementLoci(pose), {
      extraRadius: 6,
    });
  }
}
