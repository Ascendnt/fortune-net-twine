# Quotation Batch Model & Pricing Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat quotation line-item model with the documented batch → item → specification tree, correct three pricing-engine defects, and give every pickable list search/filter/pagination — frontend only.

**Architecture:** `Quotation.batches[]` becomes the authoring tree; `Quotation.items[]` becomes a flat projection derived by `flattenBatches()` on save, so every existing downstream consumer keeps working unchanged. Pure computation lives in `src/lib/` (`pricing.ts`, `totals.ts`, `batches.ts`) and is unit-tested; React components stay presentational.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind 4, react-router 7, Vitest (added by Task 1), html2pdf.js.

**Spec:** `docs/superpowers/specs/2026-08-05-quotation-batch-model-design.md`

## Global Constraints

- Frontend only. No backend, API, or database calls anywhere.
- Path alias `@/` maps to `src/`. Use it in all imports.
- Existing design language only: `Card`, `Modal`, `Table`, `Button`, `SearchableSelect`, and the `paper-*` / `pine-*` / `manifest-*` / `alert-*` Tailwind palette.
- Money rounds to 2dp **at display time only**. `AMOUNT = U/P × QTY` computes from the unrounded U/P. Verified: `2561.625 × 10 = 25,616.25`.
- Rule rates: percentages are stored as whole numbers (`3` means 3%).
- **No shell is available in the authoring session.** Every `Run:` step is executed by Kenneth, who pastes failures back.
- Do not modify Orders, Payments, Invoices, Approvals, Reports, Documents, or Activity pages.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/specMaster.ts` | `SpecMasterRow`, `SPEC_MASTER` (~50 rows), `LacingCatalogRow`, `LACING_CATALOG`, `specRowLabel()` |
| `src/lib/batches.ts` | Batch tree types, factories, `flattenBatches()` |
| `src/lib/totals.ts` | `specLineTotals`, `batchTotal`, `quotationTotals` |
| `src/lib/persist.ts` | Versioned localStorage load/save with safe fallback |
| `src/components/ui/DataTableModal.tsx` | Shared search + filter dropdowns + pagination + multi-select table modal |
| `src/components/domain/BatchSelectionModal.tsx` | Four-type picker |
| `src/components/domain/ItemSelectionModal.tsx` | Cascading spec composer (replaces `SpecBuilderModal`) |
| `src/components/domain/SpecificationPickerModal.tsx` | N-code picker, filtered by parent item |
| `src/components/domain/LacingSelectionModal.tsx` | LC-code picker |
| `src/components/domain/SpecificationPricingModal.tsx` | Two-stage pricing |
| `src/pages/quotations/BatchEditor.tsx` | Renders one batch of any type |
| `src/lib/pricing.test.ts` · `totals.test.ts` · `batches.test.ts` | Unit tests |
| `vitest.config.ts` | Test runner config with `@/` alias |

**Modify:** `types.ts`, `pricing.ts`, `mockData.ts`, `specOptions.ts`, `store.tsx`, `NewQuotation.tsx`, `PIDocumentPreview.tsx`, `SettingsPage.tsx`, `package.json`

**Delete:** `src/components/domain/SpecBuilderModal.tsx`

---

## Task 1: Vitest harness + Insurance percentage fix

**Files:**
- Modify: `package.json`, `src/lib/types.ts`, `src/lib/pricing.ts`, `src/lib/mockData.ts`
- Create: `vitest.config.ts`, `src/lib/pricing.test.ts`

**Interfaces:**
- Produces: `LookupTable.valueKind: "amount" | "percent"`; `computeLinePricing()` unchanged in signature.

- [ ] **Step 1: Add Vitest**

`package.json` — add `"test": "vitest run"` and `"test:watch": "vitest"` to scripts, and `"vitest": "^3.2.4"` to devDependencies.

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: Write the failing tests**

`src/lib/pricing.test.ts` covers the doc's §5.2 vectors at base 5.0000 with weight/pc 495, using synthetic rules so the formulas are under test rather than seed data:

```ts
const rules: PricingRule[] = [
  { id: "comm3", code: "COMMISSION", label: "Commission 3%", operation: "add", basis: "percent_of_result", rate: 3, sequence: 1, enabled: true },
  { id: "comm5", code: "COMMISSION", label: "Commission 5%", operation: "add", basis: "percent_of_result", rate: 5, sequence: 2, enabled: true },
  { id: "pct5",  code: "PERCENTAGE", label: "Markup 5%",     operation: "add", basis: "percent_of_base",   rate: 5, sequence: 3, enabled: true },
  { id: "amt",   code: "AMOUNT",     label: "Amount 0.10",   operation: "add", basis: "flat_amount",       rate: 0.1, sequence: 4, enabled: true },
  { id: "sub5",  code: "PERCENTAGE", label: "Less 5%", operation: "subtract", basis: "percent_of_base",    rate: 5, sequence: 5, enabled: true },
  { id: "md",    code: "MD_COMPUTATION", label: "MD", operation: "add", basis: "lookup_table", rate: 0, lookupTableId: "t_md", sequence: 6, enabled: true },
  { id: "dw",    code: "DW_COMPUTATION", label: "DW", operation: "add", basis: "lookup_table", rate: 0, lookupTableId: "t_dw", sequence: 7, enabled: true },
  { id: "ins",   code: "INSURANCE", label: "Insurance", operation: "add", basis: "lookup_table", rate: 0, lookupTableId: "t_ins", sequence: 8, enabled: true },
];

const tables: LookupTable[] = [
  { id: "t_md",  name: "MD",  valueKind: "amount",  rows: [{ key: "122", value: 0.175 }] },
  { id: "t_dw",  name: "DW",  valueKind: "amount",  rows: [{ key: "50",  value: 0.5 }] },
  { id: "t_ins", name: "INS", valueKind: "percent", rows: [{ key: "net", value: 0.66 }] },
];
```

Assertions, each to 4dp: commission 3% → `5.1546`; compounded 3%+5% → `5.4259`; markup 5% → `5.2500`; amount → `5.1000`; subtract 5% → `4.7619`; MD → `5.1750`; DW → `5.5000`; **insurance → `5.0330`** (the regression guard — a flat add would give `5.66`).

Price/piece: `5.175 × 495 = 2561.6250`; with labor 2×3, wastage 1.5, sewing 0.5×4 → `2577.3875`.

Round-at-the-end: qty 10 → `totalPrice === 25616.25`.

Base case (§5.1 row 1): no rules applied → `newPriceKg === 5`, `unitPrice === 2475`, `totalPrice === 24750`, `weightKg === 4950`.

- [ ] **Step 3: Run to verify failure**

Run: `npm install && npm test`
Expected: FAIL — `valueKind` is not a property of `LookupTable`; insurance assertion returns `5.66`.

- [ ] **Step 4: Add `valueKind` to the type**

`src/lib/types.ts` — add to `LookupTable`:

```ts
/** How this table's row values are interpreted: currency amount, or percent of the running total. */
valueKind: "amount" | "percent";
```

- [ ] **Step 5: Teach the engine percent lookups**

`src/lib/pricing.ts` — `getLookupValue` gains a sibling returning the table so the kind is available, and the lookup branch splits:

```ts
const table = lookupTables.find((t) => t.id === rule.lookupTableId);
const isPercent = table?.valueKind === "percent";
if (rule.basis === "lookup_table" && isPercent) {
  p = rule.operation === "subtract" ? p / (1 + rateVal / 100) : p * (1 + rateVal / 100);
} else if (rule.basis === "lookup_table") {
  p = rule.operation === "subtract" ? p - rateVal : p + rateVal;
}
```

Replace the stale `P0 = 100` header comment with the doc's verified `P0 = 5.00` vectors.

- [ ] **Step 6: Set the seed kinds**

`src/lib/mockData.ts` — `lt_md` and `lt_dw` get `valueKind: "amount"`; `lt_ins` gets `valueKind: "percent"`.

- [ ] **Step 7: Run to verify pass**

Run: `npm test`
Expected: PASS

---

## Task 2: Specification master and lacing catalog

**Files:**
- Create: `src/lib/specMaster.ts`

**Interfaces:**
- Produces: `SpecMasterRow`, `SPEC_MASTER`, `LacingCatalogRow`, `LACING_CATALOG`, `specRowLabel(row): string`

- [ ] **Step 1: Define the types and seed data**

```ts
export interface SpecMasterRow {
  code: string; description: string; material: string; netType: string;
  twine: string; meshSize: string; meshDepth: string; length: string; weightPerPc: number;
}
export function specRowLabel(r: SpecMasterRow): string {
  return `${r.twine} ${r.meshSize} ${r.meshDepth} x ${r.length}`;
}
```

Seed N-1595 … N-1603 verbatim from the reference screenshots — all `NYLON BRAIDED NET`, twine `NO.120(210/22x16)`, mesh size `3-1/2"STR`, mesh depth `122MD`:

| Code | Length | Weight/PC |
|---|---|---|
| N-1595 | 50FL(1180ML) | 483.2 |
| N-1596 | 50FL | 495 |
| N-1597 | 60FL | 590 |
| N-1598 | 70FL | 689 |
| N-1599 | 70FL(1656ML) | 673.6 |
| N-1600 | 35FL | 344.5 |
| N-1601 | 50FL(1115ML) | 465 |
| N-1602 | 1180ML | 506 |
| N-1603 | 60FL(1414ML) | 579 |

Then extend to ~50 rows across the families already in `ITEM_MASTER`, keeping weight roughly proportional to length within each family:
- `NO.96(210/20x16) 3-1/2"STR 122MD` (N-1610…) — Nylon / Braided Net
- `NO.84(210/16x16) 3-1/2"STR 122MD` (N-1620…) — Nylon / Braided Net
- `NO.72(210/14x16) 3-1/2"STR 122MD` (N-1630…) — Nylon / Braided Net
- `NO.42(250/08x16) 8"STR 50MD` (H-1640…) — Hi-Ex / Braided Net
- `NO.96(250/20x16) 5"STR 15MD` (H-1650…) — Hi-Ex / Braided Net

`material` and `netType` must use the exact strings from `specOptions.ts` (`"Nylon"`, `"Hi-Ex"`, `"Braided Net"`) so the Task 8 filter matches.

- [ ] **Step 2: Lacing catalog**

```ts
export interface LacingCatalogRow {
  code: string; description: string; kind: "twine" | "charge"; defaultRate: number;
}
```

LC-001 Lacing Twine Nylon Tarred (twine, 2.50) · LC-002 Lacing Twine Nylon Water Based Resin (twine, 2.50) · LC-003 Lacing Twine Hi-ex Tarred (twine, 2.50) · LC-004 Lacing Twine Hi-ex Water Based Resin (twine, 2.50) · LC-005 Lacing Twine Prime & TP (twine, 2.50) · LC-006 Lacing Charge (charge, 0).

Rate 2.50 derives from doc §5.3: LC-001 at 100 KGS → 250.00.

- [ ] **Step 3: Commit**

```bash
git add src/lib/specMaster.ts && git commit -m "feat: add specification master and lacing catalog"
```

---

## Task 3: Batch tree types and flattening

**Files:**
- Create: `src/lib/batches.ts`, `src/lib/batches.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: `SpecMasterRow`, `specRowLabel` (Task 2); `LinePricing`, `QuotationLineItem` (types.ts)
- Produces: `BatchType`, `SpecLine`, `BatchItem`, `LacingLine`, `QuotationBatch`, `newBatch()`, `newSpecLine()`, `newLacingLine()`, `flattenBatches()`

- [ ] **Step 1: Write the failing test**

```ts
it("flattens spec lines and lacing, skips notes, tags ids", () => {
  const batches: QuotationBatch[] = [
    { id: "b1", type: "normal", items: [{ id: "i1", specification: "NYLON BRAIDED NET", selection: EMPTY_SPEC_SELECTION, weightUom: "KGS", qtyUom: "PCS",
      specs: [{ ...baseSpec, id: "s1", specCode: "N-1596", weightPerPc: 495, qtyPcs: 10, unitPrice: 2475, amount: 24750, weightKg: 4950 }] }] },
    { id: "b2", type: "lacing", lacing: [
      { id: "l1", code: "LC-001", description: "Lacing Twine Nylon Tarred", kind: "twine",  kgs: 100, rate: 2.5, amount: 250 },
      { id: "l2", code: "LC-006", description: "Lacing Charge",            kind: "charge", kgs: 0,   rate: 50,  amount: 50 }] },
    { id: "b3", type: "note", note: "Prices are FOB Manila." },
  ];
  const items = flattenBatches(batches);
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ batchId: "b1", itemId: "i1", itemCode: "N-1596", weightKg: 4950, totalPrice: 24750 });
  expect(items[1]).toMatchObject({ batchId: "b2", itemCode: "LC-001", weightKg: 100, totalPrice: 250 });
  expect(items[2]).toMatchObject({ batchId: "b2", itemCode: "LC-006", weightKg: 0,   totalPrice: 50 });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL, module not found.

- [ ] **Step 3: Implement**

Types exactly as spec §5.2. `flattenBatches` walks batches in order, emits one `QuotationLineItem` per `SpecLine` (`itemCode = specCode`, `unit = qtyUom`, `specification = parent item's specification`, `description = specRowLabel`-derived text stored on the line) and one per `LacingLine` (`unit = "KGS"`, `weightKg = kind === "twine" ? kgs : 0`, `qtyPcs = kind === "twine" ? kgs : 1`), skips `note` batches entirely.

Factories: `newBatch(type)` seeds `items: []` for normal/assembled, `lacing: []` for lacing, `note: ""` for note, and `title: ""` for assembled only. `newSpecLine(row)` seeds `givenPriceKg: 0`, `qtyPcs: 1`, empty `appliedRuleIds`, zero labor/wastage/twine — per spec §6.2.1.

`src/lib/types.ts` — add `batchId?: string` and `itemId?: string` to `QuotationLineItem`, and `batches?: QuotationBatch[]` to `Quotation`.

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS
- [ ] **Step 5: Commit**

---

## Task 4: Roll-up totals

**Files:**
- Create: `src/lib/totals.ts`, `src/lib/totals.test.ts`

**Interfaces:**
- Produces: `recomputeSpecLine(line, weightPerPc, rules, tables, lookupKey): SpecLine`, `batchTotal(batch): number`, `quotationTotals(batches, freight, discount, tax): { itemsTotal, totalWeightKg, grandTotal }`

- [ ] **Step 1: Write the failing test** — doc §6 end-to-end:

```ts
it("matches the doc's end-to-end roll-up", () => {
  const t = quotationTotals(endToEndBatches, 0, 0, 0);
  expect(t.totalWeightKg).toBeCloseTo(5050, 2);   // 4950 + 100 lacing twine
  expect(t.grandTotal).toBeCloseTo(25916.25, 2);  // 25616.25 + 300
});
it("excludes notes and flat lacing charges from weight", () => { /* … */ });
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL
- [ ] **Step 3: Implement** per spec §6.3. NOTE batches return 0 from `batchTotal` and contribute no weight; flat lacing charges contribute amount but zero weight.
- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit**

---

## Task 5: localStorage persistence and store wiring

**Files:**
- Create: `src/lib/persist.ts`
- Modify: `src/lib/store.tsx`

**Interfaces:**
- Produces: `loadPersisted<T>(key, fallback): T`, `persist<T>(key, value): void`, `clearPersisted(): void`; store gains `specMaster`, `lacingCatalog`, `addSpecMasterRow`, `resetDemoData`, and `createQuotation` accepting `batches`.

- [ ] **Step 1: Implement `persist.ts`**

Versioned key prefix `fnt.v1.`. `loadPersisted` wraps `JSON.parse` in try/catch and returns the fallback on any error or on `null`, so a corrupt or schema-changed value degrades to seed data rather than crashing.

- [ ] **Step 2: Wire the store**

Each `useState` seeded from `loadPersisted(key, SEED)`; a `useEffect` per slice writes back on change. Slices: `quotations`, `pricingRules`, `lookupTables`, `specMaster`, `lacingCatalog`. `resetDemoData()` calls `clearPersisted()` and resets every slice to its seed.

`createQuotation` accepts `batches` and stores both `batches` and `flattenBatches(batches)` as `items`.

- [ ] **Step 3: Verify** — `npm run build` type-checks clean.
- [ ] **Step 4: Commit**

---

## Task 6: Shared DataTableModal

**Files:**
- Create: `src/components/ui/DataTableModal.tsx`

**Interfaces:**
- Produces:

```ts
interface DataTableModalProps<T> {
  open: boolean; onClose: () => void; title: string; subtitle?: string;
  rows: T[]; rowKey: (row: T) => string;
  columns: { key: string; header: string; render: (row: T) => React.ReactNode; align?: "left" | "right" }[];
  searchText: (row: T) => string;
  filters?: { key: string; label: string; options: string[]; value: (row: T) => string }[];
  pageSize?: number;                       // default 10
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
}
```

- [ ] **Step 1: Implement** — search box filtering on `searchText`, one `<select>` per entry in `filters` (each with an "All" option), checkbox column, pagination footer (`« ‹ 1 2 3 › »`), and a footer showing `{n} selected`. Resets to page 1 whenever search or any filter changes. Uses the existing `Modal`, `Table`, `Button` primitives.
- [ ] **Step 2: Verify** — `npm run build` clean.
- [ ] **Step 3: Commit**

---

## Task 7: Item Selection modal

**Files:**
- Create: `src/components/domain/ItemSelectionModal.tsx`
- Modify: `src/lib/specOptions.ts`
- Delete: `src/components/domain/SpecBuilderModal.tsx`

- [ ] **Step 1: Extend the option lists**

```ts
export const SPEC_CATEGORIES = ["NET", "SPORTS NET", "TWINE"];
export const SPEC_QTY_UNITS = ["PCS", "KGS"];
```

Add `category` and `qtyUnit` to `SpecSelection` and `EMPTY_SPEC_SELECTION`.

- [ ] **Step 2: Implement the modal**

Eleven `SearchableSelect` fields in doc §3.3 order: Category, Material, Net Type, Knots, Selvages, Stretching, Reinforcement, Others, Color, Weight UOM, Quantity UOM. Confirm calls `onConfirm(selection, buildSpecString(selection))`. Only Material is required; Confirm is disabled until it is set.

- [ ] **Step 3: Verify** — `npm run build` clean; no remaining imports of `SpecBuilderModal`.
- [ ] **Step 4: Commit**

---

## Task 8: Specification picker modal

**Files:**
- Create: `src/components/domain/SpecificationPickerModal.tsx`

- [ ] **Step 1: Implement**

Wraps `DataTableModal` over `SPEC_MASTER`. Columns: CODE, DESCRIPTION, TWINE, MESH SIZE, MESH DEPTH, LENGTH, WEIGHT/PC. Pre-filters to rows where `material === selection.material && netType === selection.netType`. Filter dropdowns for Mesh Size, Mesh Depth, Length. Search matches code + description + twine.

A **Create New Specs** button in the header reveals an inline row of inputs; saving calls `addSpecMasterRow` and the new row appears immediately (and persists, via Task 5).

Confirm emits the selected `SpecMasterRow[]`; the caller maps them through `newSpecLine`.

- [ ] **Step 2: Verify** — `npm run build` clean.
- [ ] **Step 3: Commit**

---

## Task 9: Lacing selection modal

**Files:**
- Create: `src/components/domain/LacingSelectionModal.tsx`

- [ ] **Step 1: Implement** — `DataTableModal` over `LACING_CATALOG`, columns CODE + DESCRIPTION, search on both, multi-select, confirm emits `LacingCatalogRow[]`.
- [ ] **Step 2: Verify + commit**

---

## Task 10: Specification Pricing modal

**Files:**
- Create: `src/components/domain/SpecificationPricingModal.tsx`

**Interfaces:**
- Consumes: `computeLinePricing`, `getLookupValue` (Task 1); `SpecLine` (Task 3)
- Produces: `onApply(patch: Pick<SpecLine, "pricing">)`

- [ ] **Step 1: Implement stage 1**

Table of every enabled rule: checkbox · code · label · signed resolved rate · `before → after`.

Rate display, resolved for this row:

```ts
function rateLabel(rule: PricingRule, tables: LookupTable[], key: string): string {
  const sign = rule.operation === "subtract" ? "−" : "+";
  if (rule.basis === "flat_amount") return `${sign}${rule.rate.toFixed(2)}`;
  if (rule.basis !== "lookup_table") return `${sign}${rule.rate}%`;
  const table = tables.find((t) => t.id === rule.lookupTableId);
  const v = getLookupValue(tables, rule.lookupTableId, key);
  return table?.valueKind === "percent" ? `${sign}${v}%` : `${sign}${v.toFixed(2)}`;
}
```

**Local draft state initialises from the line's current `appliedRuleIds`, which for a new line is empty — every checkbox unticked.** Footer: `New Price/KG = Given + Σ Additional Values`.

- [ ] **Step 2: Implement stage 2**

`Proceed to Price / Piece` switches the body to labor hours, labor rate, wastage kg, sewing twine kg, with the live U/P breakdown (`Base · Labor · Wastage · Twine · U/P`) beneath and a `Back` button.

- [ ] **Step 3: Verify + commit**

---

## Task 11: Batch selection modal and batch editor

**Files:**
- Create: `src/components/domain/BatchSelectionModal.tsx`, `src/pages/quotations/BatchEditor.tsx`

- [ ] **Step 1: BatchSelectionModal** — four full-width buttons (ASSEMBLED, NORMAL, LACING, NOTE); clicking one calls `onPick(type)` and closes. One batch per click.

- [ ] **Step 2: BatchEditor**

Renders a single batch with a type banner header and a Delete control:

- **assembled** — editable title textarea, then the item list, then `Add Item`, then `ASSEMBLED TOTAL`
- **normal** — item list, `Add Item`, `TOTAL`
- **lacing** — entry rows (description · KGS input · rate/amount input · amount), `Add Lacing`, `LACING TOTAL`
- **note** — one textarea, no totals

Each item renders its composed specification with an edit affordance, its spec rows (CODE · description · WEIGHT/PC readonly · GIVEN input · QTY input · PRICING cell · U/P · AMOUNT · remove), and `+ Add Specification`.

The PRICING cell shows `Add Pricing` when the line is at defaults, otherwise the compact read-out `COMM +3% · MD +3.50 → 12.43/kg` with Edit — spec §6.4.

- [ ] **Step 3: Verify + commit**

---

## Task 12: Rebuild NewQuotation

**Files:**
- Modify: `src/pages/quotations/NewQuotation.tsx`

- [ ] **Step 1: Replace Step 2**

Delete the flat Line Items card, `DraftLine`, `defaultsFor`, `toggleRule`, `priceLine`, and the pill row. Step 2 becomes: a `BatchEditor` per batch, then a `Generate Batch Item` button, then the footer showing `TOTAL WEIGHT` and `GRAND TOTAL` from `quotationTotals`.

Keep Step 1 (Customer & Terms) and Step 3 (Remarks) as they are.

- [ ] **Step 2: Save** — `handleCreate` passes `batches` to `createQuotation`; validation requires a customer and at least one batch that produces a line.
- [ ] **Step 3: Prune** the process-discovery note of bullets this work resolves.
- [ ] **Step 4: Verify + commit**

---

## Task 13: Batch-aware PI document

**Files:**
- Modify: `src/components/domain/PIDocumentPreview.tsx`

- [ ] **Step 1: Implement**

When `q.batches` is present, render by batch: ASSEMBLED title as a banner row, each item's specification sentence as a banner row, each spec line as **one non-wrapping row**, LACING under its own banner, NOTE as a full-width row spanning all columns with no amounts. When `q.batches` is absent, keep today's `groupBySpecification` path unchanged so seeded quotations are unaffected.

Retain `descFontClass` so long text shrinks rather than wraps. Footer keeps Total Weight and Grand Total from `quotationTotals`.

- [ ] **Step 2: Verify** — build clean; open a seeded quotation and confirm its PDF is unchanged.
- [ ] **Step 3: Commit**

---

## Task 14: Settings — units and reset

**Files:**
- Modify: `src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1:** Lookup table cards show `%` or `USD` per `valueKind`; the Insurance card is labelled as a percentage so the 0.66 reads unambiguously.
- [ ] **Step 2:** Add a `Reset Demo Data` button calling `resetDemoData()`, with a confirm modal.
- [ ] **Step 3:** Refresh the process-discovery bullets.
- [ ] **Step 4: Verify + commit**

---

## Task 15: Final verification

- [ ] **Step 1:** `npm test` — all suites pass
- [ ] **Step 2:** `npm run build` — type-checks and builds clean
- [ ] **Step 3:** `npm run lint` — oxlint clean
- [ ] **Step 4:** Manual walkthrough — Generate Batch Item → ASSEMBLED → title → Add Item → Item Selection → Add Specification (multi-select 3) → Add Pricing (confirm all rules start unticked) → totals update → add NORMAL, LACING, NOTE batches → Save as Draft → Download PDF → refresh the browser and confirm the quotation survived.
- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage.** §4.1 → Task 1. §4.2 → Tasks 3, 10. §4.3 → Tasks 10, 11. §5.1–5.3 → Task 3. §5.4 → Task 2. §5.5 → Task 7. §6.1–6.2.1 → Tasks 1, 3, 10. §6.3 → Task 4. §6.4 → Tasks 10, 11. §7.1 → Tasks 6–11. §7.3 → Task 8. §8 → Task 5. §9 → Task 13. §10 → Tasks 7, 12, 14. §12 → Tasks 1, 3, 4, 15.

**Type consistency.** `SpecLine`/`BatchItem`/`LacingLine`/`QuotationBatch` are defined once in Task 3 and consumed unchanged in 4, 10, 11, 12, 13. `valueKind` is introduced in Task 1 and read in 10 and 14. `flattenBatches` is defined in Task 3 and called in Task 5.

**Known gap.** Spec §11 — the Export Sales ERP scoping document is still unread. Tasks 1–4 are pure computation pinned to the simulation doc and carry no risk from it. Tasks 11–14 are the ones most likely to need revision once it lands.
