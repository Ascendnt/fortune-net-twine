import { describe, it, expect } from "vitest";
import { nextSpecCode } from "./specMaster";
import type { SpecMasterRow } from "./specMaster";

function row(code: string, material = "NYLON", netType = "BRAIDED NET"): SpecMasterRow {
  return {
    code,
    description: `${material} ${netType}`,
    material,
    netType,
    twine: "NO.120(210/22x16)",
    meshSize: '3-1/2"STR',
    meshDepth: "122MD",
    length: "50FL",
    weightPerPc: 495,
  };
}

describe("nextSpecCode", () => {
  it("continues the series already in use for that material and net type", () => {
    const rows = [row("N-1595"), row("N-1598"), row("N-1602")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe("N-1603");
  });

  it("takes the highest, not the last added", () => {
    const rows = [row("N-1602"), row("N-1595")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe("N-1603");
  });

  it("does not let another material's series push this one along", () => {
    // An H-1642 in the same master must not send the nylon run into the 1700s.
    const rows = [row("N-1598"), row("H-1642", "HDPE", "BRAIDED NET")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe("N-1599");
  });

  it("keeps each material on its own series", () => {
    const rows = [row("N-1598"), row("H-1642", "HDPE", "BRAIDED NET")];
    expect(nextSpecCode(rows, "HDPE", "BRAIDED NET")).toBe("H-1643");
  });

  it("starts a new series from the material's initial when there is nothing to inherit", () => {
    expect(nextSpecCode([], "POLYESTER", "TWISTED NET")).toBe("P-0001");
  });

  it("pads to at least four digits, so a new series is not P-1", () => {
    expect(nextSpecCode([], "NYLON", "BRAIDED NET")).toBe("N-0001");
  });

  it("keeps the width already in use when the series is longer", () => {
    const rows = [row("N-10598")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe("N-10599");
  });

  it("rolls over a digit boundary without truncating", () => {
    const rows = [row("N-9999")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe("N-10000");
  });

  it("ignores codes that are not in the expected shape", () => {
    const rows = [row("LEGACY"), row("N-1598")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe("N-1599");
  });

  it("copes with a material whose rows all have unparseable codes", () => {
    const rows = [row("LEGACY-A"), row("OLDCODE")];
    const next = nextSpecCode(rows, "NYLON", "BRAIDED NET");
    expect(next).toBe("N-0001");
  });

  it("never returns a code that already exists", () => {
    const rows = [row("N-1595"), row("N-1596"), row("N-1597")];
    const next = nextSpecCode(rows, "NYLON", "BRAIDED NET");
    expect(rows.some((r) => r.code === next)).toBe(false);
  });

  it("is stable when called twice on unchanged data", () => {
    const rows = [row("N-1598")];
    expect(nextSpecCode(rows, "NYLON", "BRAIDED NET")).toBe(nextSpecCode(rows, "NYLON", "BRAIDED NET"));
  });
});
