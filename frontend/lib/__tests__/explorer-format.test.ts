import { describe, expect, it } from "vitest";
import {
  bandAt,
  bandFill,
  codingBoxes,
  codons,
  complement,
  exonBoxes,
  explorePageHref,
  explorerPath,
  formatBp,
  fromFivePrime,
  helixSlice,
  queryFromParams,
  transcribe,
} from "@/lib/explorer-format";
import { SICKLE } from "@/app/explore/__tests__/fixture";

describe("explorer-format", () => {
  it("pairs and transcribes bases", () => {
    expect(complement("ATGC")).toBe("TACG");
    expect(transcribe("GTG")).toBe("GUG");
  });

  it("splits the window into numbered codons with their amino acids", () => {
    const ref = codons(SICKLE.window, "ref");
    const alt = codons(SICKLE.window, "alt");
    expect(ref).toHaveLength(17);
    expect(ref[6]).toEqual({ number: 7, bases: "GAG", aa: "E" });
    expect(alt[6]).toEqual({ number: 7, bases: "GTG", aa: "V" });
  });

  it("measures from the 5' end on the minus strand", () => {
    // HBB is on the minus strand: its highest coordinate is its 5' end.
    expect(fromFivePrime(SICKLE.gene, SICKLE.gene.end)).toBe(0);
    expect(fromFivePrime(SICKLE.gene, SICKLE.gene.start)).toBe(1);
    const boxes = exonBoxes(SICKLE.gene);
    expect(boxes.map((b) => b.number)).toEqual([1, 2, 3]);
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeLessThan(boxes[2].x);
  });

  it("trims UTRs off the coding boxes", () => {
    const exon = exonBoxes(SICKLE.gene);
    const coding = codingBoxes(SICKLE.gene);
    expect(coding).toHaveLength(3);
    expect(coding[0].width).toBeLessThan(exon[0].width); // 5' UTR in exon 1
    expect(coding[1].width).toBeCloseTo(exon[1].width); // exon 2 is all coding
    expect(coding[2].width).toBeLessThan(exon[2].width); // 3' UTR in exon 3
  });

  it("slices the helix around the variant codon", () => {
    const s = helixSlice(SICKLE.window, 7, "alt");
    expect(s.firstCodon).toBe(4);
    expect(s.dna.slice(s.offset, s.offset + 3)).toBe("GTG");
    expect(s.dna).toHaveLength(21);
    const start = helixSlice(SICKLE.window, 1, "ref");
    expect(start.offset).toBe(0);
    expect(start.dna.slice(0, 3)).toBe("ATG");
  });

  it("colours bands by stain", () => {
    expect(bandFill("acen")).toBe("#f43f5e");
    expect(bandFill("gneg")).toBe("#e4e4e7");
    expect(bandFill("gpos100")).not.toBe(bandFill("gpos25"));
    expect(bandAt(SICKLE.chromosomes[1].bands, SICKLE.gene.start)?.id).toBe(
      "p15.4",
    );
  });

  it("builds and reads the query", () => {
    expect(explorerPath({ scenario: "sickle-cell" })).toBe(
      "/api/explorer?scenario=sickle-cell",
    );
    expect(explorerPath({ gene: "BRAF", change: "V600E" })).toBe(
      "/api/explorer?gene=BRAF&change=V600E",
    );
    expect(explorePageHref({ gene: "TP53", change: "R175H" })).toBe(
      "/explore?gene=TP53&change=R175H",
    );
    expect(queryFromParams(new URLSearchParams("scenario=kras-g12c"))).toEqual({
      scenario: "kras-g12c",
    });
    expect(
      queryFromParams(new URLSearchParams("gene=BRAF&change=V600E")),
    ).toEqual({
      gene: "BRAF",
      change: "V600E",
    });
    expect(
      queryFromParams(new URLSearchParams("gene=../x&change=V600E")),
    ).toBeNull();
    expect(queryFromParams(new URLSearchParams(""))).toBeNull();
  });

  it("formats lengths", () => {
    expect(formatBp(3932)).toBe("3.9 kb");
    expect(formatBp(135086622)).toBe("135 Mb");
    expect(formatBp(5300000)).toBe("5.3 Mb");
  });
});
