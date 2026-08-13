import { describe, it, expect } from "vitest";
import { buildWorkbook, sanitizeSheetName, type AnySheet } from "./xlsx";
import { buildDeck, type SlideSpec } from "./pptx";
import { crc32 } from "./zip";

/**
 * The office formats are ZIP-of-XML, so the tests read the archive back and inspect the parts.
 * Asserting on the byte stream would lock in an encoding nobody cares about; asserting on the
 * parts checks the thing Excel and PowerPoint actually look for.
 */
function readZip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const size = view.getUint32(localAt + 18, true);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataAt, dataAt + size);
    expect(view.getUint32(at + 16, true), `crc for ${name}`).toBe(crc32(data));
    out[name] = decoder.decode(data);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * Every part named in [Content_Types].xml has to exist, and every part in the archive that needs a
 * content type has to be named. A mismatch either way is the single most common reason Office
 * refuses a generated file outright, with an error that says nothing useful.
 */
function expectContentTypesResolve(parts: Record<string, string>) {
  const types = parts["[Content_Types].xml"];
  expect(types, "[Content_Types].xml").toBeDefined();
  for (const partName of types.matchAll(/PartName="([^"]+)"/g)) {
    expect(parts[partName[1].replace(/^\//, "")], `declared part ${partName[1]}`).toBeDefined();
  }
  const defaults = [...types.matchAll(/Default Extension="([^"]+)"/g)].map((m) => m[1]);
  for (const path of Object.keys(parts)) {
    const ext = path.split(".").pop() ?? "";
    const covered = defaults.includes(ext) || types.includes(`PartName="/${path}"`);
    expect(covered, `${path} has no content type`).toBe(true);
  }
}

/** Every rId a part references has to exist in that part's own .rels. */
function expectRelationshipsResolve(parts: Record<string, string>, partPath: string) {
  const dir = partPath.includes("/") ? partPath.slice(0, partPath.lastIndexOf("/")) : "";
  const relsPath = dir ? `${dir}/_rels/${partPath.slice(dir.length + 1)}.rels` : `_rels/${partPath}.rels`;
  const rels = parts[relsPath];
  const used = [...parts[partPath].matchAll(/r:(?:id|embed)="([^"]+)"/g)].map((m) => m[1]);
  for (const id of used) {
    expect(rels, `${partPath} references ${id} but has no rels part`).toBeDefined();
    expect(rels.includes(`Id="${id}"`), `${relsPath} is missing ${id}`).toBe(true);
  }
  // And every relationship target must be a part that exists.
  for (const target of (rels ?? "").matchAll(/Target="([^"]+)"/g)) {
    const resolved = new URL(target[1], `file:///${dir}/`).pathname.replace(/^\//, "");
    expect(parts[resolved], `${relsPath} points at missing ${resolved}`).toBeDefined();
  }
}

// ---------------------------------------------------------------------------

describe("sanitizeSheetName", () => {
  it("strips the characters Excel refuses in a tab name", () => {
    expect(sanitizeSheetName("Q1/Q2: sales [draft]")).toBe("Q1 Q2 sales draft");
  });

  it("truncates to Excel's 31-character limit", () => {
    expect(sanitizeSheetName("x".repeat(60))).toHaveLength(31);
  });

  it("disambiguates a duplicate rather than producing a workbook Excel will not open", () => {
    const used = new Set<string>();
    expect(sanitizeSheetName("Summary", used)).toBe("Summary");
    expect(sanitizeSheetName("Summary", used)).toBe("Summary 2");
    expect(sanitizeSheetName("Summary", used)).toBe("Summary 3");
  });

  it("falls back to a name rather than an empty tab", () => {
    expect(sanitizeSheetName("///")).toBe("Sheet");
  });
});

describe("buildWorkbook", () => {
  const sheets: AnySheet[] = [
    {
      name: "Quoted vs Won",
      notes: ["June 2026"],
      columns: [
        { header: "Customer", value: (r: { customer: string; value: number; rate: number }) => r.customer },
        { header: "Sales order", value: (r: { customer: string; value: number; rate: number }) => r.value, format: "money" },
        { header: "Conversion", value: (r: { customer: string; value: number; rate: number }) => r.rate, format: "percent" },
      ],
      rows: [
        { customer: "Sumipesca S.A.", value: 299376.07, rate: 0.4629 },
        { customer: 'Nets & "Twine" Ltd', value: 1000, rate: 1 },
      ],
      totals: ["GRAND TOTAL", 300376.07, 0.4629],
    },
  ];

  it("produces an archive whose declared parts all exist", () => {
    expectContentTypesResolve(readZip(buildWorkbook(sheets)));
  });

  it("wires the workbook to its sheets and styles", () => {
    const parts = readZip(buildWorkbook(sheets));
    expectRelationshipsResolve(parts, "xl/workbook.xml");
    expect(parts["xl/worksheets/sheet1.xml"]).toBeDefined();
    expect(parts["xl/styles.xml"]).toBeDefined();
  });

  it("writes numbers as numbers, not as text", () => {
    // The whole point over a CSV: a currency cell has to sum.
    const sheet = readZip(buildWorkbook(sheets))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("<v>299376.07</v>");
    expect(sheet).not.toContain("<t xml:space=\"preserve\">299376.07</t>");
  });

  it("escapes a customer name that would otherwise break the XML", () => {
    const sheet = readZip(buildWorkbook(sheets))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("Nets &amp; &quot;Twine&quot; Ltd");
  });

  it("freezes the header row below the notes, not at row one", () => {
    const sheet = readZip(buildWorkbook(sheets))["xl/worksheets/sheet1.xml"];
    // One note line, so the header is row 2 and the freeze splits after it.
    expect(sheet).toContain('ySplit="2"');
  });

  it("survives a sheet with no rows", () => {
    const parts = readZip(buildWorkbook([{ name: "Empty", columns: [{ header: "A", value: () => "" }], rows: [] }]));
    expectContentTypesResolve(parts);
    expect(parts["xl/worksheets/sheet1.xml"]).not.toContain("<autoFilter");
  });

  it("declares one worksheet part per sheet", () => {
    const parts = readZip(buildWorkbook([...sheets, { ...sheets[0], name: "Second" }]));
    expect(parts["xl/worksheets/sheet2.xml"]).toBeDefined();
    expectContentTypesResolve(parts);
  });
});

describe("buildDeck", () => {
  const slides: SlideSpec[] = [
    { kind: "title", title: "EXPORT SALES SUMMARY", subtitle: "June 2026", date: "20 July 2026" },
    { kind: "section", title: "June 2026 Sales Performance" },
    {
      kind: "kpi",
      title: "June 2026 Sales Performance",
      tiles: [
        { label: "Total sales quotations", value: "$1,482,366.84", note: "9 PI" },
        { label: "Conversion rate", value: "46.29%" },
      ],
    },
    {
      kind: "table",
      title: "Quoted against won",
      columns: ["Customer", "Quotation", "Order"],
      rows: [["Sumipesca S.A.", "$173,989.80", "$299,376.07"]],
      totals: ["GRAND TOTAL", "$1,482,366.84", "$686,132.90"],
    },
    {
      kind: "chart",
      chart: "bar",
      title: "Monthly performance",
      categories: ["Jan", "Feb", "Mar"],
      series: [
        { name: "2025", values: [1, 2, 3] },
        { name: "2026", values: [3, null, 1] },
      ],
      numberFormat: '"$"#,##0',
    },
    {
      kind: "chart",
      chart: "pie",
      title: "By material",
      categories: ["Nylon", "Polyethylene"],
      series: [{ name: "Value", values: [73, 27] }],
    },
  ];

  it("produces an archive whose declared parts all exist", () => {
    expectContentTypesResolve(readZip(buildDeck(slides)));
  });

  it("resolves every relationship the presentation and its slides reference", () => {
    const parts = readZip(buildDeck(slides));
    expectRelationshipsResolve(parts, "ppt/presentation.xml");
    for (let i = 1; i <= slides.length; i++) expectRelationshipsResolve(parts, `ppt/slides/slide${i}.xml`);
  });

  it("writes one slide part per slide and lists them all in order", () => {
    const parts = readZip(buildDeck(slides));
    for (let i = 1; i <= slides.length; i++) expect(parts[`ppt/slides/slide${i}.xml`], `slide${i}`).toBeDefined();
    expect(parts[`ppt/slides/slide${slides.length + 1}.xml`]).toBeUndefined();
    const ids = [...parts["ppt/presentation.xml"].matchAll(/<p:sldId id="(\d+)"/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids).toHaveLength(slides.length);
  });

  it("gives each chart slide its own chart part, numbered independently of the slide", () => {
    // Charts are on slides 5 and 6 but are chart1 and chart2. The two numbering schemes are
    // separate, and conflating them is how a slide ends up pointing at the wrong chart.
    const parts = readZip(buildDeck(slides));
    expect(parts["ppt/charts/chart1.xml"]).toBeDefined();
    expect(parts["ppt/charts/chart2.xml"]).toBeDefined();
    expect(parts["ppt/charts/chart3.xml"]).toBeUndefined();
    expect(parts["ppt/slides/slide5.xml"]).toContain('r:id="rId2"');
    expect(parts["ppt/slides/_rels/slide5.xml.rels"]).toContain("chart1.xml");
    expect(parts["ppt/slides/_rels/slide6.xml.rels"]).toContain("chart2.xml");
  });

  it("caches the values in the chart, so it renders without an embedded workbook", () => {
    const chart = readZip(buildDeck(slides))["ppt/charts/chart1.xml"];
    expect(chart).toContain("<c:numCache>");
    expect(chart).toContain("<c:strCache>");
    expect(chart).toContain("<c:barChart>");
  });

  it("omits a null point rather than plotting it as zero", () => {
    // A month that has not happened must break the series, not show a collapse to the axis.
    // Scoped to the value cache: the category cache legitimately has a point at every index.
    const chart = readZip(buildDeck(slides))["ppt/charts/chart1.xml"];
    const caches = [...chart.matchAll(/<c:numCache>([\s\S]*?)<\/c:numCache>/g)].map((m) => m[1]);
    expect(caches).toHaveLength(2);
    const values2026 = caches[1];
    expect(values2026).toContain('<c:pt idx="0"><c:v>3</c:v></c:pt>');
    expect(values2026).toContain('<c:pt idx="2"><c:v>1</c:v></c:pt>');
    expect(values2026).not.toContain('idx="1"');
    // The count still says three, so the gap lands in the right month rather than shifting Mar left.
    expect(values2026).toContain('<c:ptCount val="3"/>');
    expect(chart).toContain('<c:dispBlanksAs val="gap"/>');
  });

  it("renders a pie as a doughnut with percentage labels, as the client's own deck does", () => {
    const chart = readZip(buildDeck(slides))["ppt/charts/chart2.xml"];
    expect(chart).toContain("<c:doughnutChart>");
    expect(chart).toContain('<c:showPercent val="1"/>');
  });

  it("gives a slide with no chart no chart relationship at all", () => {
    const parts = readZip(buildDeck(slides));
    expect(parts["ppt/slides/_rels/slide1.xml.rels"]).not.toContain("chart");
  });

  it("survives a deck with no charts", () => {
    const parts = readZip(buildDeck([{ kind: "title", title: "Only a title" }]));
    expectContentTypesResolve(parts);
    expect(parts["ppt/charts/chart1.xml"]).toBeUndefined();
  });

  it("escapes text that would break the slide XML", () => {
    const parts = readZip(buildDeck([{ kind: "section", title: 'Nets & "Twine" <Ltd>' }]));
    expect(parts["ppt/slides/slide1.xml"]).toContain("Nets &amp; &quot;Twine&quot; &lt;Ltd&gt;");
  });
});
