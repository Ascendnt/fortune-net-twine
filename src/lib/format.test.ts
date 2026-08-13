import { describe, it, expect } from "vitest";
import { piRef, revisionLabel, revisionTag } from "./format";

describe("piRef", () => {
  it("prints the first issue bare, with no revision suffix", () => {
    expect(piRef("PI-33007", 0)).toBe("PI-33007");
  });

  it("appends the revision from the second draft onward", () => {
    expect(piRef("PI-33007", 1)).toBe("PI-33007-R1");
    expect(piRef("PI-33007", 2)).toBe("PI-33007-R2");
    expect(piRef("PI-33007", 12)).toBe("PI-33007-R12");
  });

  it("never emits R0, which would read as a revision that does not exist", () => {
    expect(piRef("PI-33007", 0)).not.toContain("R0");
  });
});

describe("revisionLabel", () => {
  it("calls the first issue an initial issue rather than Revision 0", () => {
    expect(revisionLabel(0)).toBe("Initial issue");
  });

  it("numbers every later revision", () => {
    expect(revisionLabel(1)).toBe("Revision 1");
    expect(revisionLabel(3)).toBe("Revision 3");
  });
});

describe("revisionTag", () => {
  it("shows a dash for the first issue so a list column stays aligned", () => {
    expect(revisionTag(0)).toBe("-");
  });

  it("shows the short form for later revisions", () => {
    expect(revisionTag(1)).toBe("R1");
    expect(revisionTag(10)).toBe("R10");
  });
});
