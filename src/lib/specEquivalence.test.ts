import { describe, it, expect } from "vitest";
import { findEquivalentSpec } from "./specMaster";
import type { SpecMasterRow } from "./specMaster";

function row(over: Partial<SpecMasterRow> = {}): SpecMasterRow {
  return {
    code: "N-1598",
    description: "NYLON BRAIDED NET",
    material: "NYLON",
    netType: "BRAIDED NET",
    twine: "NO.120(210/22x16)",
    meshSize: '3-1/2"STR',
    meshDepth: "122MD",
    length: "70FL",
    weightPerPc: 689,
    ...over,
  };
}

const master = [row(), row({ code: "N-1600", length: "35FL", weightPerPc: 344.5 })];

describe("findEquivalentSpec", () => {
  it("finds the existing code when every measurement matches", () => {
    // Opening the copy form, changing nothing and saving should reuse what is already on file.
    const found = findEquivalentSpec(master, row({ code: "IGNORED" }));
    expect(found?.code).toBe("N-1598");
  });

  it("ignores the code entirely when matching", () => {
    expect(findEquivalentSpec(master, { ...row(), code: "SOMETHING-ELSE" } as SpecMasterRow)?.code).toBe("N-1598");
  });

  it("finds nothing when the length differs — that is a different net", () => {
    expect(findEquivalentSpec(master, row({ length: "50FL" }))).toBeUndefined();
  });

  it("finds nothing when the weight differs", () => {
    expect(findEquivalentSpec(master, row({ weightPerPc: 700 }))).toBeUndefined();
  });

  it("finds nothing when the twine differs", () => {
    expect(findEquivalentSpec(master, row({ twine: "NO.210(210/30x16)" }))).toBeUndefined();
  });

  it("finds nothing when the mesh depth differs", () => {
    expect(findEquivalentSpec(master, row({ meshDepth: "100MD" }))).toBeUndefined();
  });

  it("treats case and stray spacing as the same value", () => {
    const found = findEquivalentSpec(
      master,
      row({ length: "  70fl ", twine: "no.120(210/22x16)", meshDepth: "122md" })
    );
    expect(found?.code).toBe("N-1598");
  });

  it("collapses repeated spaces rather than treating them as different", () => {
    expect(findEquivalentSpec(master, row({ meshSize: '3-1/2"STR' }))?.code).toBe("N-1598");
  });

  it("matches weights that agree to two decimals, which is how they are entered", () => {
    expect(findEquivalentSpec(master, row({ weightPerPc: 689.001 }))?.code).toBe("N-1598");
  });

  it("does not match weights that differ at the second decimal", () => {
    expect(findEquivalentSpec(master, row({ weightPerPc: 689.02 }))).toBeUndefined();
  });

  it("picks the right row out of a master holding several", () => {
    expect(findEquivalentSpec(master, row({ length: "35FL", weightPerPc: 344.5 }))?.code).toBe("N-1600");
  });

  it("finds nothing in an empty master", () => {
    expect(findEquivalentSpec([], row())).toBeUndefined();
  });

  it("does not match across a different material or net type", () => {
    expect(findEquivalentSpec(master, row({ material: "HDPE" }))).toBeUndefined();
    expect(findEquivalentSpec(master, row({ netType: "TWISTED NET" }))).toBeUndefined();
  });
});
