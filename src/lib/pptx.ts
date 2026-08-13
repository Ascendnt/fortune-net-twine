import { createZip, downloadBinary, textBytes, xmlEscape } from "./zip";

/**
 * Writing the monthly deck.
 *
 * The office already produces a PowerPoint every month, "EXPORT SALES MONTHLY SUMMARY AND
 * PERFORMANCE", and every chart in it is pasted out of Excel by hand. The data behind those
 * slides is all in this system, so the deck is a rendering problem, not an analysis one.
 *
 * The charts are native DrawingML, not screenshots. That matters more than it sounds: a pasted
 * image cannot be recoloured to match a template, does not reflow when the slide is resized, and
 * prints soft. A real chart part behaves like one somebody built in PowerPoint.
 *
 * What it deliberately does not do is embed the source workbook behind each chart. PowerPoint's
 * "Edit Data" button opens Excel against that hidden workbook; without it the button reports it
 * cannot find the data. Everything else works normally, including rendering, printing, restyling
 * and exporting to PDF, because the values are cached in the chart part itself. The workbook is
 * duplicated data whose only job is to feed a button, and the same figures come out of the Excel
 * export beside this one, so the trade is worth stating and taking.
 */

const EMU_PER_INCH = 914400;
/** 16:9, the aspect the client's own deck uses. */
const SLIDE_W = Math.round(13.333 * EMU_PER_INCH);
const SLIDE_H = 7.5 * EMU_PER_INCH;

const INK = "1A2E22";
const PINE = "1A5636";
const MUTED = "6E766C";
/** Series colours, in order. Picked to stay apart in print and for the common colour deficiencies. */
export const SERIES_COLORS = ["1A5636", "1E5FA8", "D38F1A", "8C4A9E", "A33A3A", "3E8E7E", "9BA39A", "5B6BB5"];

export interface KpiTile {
  label: string;
  value: string;
  /** A smaller line under the figure: a comparison, a period, a count. */
  note?: string;
}

export interface ChartSeries {
  name: string;
  values: (number | null)[];
}

export type SlideSpec =
  | { kind: "title"; title: string; subtitle?: string; date?: string }
  | { kind: "section"; title: string; subtitle?: string }
  | { kind: "kpi"; title: string; subtitle?: string; tiles: KpiTile[] }
  | {
      kind: "table";
      title: string;
      subtitle?: string;
      columns: string[];
      rows: (string | number)[][];
      /** Rendered bold with a rule above it. */
      totals?: (string | number)[];
    }
  | {
      kind: "chart";
      title: string;
      subtitle?: string;
      chart: "bar" | "line" | "pie";
      categories: string[];
      series: ChartSeries[];
      /** Excel number format for the value axis and data labels, e.g. '"$"#,##0'. */
      numberFormat?: string;
    };

const px = (inches: number) => Math.round(inches * EMU_PER_INCH);

/** Points to the hundredths PowerPoint counts font sizes in. */
const pt = (size: number) => Math.round(size * 100);

function textBox(opts: {
  x: number;
  y: number;
  w: number;
  h: number;
  runs: { text: string; size: number; bold?: boolean; color?: string }[];
  align?: "l" | "ctr" | "r";
  anchor?: "t" | "ctr" | "b";
  id: number;
  name: string;
}): string {
  const paragraphs = opts.runs
    .map(
      (r) =>
        `<a:p><a:pPr algn="${opts.align ?? "l"}"/><a:r><a:rPr lang="en-US" sz="${pt(r.size)}"${r.bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${r.color ?? INK}"/></a:solidFill><a:latin typeface="Aptos Narrow"/></a:rPr><a:t>${xmlEscape(r.text)}</a:t></a:r></a:p>`
    )
    .join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id}" name="${xmlEscape(opts.name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.w}" cy="${opts.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${opts.anchor ?? "t"}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function rect(opts: { x: number; y: number; w: number; h: number; fill: string; id: number; line?: string }): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id}" name="Panel ${opts.id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.w}" cy="${opts.h}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 6000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="${opts.fill}"/></a:solidFill>${opts.line ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${opts.line}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>"}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
}

/** The heading every content slide carries, so the deck reads consistently. */
function slideHeading(title: string, subtitle: string | undefined, idFrom: number): string {
  const runs = [{ text: title, size: 24, bold: true, color: PINE }];
  const sub = subtitle
    ? textBox({
        x: px(0.6),
        y: px(1.02),
        w: px(12.1),
        h: px(0.35),
        runs: [{ text: subtitle, size: 12, color: MUTED }],
        id: idFrom + 1,
        name: "Subtitle",
      })
    : "";
  return (
    rect({ x: px(0.6), y: px(0.42), w: px(0.06), h: px(0.42), fill: PINE, id: idFrom + 2 }) +
    textBox({ x: px(0.78), y: px(0.38), w: px(12), h: px(0.5), runs, id: idFrom, name: "Title" }) +
    sub
  );
}

function tableXml(columns: string[], rows: (string | number)[][], totals: (string | number)[] | undefined, y: number, id: number): string {
  const width = px(12.1);
  // First column carries the label and gets the slack; the rest split what is left evenly.
  const first = Math.round(width * (columns.length > 4 ? 0.28 : 0.34));
  const rest = Math.floor((width - first) / Math.max(1, columns.length - 1));
  const grid = columns
    .map((_, i) => `<a:gridCol w="${i === 0 ? first : rest}"/>`)
    .join("");

  const cellXml = (text: string | number, opts: { bold?: boolean; head?: boolean; total?: boolean; right?: boolean }) => {
    const color = opts.head ? "FFFFFF" : INK;
    const fill = opts.head
      ? `<a:solidFill><a:srgbClr val="${PINE}"/></a:solidFill>`
      : opts.total
        ? `<a:solidFill><a:srgbClr val="E8EFE9"/></a:solidFill>`
        : `<a:noFill/>`;
    return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${opts.right ? "r" : "l"}"/><a:r><a:rPr lang="en-US" sz="${pt(11)}"${opts.bold || opts.head || opts.total ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos Narrow"/></a:rPr><a:t>${xmlEscape(String(text))}</a:t></a:r></a:p></a:txBody><a:tcPr marL="68580" marR="68580" marT="27432" marB="27432" anchor="ctr">${fill}</a:tcPr></a:tc>`;
  };

  const head = `<a:tr h="${px(0.34)}">${columns.map((c, i) => cellXml(c, { head: true, right: i > 0 })).join("")}</a:tr>`;
  const body = rows
    .map((r) => `<a:tr h="${px(0.3)}">${columns.map((_, i) => cellXml(r[i] ?? "", { right: i > 0 })).join("")}</a:tr>`)
    .join("");
  const foot = totals
    ? `<a:tr h="${px(0.32)}">${columns.map((_, i) => cellXml(totals[i] ?? "", { total: true, right: i > 0 })).join("")}</a:tr>`
    : "";

  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${px(0.6)}" y="${y}"/><a:ext cx="${width}" cy="${px(0.3)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr><a:tblGrid>${grid}</a:tblGrid>${head}${body}${foot}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

/** The `<c:ser>` elements shared by bar and line charts. */
function cachedSeries(spec: Extract<SlideSpec, { kind: "chart" }>): string {
  return spec.series
    .map((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const cats = spec.categories
        .map((c, n) => `<c:pt idx="${n}"><c:v>${xmlEscape(c)}</c:v></c:pt>`)
        .join("");
      const vals = s.values
        .map((v, n) => (v === null || !Number.isFinite(v) ? "" : `<c:pt idx="${n}"><c:v>${v}</c:v></c:pt>`))
        .join("");
      const shape =
        spec.chart === "line"
          ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:marker>`
          : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>Series!$${String.fromCharCode(66 + i)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${shape}<c:cat><c:strRef><c:f>Series!$A$2:$A$${spec.categories.length + 1}</c:f><c:strCache><c:ptCount val="${spec.categories.length}"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Series!$${String.fromCharCode(66 + i)}$2:$${String.fromCharCode(66 + i)}$${spec.categories.length + 1}</c:f><c:numCache><c:formatCode>${xmlEscape(spec.numberFormat ?? "General")}</c:formatCode><c:ptCount val="${spec.categories.length}"/>${vals}</c:numCache></c:numRef></c:val>${spec.chart === "line" ? "<c:smooth val=\"0\"/>" : ""}</c:ser>`;
    })
    .join("");
}

function chartXml(spec: Extract<SlideSpec, { kind: "chart" }>): string {
  const fmt = xmlEscape(spec.numberFormat ?? "General");
  const txPr = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${pt(10)}"><a:solidFill><a:srgbClr val="${MUTED}"/></a:solidFill><a:latin typeface="Aptos Narrow"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const legend = `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr}</c:legend>`;

  let plot: string;
  if (spec.chart === "pie") {
    const s = spec.series[0] ?? { name: "", values: [] };
    const pts = spec.categories
      .map(
        (_, i) =>
          `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${SERIES_COLORS[i % SERIES_COLORS.length]}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`
      )
      .join("");
    const cats = spec.categories.map((c, n) => `<c:pt idx="${n}"><c:v>${xmlEscape(c)}</c:v></c:pt>`).join("");
    const vals = s.values
      .map((v, n) => (v === null || !Number.isFinite(v) ? "" : `<c:pt idx="${n}"><c:v>${v}</c:v></c:pt>`))
      .join("");
    // A doughnut rather than a pie: the client's own breakdown slides use one, and the hole is
    // where the total goes without a second shape on top of the chart.
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Series!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${pts}<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/></c:spPr>${txPr}<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls><c:cat><c:strRef><c:f>Series!$A$2:$A$${spec.categories.length + 1}</c:f><c:strCache><c:ptCount val="${spec.categories.length}"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Series!$B$2:$B$${spec.categories.length + 1}</c:f><c:numCache><c:formatCode>${fmt}</c:formatCode><c:ptCount val="${spec.categories.length}"/>${vals}</c:numCache></c:numRef></c:val></c:ser><c:firstSliceAng val="0"/><c:holeSize val="52"/></c:doughnutChart>`;
    return wrapChart(plot, legend, "");
  }

  const axes = `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="DFE3DD"/></a:solidFill></a:ln></c:spPr>${txPr}<c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="EEF0EC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr}<c:crossAx val="111111111"/></c:valAx>`;

  plot =
    spec.chart === "bar"
      ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${cachedSeries(spec)}<c:gapWidth val="60"/><c:overlap val="-10"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>`
      : `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${cachedSeries(spec)}<c:marker val="1"/><c:axId val="111111111"/><c:axId val="222222222"/></c:lineChart>`;

  return wrapChart(plot, legend, axes);
}

function wrapChart(plot: string, legend: string, axes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
</c:chartSpace>`;
}

function slideXml(spec: SlideSpec, chartRelId: string | null): string {
  let shapes = "";

  if (spec.kind === "title") {
    shapes =
      rect({ x: 0, y: 0, w: SLIDE_W, h: px(2.9), fill: PINE, id: 2 }) +
      textBox({
        x: px(0.9),
        y: px(1.0),
        w: px(11.5),
        h: px(1.1),
        runs: [{ text: spec.title, size: 40, bold: true, color: "FFFFFF" }],
        id: 3,
        name: "Title",
      }) +
      textBox({
        x: px(0.9),
        y: px(2.05),
        w: px(11.5),
        h: px(0.5),
        runs: [{ text: spec.subtitle ?? "", size: 18, color: "C6DACB" }],
        id: 4,
        name: "Subtitle",
      }) +
      textBox({
        x: px(0.9),
        y: px(3.3),
        w: px(11.5),
        h: px(0.4),
        runs: [{ text: spec.date ?? "", size: 13, color: MUTED }],
        id: 5,
        name: "Date",
      }) +
      textBox({
        x: px(0.9),
        y: px(6.6),
        w: px(11.5),
        h: px(0.4),
        runs: [{ text: "Fortune Net & Twine Manufacturing Corp.", size: 12, bold: true, color: PINE }],
        id: 6,
        name: "Company",
      });
  } else if (spec.kind === "section") {
    shapes =
      rect({ x: 0, y: px(2.7), w: SLIDE_W, h: px(2.1), fill: "E8EFE9", id: 2 }) +
      textBox({
        x: px(0.9),
        y: px(3.05),
        w: px(11.5),
        h: px(0.8),
        runs: [{ text: spec.title, size: 30, bold: true, color: PINE }],
        id: 3,
        name: "Title",
      }) +
      textBox({
        x: px(0.9),
        y: px(3.95),
        w: px(11.5),
        h: px(0.5),
        runs: [{ text: spec.subtitle ?? "", size: 14, color: MUTED }],
        id: 4,
        name: "Subtitle",
      });
  } else if (spec.kind === "kpi") {
    shapes = slideHeading(spec.title, spec.subtitle, 2);
    // Up to four across; more than that wraps to a second row and the tiles get shorter.
    const perRow = Math.min(4, Math.max(1, spec.tiles.length));
    const gap = px(0.25);
    const tileW = Math.floor((px(12.1) - gap * (perRow - 1)) / perRow);
    const rows = Math.ceil(spec.tiles.length / perRow);
    const tileH = rows > 1 ? px(1.65) : px(2.0);
    spec.tiles.forEach((tile, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = px(0.6) + col * (tileW + gap);
      const y = px(1.6) + row * (tileH + gap);
      const id = 10 + i * 4;
      shapes +=
        rect({ x, y, w: tileW, h: tileH, fill: "F7F8F6", line: "DFE3DD", id }) +
        textBox({
          x: x + px(0.22),
          y: y + px(0.2),
          w: tileW - px(0.44),
          h: px(0.4),
          runs: [{ text: tile.label.toUpperCase(), size: 10, bold: true, color: MUTED }],
          id: id + 1,
          name: "Label",
        }) +
        textBox({
          x: x + px(0.22),
          y: y + px(0.6),
          w: tileW - px(0.44),
          h: px(0.7),
          runs: [{ text: tile.value, size: rows > 1 ? 22 : 28, bold: true, color: PINE }],
          id: id + 2,
          name: "Value",
        }) +
        textBox({
          x: x + px(0.22),
          y: y + tileH - px(0.62),
          w: tileW - px(0.44),
          h: px(0.5),
          runs: [{ text: tile.note ?? "", size: 10, color: MUTED }],
          id: id + 3,
          name: "Note",
        });
    });
  } else if (spec.kind === "table") {
    shapes = slideHeading(spec.title, spec.subtitle, 2) + tableXml(spec.columns, spec.rows, spec.totals, px(1.5), 20);
  } else {
    shapes = slideHeading(spec.title, spec.subtitle, 2);
    if (chartRelId) {
      shapes += `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${px(0.6)}" y="${px(1.5)}"/><a:ext cx="${px(12.1)}" cy="${px(5.4)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRelId}"/></a:graphicData></a:graphic></p:graphicFrame>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Fortune">
<a:themeElements>
<a:clrScheme name="Fortune"><a:dk1><a:srgbClr val="1A2E22"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1A5636"/></a:dk2><a:lt2><a:srgbClr val="F7F8F6"/></a:lt2><a:accent1><a:srgbClr val="1A5636"/></a:accent1><a:accent2><a:srgbClr val="1E5FA8"/></a:accent2><a:accent3><a:srgbClr val="D38F1A"/></a:accent3><a:accent4><a:srgbClr val="8C4A9E"/></a:accent4><a:accent5><a:srgbClr val="A33A3A"/></a:accent5><a:accent6><a:srgbClr val="3E8E7E"/></a:accent6><a:hlink><a:srgbClr val="1E5FA8"/></a:hlink><a:folHlink><a:srgbClr val="6E766C"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Fortune"><a:majorFont><a:latin typeface="Aptos Narrow"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos Narrow"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Fortune"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="15875"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements>
</a:theme>`;

const SLIDE_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;

const SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;

export interface DeckMeta {
  title?: string;
  creator?: string;
}

/** Assembles the .pptx parts. Separated from the download so it can be tested. */
export function buildDeck(slides: SlideSpec[], meta: DeckMeta = {}): Uint8Array {
  const charts = slides
    .map((s, i) => ({ slide: i, spec: s }))
    .filter((x): x is { slide: number; spec: Extract<SlideSpec, { kind: "chart" }> } => x.spec.kind === "chart");
  const chartIndexBySlide = new Map(charts.map((c, n) => [c.slide, n + 1]));

  const slideParts = slides.map((spec, i) => {
    const chartNo = chartIndexBySlide.get(i);
    return {
      path: `ppt/slides/slide${i + 1}.xml`,
      data: textBytes(slideXml(spec, chartNo ? "rId2" : null)),
    };
  });

  const slideRels = slides.map((_, i) => {
    const chartNo = chartIndexBySlide.get(i);
    const chartRel = chartNo
      ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`
      : "";
    return {
      path: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      data: textBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${chartRel}
</Relationships>`),
    };
  });

  const chartParts = charts.flatMap((c, n) => [
    { path: `ppt/charts/chart${n + 1}.xml`, data: textBytes(chartXml(c.spec)) },
    {
      path: `ppt/charts/_rels/chart${n + 1}.xml.rels`,
      data: textBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`),
    },
  ]);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n")}
${charts.map((_, n) => `<Override PartName="/ppt/charts/chart${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("\n")}
</Types>`;

  // Slide relationship ids start at 2 so rId1 can be the master, which presentation.xml requires
  // to come first in its own relationship part.
  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`;

  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
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
    {
      path: "_rels/.rels",
      data: textBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`),
    },
    { path: "docProps/core.xml", data: textBytes(core) },
    { path: "ppt/presentation.xml", data: textBytes(presentation) },
    { path: "ppt/_rels/presentation.xml.rels", data: textBytes(presentationRels) },
    { path: "ppt/theme/theme1.xml", data: textBytes(THEME) },
    { path: "ppt/slideMasters/slideMaster1.xml", data: textBytes(SLIDE_MASTER) },
    {
      path: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      data: textBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`),
    },
    { path: "ppt/slideLayouts/slideLayout1.xml", data: textBytes(SLIDE_LAYOUT) },
    {
      path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      data: textBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`),
    },
    ...slideParts,
    ...slideRels,
    ...chartParts,
  ]);
}

export function downloadDeck(filename: string, slides: SlideSpec[], meta: DeckMeta = {}): void {
  downloadBinary(
    filename.endsWith(".pptx") ? filename : `${filename}.pptx`,
    buildDeck(slides, meta),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
}
