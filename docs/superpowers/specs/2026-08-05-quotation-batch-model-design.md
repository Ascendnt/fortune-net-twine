# Quotation Batch Model & Pricing Correction — Design

**Date:** 2026-08-05
**Status:** Awaiting review
**Scope:** `New Quotation` authoring flow, pricing rule engine, PI PDF export, store persistence

## 1. Sources

| Source | Use |
|---|---|
| `FORTUNE_NET_TWINE_System_Simulation.md` | Authoritative process and formula reference. Section numbers below (§4, §5, §7) refer to it. |
| Screenshots of `accounting-system-351b1.web.app` | Authoritative structure reference — batch/item/specification nesting, modal inventory, column layout. |
| `Export Sales ERP Project Scoping WITH ANSWER.docx` | **Not yet incorporated.** See §11. |

The simulation doc is the reference for *what the numbers must be*. The screenshots are the reference for *what the structure must be*. Where the current build disagrees with either, the current build is wrong.

## 2. Goals

1. Correct three defects in the pricing engine (§4).
2. Replace the flat line-item model with the documented batch → item → specification tree (§5).
3. Make applied pricing rules default to off and make their rates legible (§6.4).
4. Give every pickable list search, filter and pagination.
5. Keep the prototype fully clickable end to end with no backend.

## 3. Non-goals

- No backend, API, or database. Everything is in-browser.
- No changes to Orders, Payments, Invoices, Approvals, Reports, Documents, or Activity beyond what the flattened `items` projection already feeds them.
- No new pricing rule *types*. All eight existing rules map to documented DST operations.
- Authentication and role enforcement stay as-is (demonstration only).

## 4. Defects in the current build

### 4.1 Insurance is a flat amount, not a percentage

§7 specifies `ADD INSURANCE : P → P + P × 0.0066`. The build models Insurance as `basis: "lookup_table"` with `lt_ins` row `{ key: "net", value: 0.66 }`, and `computeLinePricing` applies `p + rateVal`. At a Given Price of 11.60 this adds **0.66** where it should add **0.0766** — roughly 8.6× the intended step.

The root cause is that `lookup_table` conflates two different units. `lt_md` and `lt_dw` hold currency amounts; `lt_ins` holds a percentage. Nothing in the type distinguishes them.

**Fix:** `LookupTable` gains `valueKind: "amount" | "percent"`. `lt_md` and `lt_dw` are `"amount"` (behaviour unchanged). `lt_ins` is `"percent"`, and the engine applies it as a percent of the running total.

### 4.2 Every rule auto-applies to every new line

`defaultsFor()` in `NewQuotation.tsx` seeds `appliedRuleIds` with every enabled rule, so a fresh line silently carries Commission + Markup + Mesh Depth + Depth-Way + Insurance.

This also conflates two distinct concepts. A rule being **enabled** means it is available to apply; a rule being **applied** means it is in this line's chain. The build treats enablement as application.

**Fix:** specification lines initialise with an empty applied set. Nothing is applied until explicitly ticked.

### 4.3 Rates are invisible

The rule pills render `r.label` only. "Commission" and "Markup" give no indication they are 3% and 5%, and lookup-backed rules give no indication of what they resolve to for the line in question.

**Fix:** see §6.4.

### 4.4 Seeded MD/DW lookup values contradicted the doc

Found during implementation, not in the original review. `lt_md` carried `122 → 3.50` and `lt_dw` carried `50 → 10.00`, with a code comment claiming both came from the simulation doc. They did not: §5.2 rows 6 and 7 observed **`122MD → +0.1750`** and **`DW (50FL) → +0.5000`**. The seeded figures were roughly 20× too large.

**Fix:** both anchors corrected to the observed values, with the remaining buckets interpolated linearly from them (MD ≈ 0.001434/md, DW = 0.01/fl). `lt_dw` also gained buckets for the float lengths the specification master actually uses (35, 60, 70, 90, 150, 180) — previously only 50 and 120 existed.

Related: `getLookupValue` fell back to `rows[0]` when a key was missing, so an unlisted float length silently borrowed the first bucket's rate. It now falls back to the table's explicit `default` row, which is 0.

### 4.5 Verified as already correct

These are correct today and are pinned by tests rather than changed:

- `ADD COMMISSION r%` → `P / (1 − r)` (§7)
- `ADD PERCENTAGE r%` → `P × (1 + r)` (§7)
- `SUBTRACT PERCENTAGE r%` → `P / (1 + r)` (§7)
- `ADD/SUBTRACT AMOUNT a` → `P ± a` (§7)
- Round-at-the-end: `AMOUNT = U/P × QTY` computed from the unrounded U/P, then rounded. §5.1 row 7 gives `2561.625 × 10 = 25,616.25`, not `2561.63 × 10 = 25,616.30`. Row 10 confirms: `2577.3875 × 10 = 25,773.88`.

## 5. Domain model

### 5.1 The tree

The screenshots establish three levels of nesting. The **specification row is the priced unit** — not the item, and not the batch.

```
Quotation
└─ batches[]                      one batch per "Generate Batch Item" click
   ├─ type: "assembled"           title (free text) + items[]
   ├─ type: "normal"              items[]  (no title)
   │  └─ BatchItem                spec string from Item Selection + weight UOM + qty UOM
   │     └─ SpecLine[]            N-code rows from the spec master (multi-select)
   │        └─ weightPerPc · givenPriceKg · qtyPcs · pricing · unitPrice · amount · weightKg
   ├─ type: "lacing"              LacingLine[] from LC-001…LC-006
   └─ type: "note"                free text only
```

This is why the screenshot shows `TOTAL WEIGHT 1,952.60` (673.60 + 590.00 + 689.00 at qty 1) while `GRAND TOTAL` is still `$0.00` — weight lands the moment specifications are picked, amount waits for pricing. The build must reproduce that.

### 5.2 Types (new, in `src/lib/batches.ts`)

```ts
export type BatchType = "assembled" | "normal" | "lacing" | "note";

export interface SpecLine {
  id: string;
  specCode: string;        // N-1596
  description: string;     // composed from the master row, see §5.3
  weightPerPc: number;     // readonly, from the master row
  givenPriceKg: number;    // GIVEN input, default 0
  qtyPcs: number;          // QTY input, default 1
  pricing: LinePricing;    // always present; see §6.2.1 for defaults
  unitPrice: number;       // U/P — always derived, see §6.2.1
  amount: number;          // U/P × qty
  weightKg: number;        // weightPerPc × qty
}

export interface BatchItem {
  id: string;
  specification: string;   // composed by Item Selection
  selection: SpecSelection;// retained so Add Specification can filter and the spec is re-editable
  weightUom: string;       // KGS | LBS
  qtyUom: string;          // PCS | KGS
  specs: SpecLine[];
}

export interface LacingLine {
  id: string;
  code: string;                  // LC-001 … LC-006
  description: string;
  kind: "twine" | "charge";
  kgs: number;                   // 0 for a flat charge
  rate: number;                  // per-kg for twine; the flat amount for a charge
  amount: number;                // kgs × rate, or the flat amount
}

export interface QuotationBatch {
  id: string;
  type: BatchType;
  title?: string;          // assembled only
  items?: BatchItem[];     // assembled | normal
  lacing?: LacingLine[];   // lacing only
  note?: string;           // note only
}
```

`Quotation` gains `batches?: QuotationBatch[]`.

### 5.3 Relationship between `batches` and `items`

`batches` is authoritative for authoring. `items` is a **derived flat projection** produced on save by `flattenBatches(batches): QuotationLineItem[]`:

- one `QuotationLineItem` per `SpecLine`
- one per `LacingLine`
- none for NOTE batches
- each tagged with `batchId` and `itemId` so the PDF can regroup them

`QuotationLineItem` gains optional `batchId` and `itemId`. Every existing consumer — `QuotationDetail`, `InvoiceDetail`, `convertToSalesOrder`, Reports, the commercial invoice — keeps reading `items` and needs no change. Seeded quotations that have no `batches` render exactly as they do today.

This is the central compatibility decision: the tree is what you edit, the flat list is what everything downstream already understands.

### 5.4 New master data

**`SPEC_MASTER`** — the Item Specification database (§3.4), roughly 50 rows.

```ts
export interface SpecMasterRow {
  code: string;         // N-1596
  description: string;  // "NYLON BRAIDED NET" — drives the Add Specification filter
  material: string;     // "Nylon"
  netType: string;      // "Braided Net"
  twine: string;        // "NO.120(210/22x16)"
  meshSize: string;     // "3-1/2\"STR"
  meshDepth: string;    // "122MD"
  length: string;       // "50FL" | "50FL(1180ML)"
  weightPerPc: number;  // 495
}
```

The nine rows visible in the screenshots (N-1595 … N-1603) are seeded verbatim, then extended across the net families already present in `ITEM_MASTER` (No.96, No.84, No.72, Hi-Ex 8", Hi-Ex 5") with internally consistent WEIGHT/PC figures, so filtering and pagination are actually exercisable.

A specification row's display text composes as `{twine} {meshSize} {meshDepth} x {length}`, producing `NO.120(210/22x16) 3-1/2"STR 122MD x 70FL(1656ML)` — matching the screenshot exactly.

**`LACING_CATALOG`** — six rows, taken from the Lacing Selection screenshot:

| Code | Description | Kind |
|---|---|---|
| LC-001 | Lacing Twine Nylon Tarred | twine |
| LC-002 | Lacing Twine Nylon Water Based Resin | twine |
| LC-003 | Lacing Twine Hi-ex Tarred | twine |
| LC-004 | Lacing Twine Hi-ex Water Based Resin | twine |
| LC-005 | Lacing Twine Prime & TP | twine |
| LC-006 | Lacing Charge | charge |

§5.3 of the simulation doc gives LC-001 at 100 KGS → 250.00, so the seeded twine rate is 2.50/kg. LC-006 is a flat amount entered per line.

### 5.5 Item Selection option lists

`specOptions.ts` already holds Material, Net Type, Knots, Selvages, Stretching, Reinforcement, Others, Color and weight units. Two lists are missing and get added:

- **Category** — NET, SPORTS NET, TWINE (§3.3)
- **Quantity UOM** — PCS, KGS

## 6. Computation

### 6.1 Rule chain (§4.1, §7)

Running total `P` starts at `givenPriceKg`. Applied rules execute in `sequence` order, each feeding the next:

| Basis | Operation | Formula |
|---|---|---|
| `percent_of_result` | add | `P / (1 − r/100)` |
| `percent_of_result` | subtract | `P × (1 − r/100)` |
| `percent_of_base` | add | `P × (1 + r/100)` |
| `percent_of_base` | subtract | `P / (1 + r/100)` |
| `flat_amount` | add / subtract | `P ± r` |
| `lookup_table`, `valueKind: "amount"` | add / subtract | `P ± lookup(key)` |
| `lookup_table`, `valueKind: "percent"` | add | `P × (1 + lookup(key)/100)` |
| `lookup_table`, `valueKind: "percent"` | subtract | `P / (1 + lookup(key)/100)` |

Lookup keys resolve per specification row: `lt_md` from the leading `NNNmd` figure, `lt_dw` from the `NNNfl` figure, `lt_ins` from net-vs-twine category.

`New Price/KG = Given Price + Σ Additional Values`.

### 6.2 Price per piece (§4.2)

```
Base Price/Piece = New Price/KG × Weight/PC
Labor            = laborHours × laborRate
Wastage          = wastageKg × New Price/KG
Sewing Twine     = twineKg × twineRate
U/P              = Base + Labor + Wastage + Sewing
```

### 6.2.1 Defaults, and why U/P is always derived

A specification row is created with `givenPriceKg: 0`, `qtyPcs: 1`, an empty applied-rule set, and zero labor, wastage and sewing. The spec master carries no price, so Given Price is always typed by the user — matching the screenshot, where a freshly added row reads `GIVEN 0.00`.

U/P is **never** gated on opening the pricing modal. It is recomputed on every edit as `newPriceKg × weightPerPc + labor + wastage + sewing`, where `newPriceKg` collapses to `givenPriceKg` when no rules are applied. §5.1 row 1 of the simulation doc is the governing case: base Given Price 5.0000, no operation applied, `U/P = 2,475.00 = 5.0000 × 495`. A row showing `0.00` does so only because Given Price is still 0.

`pricing` is therefore always a populated snapshot, not an optional one. The Specification Pricing modal edits its inputs; it does not bring it into existence. The `Add Pricing` versus read-out distinction in §6.4 is purely a display test for whether anything has been changed from the defaults.

### 6.3 Roll-ups (§4.3) — `src/lib/totals.ts`

```
SpecLine    weight = weightPerPc × qty        amount = U/P × qty
BatchItem   Σ spec amounts
Batch       Σ item amounts   |  LACING: Σ entry amounts  |  NOTE: contributes nothing
TOTAL WEIGHT = Σ spec weights + Σ lacing twine KGS      (a flat charge adds 0)
GRAND TOTAL  = Σ batch totals
```

`totals.ts` is pure and holds the single implementation. It replaces three drifting `reduce` expressions in `NewQuotation`, `QuotationDetail` and `PIDocumentPreview` — the first of which currently ignores `discount` and `tax`.

### 6.4 Rule presentation

**On the specification row.** The PRICING cell shows `Add Pricing` when nothing is applied. Once priced it shows a compact read-out — `COMM +3% · MD +3.50 → 12.43/kg` — with an Edit affordance. Applied rules are therefore visible without opening anything, which is the "easy to notice" requirement.

**In the Specification Pricing modal, stage 1.** A table, one row per available rule:

| | Code | Label | Rate | Running total |
|---|---|---|---|---|
| ☐ | COMMISSION | Commission | **+3%** | 11.60 → 11.96 |
| ☐ | PERCENTAGE | Markup | **+5%** | — |
| ☐ | MD_COMPUTATION | Mesh Depth adjustment | **+3.50** | — |
| ☐ | INSURANCE | Insurance | **+0.66%** | — |

Rates are signed by operation, resolved for this specific row (lookup rules included), and the running total column shows `before → after` for each applied step. Footer: `New Price/KG = Given + Σ Additional Values`. **Every checkbox is unticked when the modal opens.**

**Stage 2**, behind `Proceed to Price / Piece`: labor hours, labor rate, wastage kg, sewing twine kg, with the U/P breakdown beneath. Closing applies the result to the row.

## 7. UI

### 7.1 Components

| Component | Role |
|---|---|
| `BatchSelectionModal` | Four buttons; one batch type per click; appends one batch |
| `ItemSelectionModal` | Cascading searchable combo­boxes; Confirm composes the spec string and creates a `BatchItem` |
| `SpecificationPickerModal` | Searchable, filterable, paginated, multi-select; pre-filtered by the item's Material + Net Type; includes Create New Specs |
| `SpecificationPricingModal` | Two-stage pricing per §6.4 |
| `LacingSelectionModal` | Searchable, paginated, multi-select over `LACING_CATALOG` |
| `DataTableModal` | Shared primitive: search box + filter dropdowns + pagination + multi-select |
| `BatchEditor` + per-type subcomponents | Renders one batch; keeps `NewQuotation` small |

`DataTableModal` backs both the Specification picker and the Lacing picker, so every list behaves identically. That is the "search/filter on all lists" requirement, implemented once.

### 7.2 Styling

The existing paper/pine palette, `Card`, `Modal`, `Table` and `SearchableSelect` primitives. The structure follows the reference app; the visual language stays consistent with the rest of this ERP.

### 7.3 Add Specification filtering

The picker is pre-filtered to rows whose `material` and `netType` match the parent item's Item Selection. Additional filter dropdowns for Mesh Size, Mesh Depth and Length narrow further, and a free-text search matches code and description.

## 8. Persistence

The store gains a localStorage layer covering quotations (including `batches`), the spec master, the lacing catalog, pricing rules and lookup tables. Seeded mock data loads on first run, and whenever storage is empty or fails to parse. Settings gains a **Reset Demo Data** button.

Rationale: a stray refresh mid-demo must not destroy a quotation that took several minutes to assemble.

## 9. PDF export

`PIDocumentPreview` keeps its current letter layout. Within it:

- ASSEMBLED titles render as banner rows above their lines
- the item's composed specification sentence renders as a banner row above its specification lines
- each priced line is exactly **one non-wrapping row**; the existing `descFontClass` font step-down holds long text on one line
- LACING entries group under their own banner
- NOTE text renders as a full-width row carrying no amounts
- the footer keeps `Total Weight` and `Grand Total`

## 10. Removals

Scoped to the pricing chain and the quotation authoring screen:

- the auto-apply behaviour in `defaultsFor()`
- the flat "Line Items" card and its inline pill row
- `SpecBuilderModal` and the per-line wand-icon override, superseded by `ItemSelectionModal`
- the stale `P0 = 100` worked example in the `pricing.ts` header, replaced with the doc's verified `P0 = 5.00` vectors
- resolved bullets in the New Quotation process-discovery note

No rule types are removed. No pages are removed.

## 11. Open question — scoping document

`Export Sales ERP Project Scoping WITH ANSWER.docx` has not been read. Word files are binary, and this session's Linux shell fails on every invocation with `UNC paths are not supported`, so it cannot be unzipped either. Kenneth is converting it to `.md`/`.txt` into the project folder.

**This spec is provisional until that document is read.** If it contradicts anything above, this spec is revised before implementation begins.

## 12. Testing

Vitest, added as a devDependency with `"test": "vitest run"`.

**`pricing.test.ts`**
- all ten §5.2 unit vectors at base 5.0000 — commission 3%, compounded 3%+5%, percentage 5%, amount 0.10, subtract-percentage 5%, MD, DW, insurance 0.66%
- both §4.2 price/piece cases: `5.175 × 495 = 2,561.6250`, and with extras `2,577.3875`
- insurance resolves as a percent, not an amount (regression guard for §4.1)
- round-at-the-end: `2561.625 × 10 = 25,616.25`
- rules default off: a line with an empty applied set returns `newPriceKg === givenPriceKg`
- §5.1 row 1 base case: Given 5.0000, no rules, no extras → `U/P 2,475.00`, `AMOUNT 24,750.00` at qty 10, `WEIGHT 4,950.00` (guards §6.2.1 — U/P must not be gated on opening the pricing modal)

Test vectors use synthetic rules and lookup tables mirroring the doc, so the formulas are under test rather than the seed data. One separate assertion pins `lt_ins.valueKind === "percent"` in the shipped seed.

**`totals.test.ts`**
- NOTE batches contribute to neither total
- lacing twine adds weight; a flat lacing charge does not
- §6 end-to-end: `TOTAL WEIGHT 5,050.00 KGS`, `GRAND TOTAL $25,916.25`

**`batches.test.ts`**
- `flattenBatches` preserves batch and item order
- every emitted line carries correct `batchId` / `itemId`
- per-batch totals match the flattened projection

**Constraint:** the shell is unavailable for this entire session, so the suite cannot be run here. The loop is: code and tests written, Kenneth runs `npm install && npm test`, failures pasted back, fixes applied.
