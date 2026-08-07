import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

interface Row {
  customer: string;
  amount: number;
  note?: string;
}

const columns = [
  { header: "Customer", value: (r: Row) => r.customer },
  { header: "Amount", value: (r: Row) => r.amount },
  { header: "Note", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("writes a header row followed by the data", () => {
    const csv = toCsv([{ customer: "Nordfisk", amount: 100 }], columns);
    expect(csv).toBe("Customer,Amount,Note\r\nNordfisk,100,");
  });

  it("quotes fields containing a comma", () => {
    // The bug this guards: an unquoted comma shifts every later column by one, silently.
    const csv = toCsv([{ customer: "Pacifico Redes S.A. de C.V., Mexico", amount: 50 }], columns);
    expect(csv).toContain('"Pacifico Redes S.A. de C.V., Mexico",50,');
  });

  it("doubles embedded quotes", () => {
    const csv = toCsv([{ customer: 'The "Deckstore"', amount: 1 }], columns);
    expect(csv).toContain('"The ""Deckstore""",1,');
  });

  it("quotes fields containing newlines", () => {
    const csv = toCsv([{ customer: "A", amount: 1, note: "line one\nline two" }], columns);
    expect(csv).toContain('"line one\nline two"');
  });

  it("quotes fields with leading or trailing spaces, which spreadsheets otherwise trim", () => {
    expect(toCsv([{ customer: "  padded  ", amount: 1 }], columns)).toContain('"  padded  "');
  });

  it("renders null and undefined as empty rather than the words", () => {
    const csv = toCsv([{ customer: "A", amount: 0, note: undefined }], columns);
    expect(csv).toBe("Customer,Amount,Note\r\nA,0,");
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("null");
  });

  it("keeps zero rather than dropping it as falsy", () => {
    expect(toCsv([{ customer: "A", amount: 0 }], columns)).toContain("A,0,");
  });

  it("still emits the header when there are no rows", () => {
    expect(toCsv([], columns)).toBe("Customer,Amount,Note");
  });

  it("separates rows with CRLF, which is what Excel expects", () => {
    const csv = toCsv(
      [
        { customer: "A", amount: 1 },
        { customer: "B", amount: 2 },
      ],
      columns
    );
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});
