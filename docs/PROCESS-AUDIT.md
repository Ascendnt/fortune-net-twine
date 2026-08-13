# Process conformance audit

**Date:** 2026-08-05
**Method:** Static audit, with the implementation read back against `FORTUNE_NET_TWINE_System_Simulation.md`
section by section, with every test expectation recomputed by hand.

**This is not a test run.** The sandbox shell has been unavailable for the whole session (every
command fails with `UNC paths are not supported: \\wsl.localhost\...`), so `npm test`, `npm run
build` and `npm run lint` have not been executed. Anything below marked ✅ is verified by reading
code and doing the arithmetic, not by running it.

## §2: Process flow

| Doc step | Status | Notes |
|---|---|---|
| 1. Quotation header | ✅ | Customer, Consignee, Attn, Currency, Payment, **Shipment**, **Dear Sirs**, Validity, MOQ, Remarks. Shipment and Dear Sirs were missing and have been added; Shipment offers the client master's standard phrasings. Messrs/Address come from the customer record, which the doc says is selection-driven (§8). |
| 2. Generate Batch Item → 4 types | ✅ | One type per click, appends one group. |
| 3. Add Item → Item Selection → Confirm | ✅ | 11 cascading fields, composes the spec sentence. |
| 3. Add Specification → picker | ✅ | Multi-select, filtered to the item's Material + Net Type. |
| 3. Given Price + QTY on the sub-line | ✅ | The specification row is the priced row. |
| 3. Add Pricing → Proceed to Price / Piece | ✅ | Two-stage modal, all rules off on open. |
| 3. LACING → Add Lacing → LC-001…LC-006 | ✅ | Twine bills KGS × rate; LC-006 is a flat charge. |
| 3. NOTE → free text only | ⛔ dropped by decision | The quotation header's Remarks field already prints narrative text on the PI, so a NOTE group was a second mechanism for one job. Removed at Kenneth's request. Totals are unaffected: NOTE contributed to neither figure. |
| 4. Totals roll up | ✅ | Batch total, total weight, grand total. |
| 5. Export as PDF | ✅ | Customer letter, grouped by batch. |

## §3: Modal inventory

| Doc | Status | Notes |
|---|---|---|
| 3.2 Batch Selection | ✅ | ASSEMBLED / NORMAL / LACING. NOTE dropped by decision, see above. |
| 3.3 Item Selection | ✅ | Category, Material, Net Type, Knots, Selvages, Stretching, Reinforcement, Others, Color, Weight UOM, Quantity UOM. |
| 3.3 "Material dynamically populates Net Type" | ⚠️ inferred | Now cascades, but derived from the specification master rather than a real dependency table, so a material offers only net types that have codes on file. Guarantees Add Specification never opens empty. |
| 3.4 Item Specification | ✅ | CODE, DESCRIPTION, TWINE, MESH SIZE, MESH DEPTH, LENGTH, WEIGHT/PC, search, Create New Specs, pagination. |
| 3.5 Specification Pricing | ✅ | Rules are data, not the fixed DST-001…016 list. All eight types map to documented operations. |
| 3.6 Price / Piece | ✅ | Labor, wastage, sewing twine. |
| 3.7 Lacing Selection | ✅ | Six codes, searchable. |
| 3.8 Export as PDF | ✅ | |

## §4 / §7: Formulas

Every vector recomputed by hand against the code path in `pricing.ts`:

| Operation | Expected (doc) | Computed | |
|---|---|---|---|
| Add commission 3% | 5.1546 | 5 ÷ 0.97 = 5.1546392 | ✅ |
| Add commission 3% then 5% | 5.4259 | ÷ 0.95 = 5.4259360 | ✅ |
| Add percentage 5% | 5.2500 | 5 × 1.05 | ✅ |
| Add amount 0.10 | 5.1000 | 5 + 0.1 | ✅ |
| Subtract percentage 5% | 4.7619 | 5 ÷ 1.05 = 4.7619048 | ✅ |
| Add MD (122MD) | 5.1750 | 5 + 0.175 | ✅ |
| Add DW (50FL) | 5.5000 | 5 + 0.5 | ✅ |
| Add insurance 0.66% | 5.0330 | 5 × 1.0066 | ✅ |
| Price/piece | 2,561.6250 | 5.175 × 495 | ✅ |
| Price/piece + extras | 2,577.3875 | + 6 + 7.7625 + 2 | ✅ |
| Amount at qty 10 | 25,616.25 | 2561.625 × 10, unrounded U/P | ✅ |
| §6 end-to-end | 5,050.00 KGS / $25,916.25 | 4950 + 100 / 25616.25 + 300 | ✅ |

Two test expectations were **wrong** and have been corrected:

1. `toBeCloseTo(5.1886, 4)` for commission-then-insurance. The true value is 5.1886598, which is
   0.00006 from 5.1886, outside the 0.00005 tolerance `toBeCloseTo(_, 4)` uses. It would have
   failed. Now 5.1887.
2. `formatRuleRate` asserted `"+0.18"` for the 0.175 mesh-depth rate. As a double, 0.175 sits just
   *below* its decimal value, so `(0.175).toFixed(2)` is `"0.17"`. The assertion now uses the
   depth-way rate of 0.5, which renders unambiguously.

## Defects found and fixed during this work

1. **Insurance applied as a flat 0.66 instead of 0.66%.** `lt_ins` was a `lookup_table` whose value
   was added as currency. `LookupTable.valueKind` now distinguishes amount from percent.
2. **All pricing rules auto-applied to every new line.** Enabled was conflated with applied.
3. **Rates invisible on the rule pills.**
4. **Seeded MD/DW rates contradicted the doc**. 3.50 and 10.00 against the observed 0.1750 and
   0.5000, roughly 20× too large, with a comment falsely claiming they came from the doc.
5. **`getLookupValue` fell back to `rows[0]`**, so an unlisted float length silently borrowed
   another bucket's rate. Now falls back to the explicit `default` row.
6. **PDF item numbering skipped** (3, 4, then 8, 9, 10). A mutable counter shared across child
   components, corrupted by StrictMode's double render. The document is now built as pure data with
   numbering assigned before render.
7. **Specification banner titles truncated.** Now wrap to two lines with a size step-down.

## Not verified

- `npm test`, `npm run build`, `npm run lint`: shell unavailable all session.
- Runtime behaviour of any screen. All UI review was by reading code.
- `Export Sales ERP Project Scoping WITH ANSWER.docx`: still unread. It's a binary Office file; the
  file tools reject binaries and there's no shell to unzip it. Nothing from it is reflected anywhere
  in this build.

## Outstanding

- Delete `src/components/domain/SpecBuilderModal.tsx`: orphaned, no tool available to remove files.
- Specification codes beyond N-1595…N-1603 are extrapolated, not real.
- MD/DW intermediate buckets are interpolated from the doc's two observed anchors.
- Lacing rates default to 2.50/kg from the LC-001 sample.
