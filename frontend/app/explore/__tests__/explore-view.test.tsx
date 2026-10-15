import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { SCENARIOS, SICKLE } from "./fixture";

/**
 * The explorer's journey: one request, five zoom levels, and the hand-off to
 * the 3D viewer. The API is mocked; no test reaches a live server.
 */

let searchParams = new URLSearchParams();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push }),
}));

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

import { ExploreView } from "../explore-view";

function serve(view: unknown = SICKLE) {
  apiGet.mockImplementation((path: string) =>
    path === "/api/explorer/scenarios"
      ? Promise.resolve(SCENARIOS)
      : Promise.resolve(view),
  );
}

async function renderLoaded() {
  render(<ExploreView />);
  await screen.findByText(/sits on chromosome/i);
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  serve();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExploreView", () => {
  it("opens the sickle cell scenario by default, at the genome level", async () => {
    await renderLoaded();
    expect(apiGet).toHaveBeenCalledWith("/api/explorer?scenario=sickle-cell");
    expect(
      screen.getByRole("img", { name: /HBB marked on chromosome 11/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/band 11p15.4/)).toBeInTheDocument();
    expect(document.querySelector('[data-chromosome="11"]')).not.toBeNull();
  });

  it("reads a gene and change from the query string", async () => {
    searchParams = new URLSearchParams("gene=HBB&change=E7V");
    await renderLoaded();
    expect(apiGet).toHaveBeenCalledWith("/api/explorer?gene=HBB&change=E7V");
    expect(screen.getByLabelText("Gene")).toHaveValue("HBB");
  });

  it("zooms through the gene and the helix", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /zoom in to gene/i }));
    expect(screen.getByText(/3 exons/)).toBeInTheDocument();
    expect(screen.getByText("c.20A>T")).toBeInTheDocument();
    expect(screen.getByText(/read from the minus strand/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /zoom in to dna/i }));
    expect(screen.getByText(/chr11:5,227,002 T>A/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-base="changed"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /normal GAG/i }));
    expect(screen.getByRole("button", { name: /normal GAG/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("translates codon by codon and reports the change", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("tab", { name: /mRNA/ }));
    // Codon 2 (Val) in both rows, plus the mutant codon 7.
    expect(screen.getAllByText("GUG")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Next codon" }));
    expect(screen.getAllByText("M")).toHaveLength(2);
    expect(screen.queryByTestId("translation-result")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Translate all" }));
    expect(screen.getByTestId("translation-result")).toHaveTextContent(
      "Codon 7: GAG → Glu becomes GUG → Val. A missense change, p.Glu7Val.",
    );
  });

  it("hands off to the viewer with the residue selected", async () => {
    apiPost.mockResolvedValue({ id: "af-hbb" });
    await renderLoaded();
    fireEvent.click(screen.getByRole("tab", { name: /3D protein/ }));
    expect(screen.getByText(/ribosome inserts valine/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open in 3D at residue 7" }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/viewer/af-hbb?select=A%3A7"),
    );
    expect(apiPost).toHaveBeenCalledWith("/api/proteins/import", {
      source: "alphafold",
      source_id: "P68871",
    });
  });

  it("opens without a selection when UniProt numbering disagrees", async () => {
    serve({
      ...SICKLE,
      handoff_ok: false,
      notes: ["UniProt P68871 does not carry E at position 7."],
    });
    apiPost.mockResolvedValue({ id: "af-hbb" });
    await renderLoaded();
    fireEvent.click(screen.getByRole("tab", { name: /3D protein/ }));
    expect(screen.getByText(/does not carry E/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open the protein in 3D" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/viewer/af-hbb"));
  });

  it("navigates when a scenario is picked", async () => {
    await renderLoaded();
    fireEvent.click(await screen.findByRole("button", { name: /KRAS G12C/ }));
    expect(push).toHaveBeenCalledWith("/explore?scenario=kras-g12c");
    fireEvent.change(screen.getByLabelText("Gene"), {
      target: { value: "BRAF" },
    });
    fireEvent.change(screen.getByLabelText("Protein change"), {
      target: { value: "V600E" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect(push).toHaveBeenCalledWith("/explore?gene=BRAF&change=V600E");
  });

  it("shows the backend's reason when a change does not fit the gene", async () => {
    apiGet.mockImplementation((path: string) =>
      path === "/api/explorer/scenarios"
        ? Promise.resolve(SCENARIOS)
        : Promise.reject(
            new ApiError(400, "Bad", {
              detail: "Codon 7 of HBB is GAG, which encodes Glu, not Lys.",
            }),
          ),
    );
    render(<ExploreView />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "encodes Glu, not Lys",
    );
  });
});
