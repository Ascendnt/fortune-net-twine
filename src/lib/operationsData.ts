// Operations records for orders already moving through the factory.
//
// Seeded against the sales orders that are far enough along to have them, so each screen opens with
// something real to look at rather than an empty state: SO-2210 is on the water, SO-2206 is in
// production, SO-2207 has an open packing list, and SO-2208/SO-2209/SO-2201 have been through the
// inspection report at various points down the line.
//
// SO-2205 and SO-2211 share PL-2026-0001, which is the consolidated case: one customer, one
// container, two PIs going out under different scopes. That one exists so the packing screen shows
// what a consolidated load looks like without anybody having to build it first.

import type { InspectionRecord, PackingList, ProductionRun, Shipment } from "./types";

export const PRODUCTION_RUNS: ProductionRun[] = [
  {
    id: "PR-5001",
    salesOrderId: "SO-2205",
    itemCode: "NET-96-250-20-5IN",
    description: 'No.96(250/20x16) 5" Hi-Ex Braided Net',
    qtyOrdered: 8,
    qtyCompleted: 5,
    qtyRejected: 0,
    startedDate: "2026-07-20",
    note: "Line 1, on schedule.",
  },
  {
    id: "PR-5002",
    salesOrderId: "SO-2206",
    itemCode: "NET-72-210-14-350",
    description: 'No.72(210/14x16) 3-1/2" Nylon Braided Net',
    qtyOrdered: 4,
    qtyCompleted: 1,
    qtyRejected: 0,
    startedDate: "2026-07-08",
    note: "Blocked, awaiting nylon 210D/14x16 restock.",
  },
  {
    id: "PR-5003",
    salesOrderId: "SO-2207",
    itemCode: "NET-120-210-22-350",
    description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net',
    qtyOrdered: 3,
    qtyCompleted: 3,
    qtyRejected: 0,
    startedDate: "2026-07-05",
    completedDate: "2026-07-18",
  },
  {
    id: "PR-5004",
    salesOrderId: "SO-2207",
    itemCode: "NET-96-210-20-350",
    description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net',
    qtyOrdered: 3,
    qtyCompleted: 3,
    qtyRejected: 0,
    startedDate: "2026-07-10",
    completedDate: "2026-07-22",
    note: "One re-run on selvage tension, otherwise clean.",
  },
];

export const PACKING_LISTS: PackingList[] = [
  {
    // The consolidated load, and the reason the packing screen is worth opening cold. Nordfisk has
    // two live orders and asked for both in one container: SO-2205 is only part-made so it goes as
    // a first partial, while SO-2211 is finished and goes in full. One container, two PIs, two
    // different scopes, which is exactly what a single list-level scope could not express.
    id: "PL-2026-0001",
    orders: [
      { salesOrderId: "SO-2205", piRef: "PI-34104", scope: "partial", partialNo: 1 },
      { salesOrderId: "SO-2211", piRef: "PI-34112", scope: "full" },
    ],
    customerId: "CUST-002",
    containerNo: "DNBU-2280115",
    createdDate: "2026-08-11",
    packedBy: "Ronaldo Cruz",
    remarks: "Consolidated at the customer's request. Marked NFT/ALESUND. Balance of SO-2205 to follow.",
    sections: [
      {
        id: "PL-2026-0001-S1",
        title: "SO-2205 bales 1-5",
        containerNo: "DNBU-2280115",
        lines: [
          // Five of the eight pieces on PI-34104 are off the line. Quoted weight is 308.4 KG for
          // eight, so a piece runs 38.55 KG and each bale lands a shade under it.
          { id: "pl1-l1", salesOrderId: "SO-2205", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/1", baleNo: "1", qtyPcs: 1, netWeightKg: 38.2, grossWeightKg: 39.6 },
          { id: "pl1-l2", salesOrderId: "SO-2205", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/2", baleNo: "2", qtyPcs: 1, netWeightKg: 38.6, grossWeightKg: 40.0 },
          { id: "pl1-l3", salesOrderId: "SO-2205", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/3", baleNo: "3", qtyPcs: 1, netWeightKg: 38.4, grossWeightKg: 39.8 },
          { id: "pl1-l4", salesOrderId: "SO-2205", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/4", baleNo: "4", qtyPcs: 1, netWeightKg: 38.5, grossWeightKg: 39.9 },
          { id: "pl1-l5", salesOrderId: "SO-2205", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/5", baleNo: "5", qtyPcs: 1, netWeightKg: 38.3, grossWeightKg: 39.7 },
        ],
      },
      {
        id: "PL-2026-0001-S2",
        title: "SO-2211 bales 6-11",
        containerNo: "DNBU-2280115",
        lines: [
          // PI-34112 in full: six pieces at a quoted 231.3 KG, so 38.55 KG apiece again.
          { id: "pl1-l6", salesOrderId: "SO-2211", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/6", baleNo: "6", qtyPcs: 1, netWeightKg: 38.7, grossWeightKg: 40.1 },
          { id: "pl1-l7", salesOrderId: "SO-2211", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/7", baleNo: "7", qtyPcs: 1, netWeightKg: 38.4, grossWeightKg: 39.8 },
          { id: "pl1-l8", salesOrderId: "SO-2211", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/8", baleNo: "8", qtyPcs: 1, netWeightKg: 38.5, grossWeightKg: 39.9 },
          { id: "pl1-l9", salesOrderId: "SO-2211", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/9", baleNo: "9", qtyPcs: 1, netWeightKg: 38.6, grossWeightKg: 40.0 },
          { id: "pl1-l10", salesOrderId: "SO-2211", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/10", baleNo: "10", qtyPcs: 1, netWeightKg: 38.4, grossWeightKg: 39.8 },
          { id: "pl1-l11", salesOrderId: "SO-2211", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "NFT/11", baleNo: "11", qtyPcs: 1, netWeightKg: 38.5, grossWeightKg: 39.9 },
        ],
      },
    ],
  },
  {
    id: "PL-2026-0002",
    // A partial, and marked as one: the No.96 line has a single piece of three on the floor. Left
    // as a full shipment it could never be closed, which is what the scope is for.
    orders: [{ salesOrderId: "SO-2207", piRef: "PI-34106", scope: "partial", partialNo: 1 }],
    customerId: "CUST-006",
    createdDate: "2026-08-01",
    packedBy: "Ronaldo Cruz",
    remarks: "Second bale (No.96) still to be packed.",
    sections: [
      {
        id: "PL-2026-0002-S1",
        title: "Bales packed so far",
        lines: [
          // From PI-34106, the quotation behind SO-2207. No.120 is fully packed; No.96 has one of
          // three pieces on the floor.
          { id: "l1", salesOrderId: "SO-2207", itemId: "L1", itemCode: "NET-120-210-22-350", description: "Bale 1", baleNo: "1", qtyPcs: 3, netWeightKg: 724.5, grossWeightKg: 743.0 },
          { id: "l2", salesOrderId: "SO-2207", itemId: "L2", itemCode: "NET-96-210-20-350", description: "Bale 2", baleNo: "2", qtyPcs: 1, netWeightKg: 227.9, grossWeightKg: 234.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2026-0003",
    orders: [{ salesOrderId: "SO-2208", piRef: "PI-34107", scope: "full" }],
    customerId: "CUST-007",
    createdDate: "2026-07-18",
    packedBy: "Ronaldo Cruz",
    finalizedDate: "2026-07-20",
    remarks: "Two bales, marked SPA/1 and SPA/2.",
    sections: [
      {
        id: "PL-2026-0003-S1",
        title: "Bales 1-2",
        lines: [
          // From PI-34107, the quotation behind SO-2208.
          { id: "l1", salesOrderId: "SO-2208", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "SPA/1", baleNo: "1", qtyPcs: 2, netWeightKg: 77.1, grossWeightKg: 79.0 },
          { id: "l2", salesOrderId: "SO-2208", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "SPA/2", baleNo: "2", qtyPcs: 2, netWeightKg: 77.1, grossWeightKg: 79.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2026-0004",
    orders: [{ salesOrderId: "SO-2209", piRef: "PI-34108-R1", scope: "full" }],
    customerId: "CUST-003",
    createdDate: "2026-07-21",
    packedBy: "Ronaldo Cruz",
    finalizedDate: "2026-07-23",
    remarks: "Twine shipped as one coil, marked PTS/T1.",
    sections: [
      {
        id: "PL-2026-0004-S1",
        title: "Bales, net items",
        lines: [
          // From PI-34108, the quotation behind SO-2209. Weights carried through to the report.
          { id: "l1", salesOrderId: "SO-2209", itemId: "L1", itemCode: "NET-120-210-22-350", description: "PTS/1", baleNo: "1", qtyPcs: 2, netWeightKg: 495.0, grossWeightKg: 507.0 },
          { id: "l2", salesOrderId: "SO-2209", itemId: "L2", itemCode: "NET-84-210-16-350", description: "PTS/2", baleNo: "2", qtyPcs: 4, netWeightKg: 645.0, grossWeightKg: 660.0 },
        ],
      },
      {
        id: "PL-2026-0004-S2",
        title: "Twine",
        lines: [
          { id: "l3", salesOrderId: "SO-2209", itemId: "L3", itemCode: "TWINE-HEX-TARRED", description: "PTS/T1", baleNo: "T1", qtyPcs: 150, netWeightKg: 150.0, grossWeightKg: 153.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2026-0005",
    orders: [{ salesOrderId: "SO-2210", piRef: "PI-34109", scope: "full" }],
    customerId: "CUST-002",
    containerNo: "MSKU-5512040",
    createdDate: "2026-07-27",
    packedBy: "Ronaldo Cruz",
    finalizedDate: "2026-07-29",
    remarks: "Marked for Alesund. Four bales, two per item.",
    sections: [
      {
        id: "PL-2026-0005-S1",
        title: "Bales 1-4",
        containerNo: "MSKU-5512040",
        lines: [
          // From PI-34109, the quotation behind SO-2210.
          { id: "l1", salesOrderId: "SO-2210", itemId: "L1", itemCode: "NET-96-210-20-350", description: "NF/1", baleNo: "1", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 467.0 },
          { id: "l2", salesOrderId: "SO-2210", itemId: "L1", itemCode: "NET-96-210-20-350", description: "NF/2", baleNo: "2", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 467.0 },
          { id: "l3", salesOrderId: "SO-2210", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: "NF/3", baleNo: "3", qtyPcs: 4, netWeightKg: 135.6, grossWeightKg: 139.0 },
          { id: "l4", salesOrderId: "SO-2210", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: "NF/4", baleNo: "4", qtyPcs: 4, netWeightKg: 135.6, grossWeightKg: 139.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2026-0006",
    orders: [{ salesOrderId: "SO-2201", piRef: "PI-34101", scope: "full" }],
    customerId: "CUST-006",
    containerNo: "MSKU-4498210",
    createdDate: "2026-06-12",
    packedBy: "Ronaldo Cruz",
    finalizedDate: "2026-06-14",
    remarks: "Marked for San Pedro. Six bales, strapped in pairs where possible.",
    sections: [
      {
        id: "PL-2026-0006-S1",
        title: "Bales 1-6",
        containerNo: "MSKU-4498210",
        lines: [
          // From PI-34101, the quotation behind SO-2201.
          { id: "l1", salesOrderId: "SO-2201", itemId: "L1", itemCode: "NET-120-210-22-350", description: "WCM/1", baleNo: "1", qtyPcs: 2, netWeightKg: 483.0, grossWeightKg: 495.0 },
          { id: "l2", salesOrderId: "SO-2201", itemId: "L1", itemCode: "NET-120-210-22-350", description: "WCM/2", baleNo: "2", qtyPcs: 2, netWeightKg: 483.0, grossWeightKg: 495.0 },
          { id: "l3", salesOrderId: "SO-2201", itemId: "L1", itemCode: "NET-120-210-22-350", description: "WCM/3", baleNo: "3", qtyPcs: 1, netWeightKg: 241.5, grossWeightKg: 248.0 },
          { id: "l4", salesOrderId: "SO-2201", itemId: "L2", itemCode: "NET-84-210-16-350", description: "WCM/4", baleNo: "4", qtyPcs: 2, netWeightKg: 329.7, grossWeightKg: 338.0 },
          { id: "l5", salesOrderId: "SO-2201", itemId: "L2", itemCode: "NET-84-210-16-350", description: "WCM/5", baleNo: "5", qtyPcs: 2, netWeightKg: 329.7, grossWeightKg: 338.0 },
          { id: "l6", salesOrderId: "SO-2201", itemId: "L2", itemCode: "NET-84-210-16-350", description: "WCM/6", baleNo: "6", qtyPcs: 1, netWeightKg: 164.85, grossWeightKg: 169.0 },
        ],
      },
    ],
  },
];

// Inspection reports. Not quality checks despite the name: each one is the listing of a container's
// contents, weights and all, sent to the customer to counter-check before the goods leave. The
// weights on them are what the balance is invoiced against, which is why they carry the computed
// figure alongside the measured one.
export const INSPECTIONS: InspectionRecord[] = [
  {
    id: "IR-2026-0003",
    packingListId: "PL-2026-0003",
    salesOrderIds: ["SO-2208"],
    preparedBy: "Elena Vasquez",
    result: "pending",
    remarks: "",
    lines: [
      { id: "INSL-l1", salesOrderId: "SO-2208", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: 'No.96(250/20x16) 5" Hi-Ex Braided Net', baleNo: "1", qtyPcs: 2, computedWeightKg: 77.10, netWeightKg: 77.10, grossWeightKg: 79.00, pricePerKg: 27.6, quotedAmount: 2127.96 },
      { id: "INSL-l2", salesOrderId: "SO-2208", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: 'No.96(250/20x16) 5" Hi-Ex Braided Net', baleNo: "2", qtyPcs: 2, computedWeightKg: 77.10, netWeightKg: 77.10, grossWeightKg: 79.00, pricePerKg: 27.6, quotedAmount: 2127.96 },
    ],
  },
  {
    id: "IR-2026-0004",
    packingListId: "PL-2026-0004",
    salesOrderIds: ["SO-2209"],
    sentDate: "2026-07-24",
    confirmedDate: "2026-07-26",
    preparedBy: "Elena Vasquez",
    result: "confirmed",
    remarks: "Customer confirmed the listing and the twine coil weight. Released for balance invoicing.",
    lines: [
      { id: "INSL-l1", salesOrderId: "SO-2209", itemId: "L1", itemCode: "NET-120-210-22-350", description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net', baleNo: "1", qtyPcs: 2, computedWeightKg: 483.00, netWeightKg: 495.00, grossWeightKg: 507.00, pricePerKg: 14.4859, quotedAmount: 6996.74 },
      { id: "INSL-l2", salesOrderId: "SO-2209", itemId: "L2", itemCode: "NET-84-210-16-350", description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net', baleNo: "2", qtyPcs: 4, computedWeightKg: 659.40, netWeightKg: 645.00, grossWeightKg: 660.00, pricePerKg: 14.4808, quotedAmount: 9548.12 },
      { id: "INSL-l3", salesOrderId: "SO-2209", itemId: "L3", itemCode: "TWINE-HEX-TARRED", description: "H-Ex Lacing Twine, Tarred", baleNo: "T1", qtyPcs: 150, computedWeightKg: 150.00, netWeightKg: 150.00, grossWeightKg: 153.00, pricePerKg: 6.64, quotedAmount: 996.00 },
    ],
    settledOrderValues: { "SO-2209": 17856.25 },
  },
  {
    id: "IR-2026-0005",
    packingListId: "PL-2026-0005",
    salesOrderIds: ["SO-2210"],
    sentDate: "2026-07-30",
    confirmedDate: "2026-07-31",
    preparedBy: "Elena Vasquez",
    result: "confirmed",
    remarks: "All four bales checked off against the PI. Net weights within tolerance.",
    lines: [
      { id: "INSL-l1", salesOrderId: "SO-2210", itemId: "L1", itemCode: "NET-96-210-20-350", description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net', baleNo: "1", qtyPcs: 2, computedWeightKg: 455.80, netWeightKg: 455.80, grossWeightKg: 467.00, pricePerKg: 14.4823, quotedAmount: 6599.98 },
      { id: "INSL-l2", salesOrderId: "SO-2210", itemId: "L1", itemCode: "NET-96-210-20-350", description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net', baleNo: "2", qtyPcs: 2, computedWeightKg: 455.80, netWeightKg: 455.80, grossWeightKg: 467.00, pricePerKg: 14.4823, quotedAmount: 6599.98 },
      { id: "INSL-l3", salesOrderId: "SO-2210", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: 'No.42(250/08x16) 8" Hi-Ex Braided Net', baleNo: "3", qtyPcs: 4, computedWeightKg: 135.60, netWeightKg: 135.60, grossWeightKg: 139.00, pricePerKg: 27.6205, quotedAmount: 3745.32 },
      { id: "INSL-l4", salesOrderId: "SO-2210", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: 'No.42(250/08x16) 8" Hi-Ex Braided Net', baleNo: "4", qtyPcs: 4, computedWeightKg: 135.60, netWeightKg: 135.60, grossWeightKg: 139.00, pricePerKg: 27.6205, quotedAmount: 3745.32 },
    ],
    settledOrderValues: { "SO-2210": 21190.60 },
  },
  {
    id: "IR-2026-0006",
    packingListId: "PL-2026-0006",
    salesOrderIds: ["SO-2201"],
    sentDate: "2026-06-15",
    confirmedDate: "2026-06-16",
    preparedBy: "Elena Vasquez",
    result: "confirmed",
    remarks: "Confirmed by the customer without amendment.",
    lines: [
      { id: "INSL-l1", salesOrderId: "SO-2201", itemId: "L1", itemCode: "NET-120-210-22-350", description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net', baleNo: "1", qtyPcs: 2, computedWeightKg: 483.00, netWeightKg: 483.00, grossWeightKg: 495.00, pricePerKg: 14.4859, quotedAmount: 6996.74 },
      { id: "INSL-l2", salesOrderId: "SO-2201", itemId: "L1", itemCode: "NET-120-210-22-350", description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net', baleNo: "2", qtyPcs: 2, computedWeightKg: 483.00, netWeightKg: 483.00, grossWeightKg: 495.00, pricePerKg: 14.4859, quotedAmount: 6996.74 },
      { id: "INSL-l3", salesOrderId: "SO-2201", itemId: "L1", itemCode: "NET-120-210-22-350", description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net', baleNo: "3", qtyPcs: 1, computedWeightKg: 241.50, netWeightKg: 241.50, grossWeightKg: 248.00, pricePerKg: 14.4859, quotedAmount: 3498.37 },
      { id: "INSL-l4", salesOrderId: "SO-2201", itemId: "L2", itemCode: "NET-84-210-16-350", description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net', baleNo: "4", qtyPcs: 2, computedWeightKg: 329.70, netWeightKg: 329.70, grossWeightKg: 338.00, pricePerKg: 14.4808, quotedAmount: 4774.06 },
      { id: "INSL-l5", salesOrderId: "SO-2201", itemId: "L2", itemCode: "NET-84-210-16-350", description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net', baleNo: "5", qtyPcs: 2, computedWeightKg: 329.70, netWeightKg: 329.70, grossWeightKg: 338.00, pricePerKg: 14.4808, quotedAmount: 4774.06 },
      { id: "INSL-l6", salesOrderId: "SO-2201", itemId: "L2", itemCode: "NET-84-210-16-350", description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net', baleNo: "6", qtyPcs: 1, computedWeightKg: 164.85, netWeightKg: 164.85, grossWeightKg: 169.00, pricePerKg: 14.4808, quotedAmount: 2387.03 },
    ],
    settledOrderValues: { "SO-2201": 29677.00 },
  },
];

export const SHIPMENTS: Shipment[] = [
  {
    id: "SH-2210",
    salesOrderId: "SO-2210",
    status: "departed",
    vessel: "MV Nordic Carrier V.114W",
    containerNo: "MSKU-5512040",
    billOfLadingNo: "MNLOSL-2026-0812",
    portOfLoading: "Manila, Philippines",
    portOfDischarge: "Ålesund, Norway",
    etd: "2026-08-07",
    eta: "2026-08-28",
    bookedDate: "2026-08-05",
    grossWeightKg: 1212,
    remarks: "Single 20ft container. Documents to follow on arrival.",
  },
  {
    id: "SH-2201",
    salesOrderId: "SO-2201",
    status: "arrived",
    vessel: "MV Pacific Trader V.198E",
    containerNo: "MSKU-4498210",
    billOfLadingNo: "MAEU-8830210",
    portOfLoading: "Manila, Philippines",
    portOfDischarge: "Los Angeles, California",
    etd: "2026-06-24",
    eta: "2026-07-10",
    bookedDate: "2026-06-20",
    grossWeightKg: 2083,
    remarks: "Single 20ft container. Cleared customs 2026-07-12.",
  },
];
