# Fortune Net & Twine Export Sales ERP: Quotation-to-Invoice Prototype

An interactive, front-end-only prototype of the **Quotation → Sales Order → Payment →
Commercial Invoice** slice of the Export Sales and Order Management ERP described in the
project roadmap. Built to validate the workflow with Fortune Net & Twine Manufacturing
Corp. before any backend engineering begins. This is the **Phase 0** deliverable.

No backend, no database, no authentication. All data is realistic mock data held in memory;
refreshing the page resets it to the seeded state.

---

## Running locally

Requires Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`). Hot-reload is on by default.

To produce a static production build (also used for Vercel):

```bash
npm run build
npm run preview   # serve the built output locally to sanity-check
```

## Deploying to Vercel

This is a standard Vite + React static site, which Vercel auto-detects.

1. Push this folder to a GitHub/GitLab/Bitbucket repo (or use the Vercel CLI: `npx vercel`).
2. In Vercel, **Add New Project → Import** the repo.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. No environment variables are required for this prototype.

---

## What this prototype covers

The full system framework (see `Export-Sales-ERP-System-Framework.docx` and the client SOP)
describes 17 process stages across Sales, Production, Logistics, and Finance. This prototype
implements the **Sales + Documentation + Remittance/Payment** slice end to end, since that is
the highest-value loop to validate first: quoting, converting to a confirmed order, tracking
deposit/balance payments against configurable finance controls, and generating the Commercial
Invoice:

- **Dashboard**: pipeline overview, alerts, upcoming shipments, activity feed
- **Quotations / Proforma Invoices**: create, revise, approve, send, record customer
  response, convert to Sales Order. Document preview matches the client's actual PI format
  (PI #33007 was used as the reference layout).
- **Sales Orders**: the central workspace: an 11-stage lifecycle stepper (Quotation through
  Completed), tabs for Overview / Items / Payments / Documents / Activity History, contextual
  next-action prompts, and blocker banners.
- **Payments**: deposit and balance milestones per order, Finance verification actions, and
  three visible finance controls (Production Release / Container Loading / Final Document
  Release) that flip from Blocked to Allowed only once the relevant payment is verified,
  demonstrating the "nothing blocks container loading before payment is verified" rule from
  the SOP.
- **Commercial Invoice**: auto-generated from the accepted PI once an order reaches the
  Documents stage, with a printable preview.
- **Customers**, **Document Center** (with version/superseded tracking), **Approvals inbox**,
  **Activity Log** (full audit trail), and a **Reports** page (Aging of Accounts, Collection
  Report, Statement-of-Account generator stub), all pulled directly from the Framework
  document's reporting requirements.
- **Role switcher** (top right): previews the interface as Sales Rep, Sales Manager, Factory
  Technical, Finance, Logistics, Management, or Admin. It only changes what's visible; it is
  not real security.

**Production, Packing & Inspection, and Shipments** appear in the sidebar (locked icon) but
are placeholder pages. They're shown for navigation context because the client's full
process spec includes them, but they're sequenced for a later delivery horizon per the
roadmap.

## Design notes

- Palette, typography, and the net-mesh watermark motif are pulled directly from the Fortune
  Net & Twine brand mark and the actual product (fishing net + twine). Navy and red are brand
  colors, so navy doubles as the "approved/complete" status tone, same convention as before;
  teal/amber/red round out status per the client's spec (teal = in progress, navy = approved/
  complete, amber = pending, red = blocked).
- Typography: Public Sans for UI text, IBM Plex Mono for every reference number, PI/SO code,
  and monetary figure, a deliberate choice matching how real trade-documentation systems
  present data.
- "Process Discovery Notes" panels (dashed blue callouts) appear throughout, flagging
  business rules that are not yet confirmed with the client. These are drawn directly from
  the open questions the roadmap and spec call out.

## Assumptions made

- Deposit/balance split, approval thresholds, and MOQ defaults are illustrative. The real
  values are configurable per the Framework doc and need client confirmation.
- Customer acceptance of a PI is modeled as a manual "Record Customer Response" action; how
  this is actually captured today (email, signed PDF, verbal) is an open discovery question.
- The "Mark Step Complete" action on Sales Orders is a simplified stand-in for what will be
  several real actions/approvals per stage (e.g., Production has its own detailed screen in
  the full spec), which is sufficient for demonstrating the lifecycle and payment-gating logic, not a
  full production-planning tool.
- Currency is USD throughout for simplicity; multi-currency is a Framework requirement not
  yet modeled.

## Unresolved business-process questions

(Also surfaced inline via the Process Discovery Notes panels)

- Which steps are today done on paper, by email, or in a spreadsheet, and who signs each one?
- Is customer PI acceptance captured as a signed document, email, or verbal confirmation?
- What is the actual discount-approval threshold that requires Sales Manager sign-off?
- Should Production be notified automatically when a deposit clears, or is that still a manual
  handoff today?
- How long must superseded PI/Packing List versions be retained for audit purposes?

## Proposed future modules (Phase 1+ per the roadmap)

Customer Inquiries intake, Technical Assessment workspace, Production planning/scheduling,
Packing List & Inspection Report, Shipment booking/tracking, full Reports suite, and, once
discovery confirms field-level requirements, real authentication, role-based permissions,
and the PostgreSQL-backed API described in `docker/README.md`.

## Suggested walkthrough for the client meeting

1. **Dashboard**: orient on the pipeline: active orders, what's blocked, what's due to ship.
2. **Quotations → PI-33011**: walk the approval flow: Draft → Submit for Approval → Approve
   → Mark as Sent → Record Customer Response → Convert to Sales Order.
3. **Sales Orders → SO-1044**: the central workspace. Point out the lifecycle stepper, the
   blocked-shipment banner (blocked on remaining balance), and switch role to **Finance** to
   verify the balance payment on the Payments tab, then watch the Container Loading control flip
   from Blocked to Allowed.
4. **Sales Orders → SO-1041** (a completed order): open the Documents tab, then the generated
   **Commercial Invoice** to show the final deliverable of this module.
5. **Reports → Aging of Accounts**: show how outstanding balances roll up automatically from
   the payment records, no manual reconciliation.
