// Item Specification master — the priced catalog behind the "Add Specification" picker
// (FORTUNE_NET_TWINE_System_Simulation.md §3.4).
//
// This is a different thing from ITEM_MASTER. ITEM_MASTER is a small set of finished catalog
// products with their own reference sell price. SPEC_MASTER is the factory's specification
// database: a code, its physical dimensions, and a WEIGHT/PC — no price at all. Given Price is
// typed per quotation line, which is why a freshly added specification row reads GIVEN 0.00.
//
// Rows N-1595 through N-1603 are transcribed verbatim from the live system. The remaining families
// extend the same pattern across the net constructions already present in ITEM_MASTER, with
// weight scaled from each family's known unitWeightKg so search, filtering and pagination all have
// something real to work against.

export interface SpecMasterRow {
  code: string;
  /** Drives the Add Specification filter — must match "{material} {netType}" upper-cased. */
  description: string;
  material: string; // must match a value in SPEC_MATERIALS
  netType: string; // must match a value in SPEC_NET_TYPES
  twine: string;
  meshSize: string;
  meshDepth: string;
  length: string;
  weightPerPc: number;
}

/** The line label shown under a specification row, e.g. `NO.120(210/22x16) 3-1/2"STR 122MD x 50FL`. */
export function specRowLabel(row: SpecMasterRow): string {
  const dims = [row.meshSize, row.meshDepth].filter((v) => v && v !== "—").join(" ");
  const tail = row.length && row.length !== "—" ? ` x ${row.length}` : "";
  return `${row.twine}${dims ? ` ${dims}` : ""}${tail}`;
}

function netRows(
  prefix: string,
  start: number,
  material: string,
  twine: string,
  meshSize: string,
  meshDepth: string,
  lengths: [string, number][]
): SpecMasterRow[] {
  return lengths.map(([length, weightPerPc], i) => ({
    code: `${prefix}-${start + i}`,
    description: `${material} ${"Braided Net"}`.toUpperCase(),
    material,
    netType: "Braided Net",
    twine,
    meshSize,
    meshDepth,
    length,
    weightPerPc,
  }));
}

export const SPEC_MASTER: SpecMasterRow[] = [
  // ---- Nylon Braided Net · NO.120(210/22x16) · 3-1/2"STR · 122MD — transcribed from the live app
  ...netRows("N", 1595, "Nylon", "NO.120(210/22x16)", '3-1/2"STR', "122MD", [
    ["50FL(1180ML)", 483.2],
    ["50FL", 495],
    ["60FL", 590],
    ["70FL", 689],
    ["70FL(1656ML)", 673.6],
    ["35FL", 344.5],
    ["50FL(1115ML)", 465],
    ["1180ML", 506],
    ["60FL(1414ML)", 579],
  ]),

  // ---- Nylon Braided Net · NO.96(210/20x16) — scaled from ITEM_MASTER 227.9 / 241.5
  ...netRows("N", 1610, "Nylon", "NO.96(210/20x16)", '3-1/2"STR', "122MD", [
    ["35FL", 325.1],
    ["50FL", 467.1],
    ["50FL(1180ML)", 456.0],
    ["60FL", 556.8],
    ["60FL(1414ML)", 546.4],
    ["70FL", 650.2],
    ["70FL(1656ML)", 635.7],
    ["1180ML", 477.5],
  ]),

  // ---- Nylon Braided Net · NO.84(210/16x16) — scaled from 164.85 / 241.5
  ...netRows("N", 1620, "Nylon", "NO.84(210/16x16)", '3-1/2"STR', "122MD", [
    ["35FL", 235.2],
    ["50FL", 337.9],
    ["50FL(1180ML)", 329.8],
    ["60FL", 402.7],
    ["60FL(1414ML)", 395.2],
    ["70FL", 470.3],
    ["70FL(1656ML)", 459.8],
    ["1180ML", 345.4],
  ]),

  // ---- Nylon Braided Net · NO.72(210/14x16) — scaled from 143.7 / 241.5
  ...netRows("N", 1630, "Nylon", "NO.72(210/14x16)", '3-1/2"STR', "122MD", [
    ["35FL", 205.0],
    ["50FL", 294.5],
    ["50FL(1180ML)", 287.5],
    ["60FL", 351.1],
    ["60FL(1414ML)", 344.5],
    ["70FL", 410.0],
    ["70FL(1656ML)", 400.8],
    ["1180ML", 301.1],
  ]),

  // ---- Hi-Ex Braided Net · NO.42(250/08x16) · 8"STR · 50MD — 120FL anchors ITEM_MASTER's 33.9
  ...netRows("H", 1640, "Hi-Ex", "NO.42(250/08x16)", '8"STR', "50MD", [
    ["60FL", 17.0],
    ["90FL", 25.4],
    ["120FL", 33.9],
    ["120FL(2400ML)", 33.1],
    ["150FL", 42.4],
    ["180FL", 50.9],
  ]),

  // ---- Hi-Ex Braided Net · NO.96(250/20x16) · 5"STR · 15MD — 120FL anchors ITEM_MASTER's 38.55
  ...netRows("H", 1650, "Hi-Ex", "NO.96(250/20x16)", '5"STR', "15MD", [
    ["60FL", 19.3],
    ["90FL", 28.9],
    ["120FL", 38.55],
    ["120FL(1830ML)", 37.6],
    ["150FL", 48.2],
    ["180FL", 57.8],
  ]),

  // ---- Nylon Braided Twine — sold by the kg, so WEIGHT/PC is 1. Codes start with "T" so the
  // insurance lookup resolves to the twine rate rather than the net rate.
  ...["210/30x16", "210/36x16", "210/48x16", "210/60x16"].map((twine, i) => ({
    code: `T-${1660 + i}`,
    description: "NYLON BRAIDED TWINE",
    material: "Nylon",
    netType: "Braided Twine",
    twine,
    meshSize: "—",
    meshDepth: "—",
    length: "1KG CONE",
    weightPerPc: 1,
  })),
];

// -------------------------------------------------------------------------
// Lacing catalog (§3.7). LC-001…LC-005 are twines priced by the kilo and DO add to Total Weight;
// LC-006 is a flat charge that adds an amount but no weight.
//
// The 2.50/kg default comes from doc §5.3: LC-001 at 100 KGS totalled 250.00.
// -------------------------------------------------------------------------

export interface LacingCatalogRow {
  code: string;
  description: string;
  kind: "twine" | "charge";
  defaultRate: number;
}

export const LACING_CATALOG: LacingCatalogRow[] = [
  { code: "LC-001", description: "Lacing Twine Nylon Tarred", kind: "twine", defaultRate: 2.5 },
  { code: "LC-002", description: "Lacing Twine Nylon Water Based Resin", kind: "twine", defaultRate: 2.5 },
  { code: "LC-003", description: "Lacing Twine Hi-ex Tarred", kind: "twine", defaultRate: 2.5 },
  { code: "LC-004", description: "Lacing Twine Hi-ex Water Based Resin", kind: "twine", defaultRate: 2.5 },
  { code: "LC-005", description: "Lacing Twine Prime & TP", kind: "twine", defaultRate: 2.5 },
  { code: "LC-006", description: "Lacing Charge", kind: "charge", defaultRate: 0 },
];
