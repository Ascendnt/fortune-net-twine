import { describe, it, expect } from "vitest";
import { isExpired } from "./QuotationsList";

const TODAY = "2026-08-09";

describe("isExpired", () => {
  it("is expired when a sent quotation is past its validity", () => {
    expect(isExpired({ status: "sent", validityDate: "2026-08-01" }, TODAY)).toBe(true);
  });

  it("covers a quotation still under negotiation", () => {
    expect(isExpired({ status: "under_negotiation", validityDate: "2026-08-01" }, TODAY)).toBe(true);
  });

  it("covers one sitting in the approval queue past its date", () => {
    expect(isExpired({ status: "for_approval", validityDate: "2026-08-01" }, TODAY)).toBe(true);
  });

  it("is not expired while the validity is still ahead", () => {
    expect(isExpired({ status: "sent", validityDate: "2026-08-20" }, TODAY)).toBe(false);
  });

  it("treats a validity falling on today as still good", () => {
    // The customer has until the end of the day it says on the document.
    expect(isExpired({ status: "sent", validityDate: TODAY }, TODAY)).toBe(false);
  });

  it("never expires a draft, which was never offered to anybody", () => {
    expect(isExpired({ status: "draft", validityDate: "2026-01-01" }, TODAY)).toBe(false);
  });

  it("never expires a closed quotation", () => {
    expect(isExpired({ status: "accepted", validityDate: "2026-01-01" }, TODAY)).toBe(false);
    expect(isExpired({ status: "rejected", validityDate: "2026-01-01" }, TODAY)).toBe(false);
  });

  it("is not expired when no validity date was ever set", () => {
    expect(isExpired({ status: "sent" }, TODAY)).toBe(false);
    expect(isExpired({ status: "sent", validityDate: "" }, TODAY)).toBe(false);
  });
});
