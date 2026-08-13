import { createZip, downloadBinary, textBytes, xmlEscape } from "./zip";

/**
 * Writing a real Excel workbook.
 *
 * A CSV is one sheet of strings. What the office actually circulates is a workbook with a tab per
 * analysis, currency that sums, weights that average and percentages that read as percentages, and
 * a CSV forces all of that to be re-applied by hand every month. So this emits genuine
 * SpreadsheetML: the numbers arrive as numbers, formatted, and are ready to pivot.
 *
 * Deliberately small. There is no formula engine, no merged cells, no charts. Everything the
 * monthly pack needs is a rectangular table with a header row, so that is all this does, well.
 */

/**
 * How a column's values should read in Excel.
 *
 * `percent` expects a FRACTION, not a number already scaled to a hundred. Excel's percent format
 * multiplies by 100 on display, so a conversion rate of 46.29% is written as 0.4629. Writing
 * 46.29 would render as 4629%. It is the one format here that is not what it looks like.
 */
export type CellFormat = "text" | "number" | "money" | "weight" | "percent" | "integer" | "date";

export interface SheetColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  format?: CellFormat;
  /** Column width in characters. Defaults by format. */
  width?: number;
}

export interface Sheet<T = never> {
  /** Tab name. Excel forbids : \ / ? * [ ] and caps it at 31 characters; both are enforced here. */
  name: string;
  columns: SheetColumn<T>[];
  rows: T[];
  /**
   * A line or two above the header explaining what the sheet is and what period it covers.
   *
   * Worth the two rows: a tab called "Per Customer" that has been emailed on three times says
   * nothing about which month it is, and the answer is otherwise only in the filename.
   */
  notes?: string[];
  /** A bolded totals row at the foot, aligned to the same columns. */
  totals?: (string | number | null)[];
}

/**
 * Number formats, in the order they are registered.
 *
 * Indices 0-4 are built into Excel and must not be redefined, so custom formats start at 164 by
 * convention. The order here is the order of `cellXfs` below, which is what a cell's `s` attribute
 * points at.
 */
const NUM_FORMATS: { id: number; code: string }[] = [
  { id: 164, code: '"$"#,##0.00' },
  { id: 165, code: "#,##0.00" },
  { id: 166, code: "0.00%" },
  { id: 167, code: "#,##0" },
  { id: 168, code: "yyyy-mm-dd" },
];

/** Style index per format. 0 is the default body cell; 1 is the bold header. */
const STYLE: Record<CellFormat, number> = {
  text: 0,
  money: 2,
  number: 3,
  percent: 4,
  integer: 5,
  weight: 3,
  date: 6,
};
const HEADER_STYLE = 1;
const NOTE_STYLE = 7;
const TOTAL_STYLE = 8;

const DEFAULT_WIDTH: Record<CellFormat, number> = {
  text: 26,
  money: 16,
  number: 14,
  percent: 12,
  integer: 10,
  weight: 14,
  date: 13,
};

/** Excel's own restrictions on a tab name, applied rather than left to fail at open time. */
export function sanitizeSheetName(name: string, used: Set<string> = new Set()): string {
  let clean = name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  if (used.has(clean.toLowerCase())) {
    // Excel refuses duplicate tab names outright, so a suffix is the only way through.
    for (let n = 2; ; n++) {
      const candidate = `${clean.slice(0, 31 - String(n).length - 1)} ${n}`;
      if (!used.has(candidate.toLowerCase())) {
        clean = candidate;
        break;
      }
    }
  }
  used.add(clean.toLowerCase());
  return clean;
}

/** A1-style reference for a zero-based column and row. */
function ref(col: number, row: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return `${name}${row + 1}`;
}

function cell(col: number, row: number, value: string | number | null | undefined, style: number): string {
  const at = ref(col, row);
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${at}" s="${style}"><v>${value}</v></c>`;
  }
  // Inline strings rather than a shared-strings table. The saving from pooling only shows up on
  // tens of thousands of repeated cells, and a whole part of the file not existing is one less
  // thing to get wrong.
  return `<c r="${at}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function sheetXml(sheet: AnySheet): string {
  const notes = sheet.notes ?? [];
  const headerRow = notes.length;
  const rows: string[] = [];

  notes.forEach((note, i) => {
    rows.push(`<row r="${i + 1}">${cell(0, i, note, NOTE_STYLE)}</row>`);
  });

  rows.push(
    `<row r="${headerRow + 1}">${sheet.columns.map((c, i) => cell(i, headerRow, c.header, HEADER_STYLE)).join("")}</row>`
  );

  sheet.rows.forEach((row, r) => {
    const at = headerRow + 1 + r;
    const cells = sheet.columns
      .map((c, i) => cell(i, at, c.value(row), STYLE[c.format ?? "text"]))
      .join("");
    rows.push(`<row r="${at + 1}">${cells}</row>`);
  });

  if (sheet.totals) {
    const at = headerRow + 1 + sheet.rows.length;
    const cells = sheet.totals.map((v, i) => cell(i, at, v, TOTAL_STYLE)).join("");
    rows.push(`<row r="${at + 1}">${cells}</row>`);
  }

  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? DEFAULT_WIDTH[c.format ?? "text"]}" customWidth="1"/>`)
    .join("");

  // The header row is frozen. Every one of these tables is read by scrolling, and a scrolled table
  // with the headings gone is a grid of numbers nobody can attribute to a column.
  const freeze = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow + 1}" topLeftCell="A${headerRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  const lastCol = ref(Math.max(0, sheet.columns.length - 1), 0).replace(/\d+$/, "");
  const autoFilter = `<autoFilter ref="A${headerRow + 1}:${lastCol}${headerRow + 1 + sheet.rows.length}"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>${sheet.rows.length ? autoFilter : ""}</worksheet>`;
}

function stylesXml(): string {
  const numFmts = NUM_FORMATS.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xmlEscape(f.code)}"/>`).join("");
  // Order matters: each xf's position is the index a cell's `s` attribute refers to.
  const xfs = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`, // 0 text
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`, // 1 header
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`, // 2 money
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`, // 3 number / weight
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`, // 4 percent
    `<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`, // 5 integer
    `<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`, // 6 date
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`, // 7 note
    `<xf numFmtId="164" fontId="1" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>`, // 8 total
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="${NUM_FORMATS.length}">${numFmts}</numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF6E766C"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1A5636"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EFE9"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF1A5636"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF1A5636"/></top><bottom style="double"><color rgb="FF1A5636"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">${xfs}</cellXfs>
</styleSheet>`;
}

/**
 * A sheet whose row type has been erased.
 *
 * A workbook's tabs each describe a different shape, so the array holding them cannot be generic
 * over one. `Sheet<T>` keeps callers type-safe where the rows are built; this is the shape the
 * writer consumes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySheet = Sheet<any>;

export interface WorkbookMeta {
  title?: string;
  creator?: string;
}

/** Assembles the .xlsx parts. Exported separately from the download so it can be tested. */
export function buildWorkbook(sheets: AnySheet[], meta: WorkbookMeta = {}): Uint8Array {
  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: sanitizeSheetName(s.name, used) }));

  const sheetEntries = named.map((s, i) => ({
    path: `xl/worksheets/sheet${i + 1}.xml`,
    data: textBytes(sheetXml(s)),
  }));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${named.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(meta.title ?? "Report")}</dc:title>
<dc:creator>${xmlEscape(meta.creator ?? "Fortune Net &amp; Twine ERP")}</dc:creator>
<cp:lastModifiedBy>${xmlEscape(meta.creator ?? "Fortune Net &amp; Twine ERP")}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`;

  return createZip([
    { path: "[Content_Types].xml", data: textBytes(contentTypes) },
    { path: "_rels/.rels", data: textBytes(rootRels) },
    { path: "docProps/core.xml", data: textBytes(core) },
    { path: "xl/workbook.xml", data: textBytes(workbook) },
    { path: "xl/_rels/workbook.xml.rels", data: textBytes(workbookRels) },
    { path: "xl/styles.xml", data: textBytes(stylesXml()) },
    ...sheetEntries,
  ]);
}

export function downloadWorkbook(filename: string, sheets: AnySheet[], meta: WorkbookMeta = {}): void {
  downloadBinary(
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
    buildWorkbook(sheets, meta),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}
