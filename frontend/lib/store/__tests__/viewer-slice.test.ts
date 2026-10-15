import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { createViewerSlice, type ViewerSlice } from "@/lib/store/viewer-slice";

function makeStore() {
  return create<ViewerSlice>()((...a) => createViewerSlice(...a));
}

describe("viewerSlice.resetView", () => {
  let useTestStore: ReturnType<typeof makeStore>;

  beforeEach(() => {
    useTestStore = makeStore();
  });

  it("starts with cartoon representation and chain coloring", () => {
    const state = useTestStore.getState();
    expect(state.representation).toBe("cartoon");
    expect(state.coloring).toBe("chain");
  });

  it("restores representation and coloring to their defaults", () => {
    const { setRepresentation, setColoring, resetView } = useTestStore.getState();
    setRepresentation("spacefill");
    setColoring("plddt");
    expect(useTestStore.getState().representation).toBe("spacefill");
    expect(useTestStore.getState().coloring).toBe("plddt");

    resetView();

    expect(useTestStore.getState().representation).toBe("cartoon");
    expect(useTestStore.getState().coloring).toBe("chain");
  });

  it("does not touch the camera reset tick", () => {
    const { resetCamera, resetView } = useTestStore.getState();
    resetCamera();
    resetCamera();
    expect(useTestStore.getState().cameraResetTick).toBe(2);

    resetView();

    expect(useTestStore.getState().cameraResetTick).toBe(2);
  });
});

describe("viewerSlice residue overlay", () => {
  const overlay = { label: "AlphaMissense", colors: { "A:1": 0xff0000 }, legend: [] };

  it("is cleared by picking a coloring scheme", () => {
    const store = create<ViewerSlice>()((...a) => createViewerSlice(...a));
    store.getState().setResidueOverlay(overlay);
    expect(store.getState().residueOverlay).toBe(overlay);
    store.getState().setColoring("ss");
    expect(store.getState().residueOverlay).toBeNull();
  });

  it("is cleared by resetView", () => {
    const store = create<ViewerSlice>()((...a) => createViewerSlice(...a));
    store.getState().setResidueOverlay(overlay);
    store.getState().resetView();
    expect(store.getState().residueOverlay).toBeNull();
  });
});

describe("viewerSlice docked pose", () => {
  const pose = { sdf: "x\nM  END\n", label: "Pose 1, -11.4 kcal/mol" };

  it("survives a coloring change but not resetView", () => {
    const store = create<ViewerSlice>()((...a) => createViewerSlice(...a));
    store.getState().setDockedPose(pose);
    store.getState().setColoring("ss");
    expect(store.getState().dockedPose).toBe(pose);
    store.getState().resetView();
    expect(store.getState().dockedPose).toBeNull();
  });
});
