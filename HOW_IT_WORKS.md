# Fortune Net & Twine Export Sales ERP (Prototype)

A single-page web app that demonstrates the **Quotation → Sales Order → Payment → Commercial Invoice** flow for Fortune Net & Twine, a manufacturer/exporter of fishing nets and twine. It is a **frontend-only prototype**: there is no backend or database. All data starts from seeded demo fixtures held in memory, and the slices a user can meaningfully change are saved to the browser's `localStorage` so a refresh mid-demo doesn't lose work.

The package name is `fortune-net-twine-erp` and the sidebar labels it "Export Sales ERP · Prototype."

## Tech stack

The app is built with **React 19 + TypeScript**, bundled by **Vite 8**, and styled with **Tailwind CSS v4** (via the `@tailwindcss/vite` plugin). Routing is handled client-side by **react-router-dom v7**. Charts use **recharts**, icons use **lucide-react**, and PDF export (of the PI/CI documents) uses **html2pdf.js**. Linting is via **oxlint** and unit tests via **vitest**. The `@` import alias maps to `src/` (configured in `vite.config.ts` and the tsconfig files).

Scripts in `package.json`: `dev` (Vite dev server), `build` (`tsc -b && vite build`), `lint` (oxlint), `preview`, `test` (vitest run) and `test:watch`. There is a `vercel.json`, so it's set up to deploy on Vercel.

## How to run it

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm test         # run the vitest unit tests
```

## Big picture: how the pieces fit

```
main.tsx
  └─ StoreProvider   (src/lib/store.tsx, the single source of truth)
       └─ App.tsx    (BrowserRouter + all routes)
            └─ AppShell  (Sidebar + Topbar + <Outlet/> + toast stack)
                 └─ the page for the current route
```

`src/main.tsx` mounts React and wraps the whole app in `StoreProvider`, so every page can read and mutate shared state through the `useStore()` hook. `App.tsx` defines the routes; each route renders inside `AppShell`, which provides the persistent sidebar navigation, the top bar, and a floating toast/notification stack.

### State management (`src/lib/store.tsx`)

There is **no Redux or external state library**. The entire application state lives in one React Context provider, `StoreProvider`. It holds the data slices (quotations, sales orders, payments, invoices, approvals, activity log, pricing rules, lookup tables, the specification master, the lacing catalog and customers) plus the current user *role*, and exposes action functions that mutate them. Components call `useStore()` to read state and invoke actions.

Persistence is deliberately partial (`src/lib/persist.ts`): only the slices a user edits are written to `localStorage`, meaning quotations, pricing rules, lookup tables, the spec master, the lacing catalog and customers, under versioned keys (prefix `fnt.v1.`). Everything else stays as seeded fixtures each load. Reads degrade safely: unreadable or suspiciously-empty values fall back to the seed data instead of throwing or showing a blank app. Bumping the `PREFIX` invalidates old data when a slice's shape changes. **Settings → Reset demo data** wipes persisted state and restores all seeds via `resetDemoData()`.

### Role switching

There is no real authentication. The top bar has a "Preview interface as…" menu (`src/components/layout/Topbar.tsx`) that switches the active *role* between sales rep, sales manager, factory technical, finance, logistics, management and admin. The role drives which user name is attributed to activity-log entries and tailors the dashboard/work queue. It is a demo device for showing the app from each department's perspective, not a permission system.

## The seed data

All demo content is defined in `src/lib/mockData.ts` (customers, quotations, sales orders, payments, invoices, approvals, activity, pricing rules, lookup tables) and `src/lib/specMaster.ts` (the specification catalog and lacing catalog). Domain types are centralized in `src/lib/types.ts`. Because everything is seeded, the app looks fully populated on first load, and new records created during a session slot in alongside the fixtures.

## The core workflow

The prototype implements the **Sales module** end to end. Everything downstream of a quotation flows from actions defined in the store.

### 1. Quotation / Proforma Invoice (PI)

Created through the multi-step builder at `/quotations/new` (`NewQuotation.tsx`). You pick a customer, which pre-fills currency, payment terms, consignee and the "Attn:" contact from that customer's master data, all still editable per quotation. You then author the line items as a **batch tree** and set commercial terms (deposit %, lead time, validity, freight, remarks).

The **batch tree** is the distinctive modeling choice (`src/lib/batches.ts` and the types in `types.ts`):

```
batch  (ASSEMBLED | NORMAL | LACING | NOTE)
  └─ item     a composed specification string, chosen in the Item Selection modal
       └─ spec  an N-code from the specification master; THIS is the priced row
```

- **ASSEMBLED / NORMAL** batches hold items, each item holding one or more priced specification rows.
- **LACING** batches hold twine lines (billed KGS × rate) or flat charges.
- **NOTE** batches are text only, so they contribute nothing to totals or weight.

You edit the tree, but **nothing downstream understands batches**. On save, `flattenBatches()` projects the tree into a flat `QuotationLineItem[]` (`items`), preserving order and stamping each line with its `batchId`/`itemId` provenance. Sales orders, invoices, reports and the PI document all read that flat list; the PI preview can regroup by `batchId` to redisplay the batches without duplicating the tree.

A quotation moves through statuses: `draft → for_approval → approved → sent → under_negotiation → accepted / rejected / expired / revised`. Creating a revision bumps the revision number, appends to the revision history, and flips status to `revised`. These are driven by `createQuotation`, `updateQuotationStatus` and `createRevision` in the store.

### 2. The pricing rule engine (`src/lib/pricing.ts`)

Line prices aren't hardcoded. They're built by a **data-driven rule chain**. Each `PricingRule` is a plain record with an explicit `operation` (add/subtract), a `basis` (`percent_of_base`, `percent_of_result`, `flat_amount`, or `lookup_table`), a rate, and a `sequence`. `computeLinePricing()` starts from the item's **Given Price per kg**, applies each enabled, selected rule in sequence order (each rule's output feeds the next), and produces the New Price/kg.

The key distinctions the engine encodes (verified against the client's system-simulation doc):
- **Commission** and **subtract-percentage** use division-based (margin-inclusive) math, so adding 3% commission is `p / (1 − 0.03)`.
- **Add-percentage** uses simple math: `p × (1 + rate)`.
- **Lookup tables** (MD, DW, Insurance) can hold either currency *amounts* added to the running price or a *percentage* of it, governed by `LookupTable.valueKind`. Lookup keys are derived automatically from an item's mesh depth, float length or code (net vs. twine), not typed by hand.

From New Price/kg the engine derives price-per-piece (× weight/pc), then adds labor, wastage and sewing-twine costs to get the all-in **U/P** (unit price). Line **Amount** = U/P × qty, computed from the unrounded unit price. A full pricing snapshot (`LinePricing`, holding the rule chain, inputs and cost breakdown) is stored on each line so margin can be reviewed later and the customer-facing PI/CI never has to show it.

### 3. Roll-up totals (`src/lib/totals.ts`)

A single set of functions computes line, batch and grand totals so the quotation builder, the detail page and the PI document preview can never drift apart. `recomputeSpecLine()` re-prices a line on every edit; `quotationTotals()` sums batch totals (NORMAL + ASSEMBLED + LACING; NOTE excluded) and adds freight − discount + tax. `totalsFromItems()` / `totalsForQuotation()` handle older seed quotations that predate the batch model by working off the flat line list.

### 4. Convert to Sales Order

When a quotation is accepted, `convertToSalesOrder()` creates a `SalesOrder`, marks the quotation `accepted`, and links the two. The order is seeded with the full stage ladder and **two payment records are auto-generated**: a *deposit* (order value × deposit %) and a *balance*.

The sales-order lifecycle is an 11-stage ladder (`ORDER_STAGES` in `types.ts`), each stage owned by a department:

```
quotation → customer_confirmation → internal_verification → deposit →
production → packing → inspection → shipment → final_payment → documents → completed
```

`advanceStage()` moves an order to the next stage, marking the current one complete and the next in-progress, logging the change and toasting who now owns it. It enforces **business-rule guardrails**: you cannot pass the *deposit* stage until Finance has *verified* the deposit payment, and you cannot pass *shipment* (container loading) until the remaining *balance* is verified. This payment-gated loading control is the shipment feature the prototype demonstrates in lieu of a full shipments module.

### 5. Payments (`/payments`)

Payment records track deposit, balance and adjustment amounts through statuses (`expected`, `submitted_for_verification`, `partially_paid`, `verified`, `rejected`, `overdue`). Finance uses `verifyPayment()` / `rejectPayment()`. Verification is what unblocks the order-stage guardrails above.

### 6. Commercial Invoice (CI)

`generateInvoice()` snapshots the quotation's line items into a `CommercialInvoice` and **recalculates amounts on actual shipped quantity** (which can differ from the quoted qty on a partial shipment). Unit price stays frozen from the quotation; only quantity and the derived totals move. The invoice is viewable at `/invoices/:id` and can be exported to PDF.

## Routes and pages

Routing is defined in `App.tsx`. Live pages:

- `/`: **Dashboard** (`pages/Dashboard.tsx`): role-aware overview and work queue.
- `/quotations`, `/quotations/new`, `/quotations/:id`: quotation list, the builder, and detail (with PI document preview + PDF export).
- `/orders`, `/orders/:id`: sales order list and the lifecycle detail with the stage stepper.
- `/payments`: the finance payments page.
- `/invoices/:id`: commercial invoice detail (with CI document preview + PDF export).
- `/customers`: customer master; contacts are editable here and reflected app-wide.
- `/documents`: document center (PI, CI, POs, packing lists, remittances, etc.).
- `/approvals`: approvals inbox (PI approval, discount approval, payment clearance, loading authorization…).
- `/activity`: the activity log; nearly every store action writes an entry here.
- `/reports`: recharts-based reporting.
- `/settings`: pricing rules, lookup tables, and "Reset demo data."

**Placeholder (locked) routes**, rendered by `PhasePlaceholder` and marked with a lock icon in the sidebar, represent modules scoped for later phases: `/inquiries`, `/technical`, `/production`, `/packing`, `/shipments`. Any unknown path falls back to the Dashboard.

## Project structure

```
src/
  main.tsx, App.tsx            entry point + routes
  index.css                    Tailwind + theme tokens
  assets/                      logo, etc.
  components/
    layout/     AppShell, Sidebar, Topbar
    ui/         Button, Card, Table, Modal, Tabs, Badge, PageHeader,
                SearchableSelect, DataTableModal, Feedback (toasts)
    domain/     LifecycleStepper, SpecBuilderModal, ItemSelectionModal,
                SpecificationPickerModal, LacingSelectionModal,
                SpecificationPricingModal, BatchSelectionModal,
                PIDocumentPreview, InvoiceDocumentPreview, ProcessDiscoveryNote
  lib/
    store.tsx        the Context store (state + all actions)
    types.ts         all domain types
    mockData.ts      seed fixtures
    specMaster.ts    specification + lacing catalogs
    persist.ts       localStorage persistence
    pricing.ts       the pricing rule engine  (+ pricing.test.ts)
    totals.ts        roll-up arithmetic        (+ totals.test.ts)
    batches.ts       batch tree factories + flattenBatches  (+ batches.test.ts)
    format.ts        money/number/date formatting helpers
    statusMeta.ts    status → label/color mappings
    specOptions.ts   spec dropdown option sources
    pdf.ts           html2pdf export helper
  pages/             one folder per module (see routes above)
```

## Testing

Unit tests (vitest) cover the parts where correctness matters most: the pricing engine (`pricing.test.ts`), the roll-up totals (`totals.test.ts`) and the batch flattening (`batches.test.ts`). These lock in the arithmetic against the client's documented system-simulation figures.

## Things worth knowing

- **No backend.** Every "save" is in-memory plus selective `localStorage`. Refreshing keeps your edited quotations/pricing/customers; the rest reset to seeds. Nothing talks to a server.
- **Batches are an authoring convenience.** They exist only in the quotation builder and PI preview; everything else reads the flattened line list.
- **Pricing is data, not code.** New adjustment types or corrected rates are configured in Settings (pricing rules / lookup tables), not by editing source.
- **The guardrails are the point.** The deposit-before-production and balance-before-loading checks are the core process controls the prototype is meant to showcase.
