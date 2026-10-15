import { describe, it, expect } from "vitest";
import { createViewerHandle, type ViewerRefs } from "@/lib/molstar/viewer-handle";
import { EMPTY_RESIDUE_INDEX } from "@/lib/molstar/residue-index";

function refsWithoutPlugin(): ViewerRefs {
  return {
    pluginRef: { current: null },
    structureRef: { current: null },
    indexRef: { current: EMPTY_RESIDUE_INDEX },
    chainsRef: { current: undefined },
    loadSeqRef: { current: 0 },
  };
}

describe("createViewerHandle before the plugin exists", () => {
  it("makes every call a safe no-op", async () => {
    const refs = refsWithoutPlugin();
    const handle = createViewerHandle(refs);
    await handle.loadStructure("/file.pdb");
    handle.highlightResidues(["A:1"]);
    handle.setRepresentation("cartoon");
    handle.setResidueOverlay({ "A:1": 0xff0000 });
    handle.showDockedPose(null);
    handle.colorByResidueValues(new Map([["A:1", 1]]), 5);
    handle.resetCamera();
    expect(await handle.snapshot()).toBeNull();
    // A load without a plugin never claims a sequence number.
    expect(refs.loadSeqRef.current).toBe(0);
  });
});
