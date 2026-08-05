# Fortune Net & Twine, Export Sales ERP Prototype

A frontend-only prototype of the quotation to invoice process. Everything runs in the browser and
saves to that browser's local storage. There is no server, no login, and nothing leaves the machine.

## Running it

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually <http://localhost:5173>).

Use the role switcher in the top bar to see the app as Sales, Finance or Management. It changes
which approval actions are available.

**Reset at any time:** Settings, then Demo Data, then *Reset Demo Data*. This restores the seeded
fixtures and discards everything you have entered.

## The full walkthrough

### 1. Build a quotation

Quotations / PI, then **New Quotation**.

1. Pick a customer. Currency, payment terms, consignee and Attn pre-fill from their record and stay
   editable for this quotation only. Shipment, Dear Sirs, MOQ and Validity are the cover-letter
   fields that print on the PDF.
2. **Generate Batch Item** and choose one group type. Add as many groups as the quotation needs:
   - **ASSEMBLED**, a titled finished product such as "COMPLETE SOCCER GOAL NET ASSEMBLY", built
     from several nets or twines.
   - **NORMAL**, standard net and twine items.
   - **LACING**, lacing twines billed by the kilo, plus flat lacing charges.

   Narrative text goes in the **Remarks** field in Step 3, which prints on the PI. The reference
   system also had a NOTE group, but that was a second way to do the same job.
3. Inside an ASSEMBLED or NORMAL group, **Add Item** opens *Item Selection*: Category, Material,
   Net Type, Knots, Selvages, Stretching, Reinforcement, Others, Color and the two UOMs. Every field
   is type-to-search. Choosing a Material narrows Net Type to the types that actually have
   specification codes on file. Confirming composes the item's specification sentence. Shipment in
   Step 1 is the same style of searchable dropdown, backed by the client master's standard wordings.
4. **Add Specification** opens the specification master, filtered to the Material and Net Type you
   just picked. Search it, filter by mesh size, depth or length, and tick as many codes as you need.
   Weight lands immediately; the grand total stays at zero until you price.
5. Type a **Given price / kg** and **Qty** on each specification row.
6. **Add Pricing** opens the two-stage pricing modal:
   - Stage 1 lists every available adjustment with its rate and the running total after each step.
     **Everything starts unticked.** Nothing is applied until you say so.
   - *Proceed to Price / Piece* adds labor, wastage and sewing twine.
   - Once applied, the row shows what was used, for example `COMM +3% · MD +0.18 → 11.96/kg`, so you
     can see it without opening anything.
7. To change an item's specification sentence later, click its header. The header highlights on
   hover and carries an Edit control, and it reopens Item Selection.
8. Save as Draft.

**Discount** can be entered either as a money amount or as a percentage. Use the selector beside the
field to switch between the currency and `%`. When set to a percentage, the resolved amount is shown
underneath and in the totals row so there is no ambiguity about what is being deducted.

### 2. Approve and send

On the quotation, **Submit for Approval**, switch role to Sales Manager, **Approve**, then
**Mark as Sent**. **Download PDF** produces the customer letter at any point.

**Edit** reopens the whole builder against the saved quotation. **Create Revision** bumps the
revision number and logs the reason. **Delete** removes it.

### 3. Convert to a sales order

Record the customer's response as *accepted*, then **Convert to Sales Order**. Deposit and balance
payment records are generated automatically from the deposit percentage.

### 4. Payments

Payments shows every milestone. Finance can **Verify** or **Reject** a submitted remittance, and
**Record Payment** adds an ad-hoc or corrected entry. Each row can be edited or deleted.

### 5. Through the lifecycle to invoice

On the sales order, advance the stage through production, packing, inspection and shipment. Loading
authorization is gated on a verified deposit. At the end, generate the Commercial Invoice.

On the invoice, **Edit** lets you set the actual shipped quantity per line for a partial shipment,
and amounts recalculate. The same screen carries freight, discount (amount or percentage), tax,
shipped weight, and the bill of lading and container numbers.

## What you can change yourself

Nothing in this prototype requires a developer to change:

| Where | What |
|---|---|
| **Master Data, Item Specifications** | Add, edit and delete specification codes, including WEIGHT/PC |
| **Master Data, Lacing Catalog** | Add, edit and delete lacing codes and their default rates |
| **Settings, Pricing Rules** | Add and delete rules, change rates, enable and disable |
| **Settings, Lookup tables** | Add, edit and remove Mesh Depth, Depth-Way and Insurance buckets |
| **Customers** | Add, edit and delete customers and their contacts |
| **Quotations** | Create, edit and delete, including every batch, item, specification and price |
| **Payments** | Add, edit and delete payment records |
| **Invoices** | Edit shipped quantities and charges, delete |

Specifications can also be created from inside the quotation flow, through *Create New Specs* in the
Add Specification picker, so you never have to leave what you are doing.

## Input rules

Every numeric field is a quantity, weight, rate, percentage or money amount, so none of them accept
a negative value. Typing one, or pasting one, clamps the field to zero. The browser's up and down
spinner arrows are hidden throughout, so numbers are typed rather than nudged.

## How the numbers work

Verified against the system simulation document. Given a base price of 5.0000 per kg:

| Adjustment | Formula | Result |
|---|---|---|
| Add commission 3% | `P ÷ (1 − r)`, margin-inclusive | 5.1546 |
| Add commission 3% then 5% | compounds on the running total | 5.4259 |
| Add percentage 5% | `P × (1 + r)`, simple markup | 5.2500 |
| Add amount 0.10 | `P + a` | 5.1000 |
| Subtract percentage 5% | `P ÷ (1 + r)`, removes embedded margin | 4.7619 |
| Add mesh depth (122MD) | `P + 0.1750` | 5.1750 |
| Add depth-way (50FL) | `P + 0.5000` | 5.5000 |
| Add insurance | `P × 1.0066`, that is **0.66%, not a flat 0.66** | 5.0330 |

Then:

```
U/P    = New price/kg × Weight/pc + Labor + Wastage + Sewing twine
Amount = U/P × Qty          (from the unrounded U/P: 2561.625 × 10 = 25,616.25)
Weight = Weight/pc × Qty    (plus lacing twine KGS; flat lacing charges add none)

Grand total  = every batch total, less discount, plus freight and tax
Total weight = every line's weight
```

Run `npm test` to check these against the documented figures.

## Known limits of the prototype

- **No backend.** Data lives in one browser. Clearing site data or using another machine starts from
  the seeds.
- **No real authentication.** The role switcher changes what is visible; it enforces nothing.
- **Specification codes beyond N-1595 to N-1603** are extrapolated from the item master's net
  families. They are plausible, not real. Replace them with the factory's export before any live use.
- **Mesh Depth and Depth-Way rates** are interpolated from the two values the simulation observed
  (122MD gives 0.1750, 50FL gives 0.5000). The factory's real rate card should replace them.
- **Lacing rates** default to 2.50/kg, taken from the simulation's LC-001 sample.
- **Material to Net Type cascade is inferred**, not authoritative. It is derived from the
  specification master rather than the factory's real dependency table.
- **Inquiries, Technical Assessments, Production, Packing and Shipments** are deliberately out of
  scope and show as locked.
