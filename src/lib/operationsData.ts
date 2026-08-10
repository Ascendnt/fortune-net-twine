// Operations records for orders already moving through the factory.
//
// Seeded against the sales orders that are far enough along to have them, so each screen opens with
// something real to look at rather than an empty state: SO-2210 is on the water, SO-2205 and SO-2206
// are in production, SO-2207 has an open packing list, and SO-2208/SO-2209/SO-2201 have all passed
// inspection at various points down the line.

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
    note: "Blocked — awaiting nylon 210D/14x16 restock.",
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
    id: "PL-2207",
    salesOrderId: "SO-2207",
    customerId: "CUST-006",
    createdDate: "2026-08-01",
    packedBy: "Ronaldo Cruz",
    scope: "full",
    remarks: "Second bale (No.96) still to be packed.",
    sections: [
      {
        id: "PL-2207-S1",
        title: "Bales — packed so far",
        lines: [
          // From PI-34106, the quotation behind SO-2207. No.120 is fully packed; No.96 has one of
          // three pieces on the floor.
          { id: "l1", itemId: "L1", itemCode: "NET-120-210-22-350", description: "Bale 1", qtyPcs: 3, netWeightKg: 724.5, grossWeightKg: 743.0 },
          { id: "l2", itemId: "L2", itemCode: "NET-96-210-20-350", description: "Bale 1", qtyPcs: 1, netWeightKg: 227.9, grossWeightKg: 234.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2208",
    salesOrderId: "SO-2208",
    customerId: "CUST-007",
    createdDate: "2026-07-18",
    packedBy: "Ronaldo Cruz",
    scope: "full",
    finalizedDate: "2026-07-20",
    remarks: "Two bales, marked SPA/1 and SPA/2.",
    sections: [
      {
        id: "PL-2208-S1",
        title: "Bales 1–2",
        lines: [
          // From PI-34107, the quotation behind SO-2208.
          { id: "l1", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "SPA/1", qtyPcs: 2, netWeightKg: 77.1, grossWeightKg: 79.0 },
          { id: "l2", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: "SPA/2", qtyPcs: 2, netWeightKg: 77.1, grossWeightKg: 79.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2209",
    salesOrderId: "SO-2209",
    customerId: "CUST-003",
    createdDate: "2026-07-21",
    packedBy: "Ronaldo Cruz",
    scope: "full",
    finalizedDate: "2026-07-23",
    remarks: "Twine shipped as one coil, marked PTS/T1.",
    sections: [
      {
        id: "PL-2209-S1",
        title: "Bales — net items",
        lines: [
          // From PI-34108, the quotation behind SO-2209. Weights carried through to inspection.
          { id: "l1", itemId: "L1", itemCode: "NET-120-210-22-350", description: "PTS/1", qtyPcs: 2, netWeightKg: 495.0, grossWeightKg: 507.0 },
          { id: "l2", itemId: "L2", itemCode: "NET-84-210-16-350", description: "PTS/2", qtyPcs: 4, netWeightKg: 645.0, grossWeightKg: 660.0 },
        ],
      },
      {
        id: "PL-2209-S2",
        title: "Twine",
        lines: [
          { id: "l3", itemId: "L3", itemCode: "TWINE-HEX-TARRED", description: "PTS/T1", qtyPcs: 150, netWeightKg: 150.0, grossWeightKg: 153.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2210",
    salesOrderId: "SO-2210",
    customerId: "CUST-002",
    createdDate: "2026-07-27",
    packedBy: "Ronaldo Cruz",
    scope: "full",
    finalizedDate: "2026-07-29",
    remarks: "Marked for Ålesund. Four bales, two per item.",
    sections: [
      {
        id: "PL-2210-S1",
        title: "Bales 1–4",
        lines: [
          // From PI-34109, the quotation behind SO-2210.
          { id: "l1", itemId: "L1", itemCode: "NET-96-210-20-350", description: "NF/1", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 467.0 },
          { id: "l2", itemId: "L1", itemCode: "NET-96-210-20-350", description: "NF/2", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 467.0 },
          { id: "l3", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: "NF/3", qtyPcs: 4, netWeightKg: 135.6, grossWeightKg: 139.0 },
          { id: "l4", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: "NF/4", qtyPcs: 4, netWeightKg: 135.6, grossWeightKg: 139.0 },
        ],
      },
    ],
  },
  {
    id: "PL-2201",
    salesOrderId: "SO-2201",
    customerId: "CUST-006",
    createdDate: "2026-06-12",
    packedBy: "Ronaldo Cruz",
    scope: "full",
    finalizedDate: "2026-06-14",
    remarks: "Marked for San Pedro. Six bales, strapped in pairs where possible.",
    sections: [
      {
        id: "PL-2201-S1",
        title: "Bales 1–6",
        lines: [
          // From PI-34101, the quotation behind SO-2201.
          { id: "l1", itemId: "L1", itemCode: "NET-120-210-22-350", description: "WCM/1", qtyPcs: 2, netWeightKg: 483.0, grossWeightKg: 495.0 },
          { id: "l2", itemId: "L1", itemCode: "NET-120-210-22-350", description: "WCM/2", qtyPcs: 2, netWeightKg: 483.0, grossWeightKg: 495.0 },
          { id: "l3", itemId: "L1", itemCode: "NET-120-210-22-350", description: "WCM/3", qtyPcs: 1, netWeightKg: 241.5, grossWeightKg: 248.0 },
          { id: "l4", itemId: "L2", itemCode: "NET-84-210-16-350", description: "WCM/4", qtyPcs: 2, netWeightKg: 329.7, grossWeightKg: 338.0 },
          { id: "l5", itemId: "L2", itemCode: "NET-84-210-16-350", description: "WCM/5", qtyPcs: 2, netWeightKg: 329.7, grossWeightKg: 338.0 },
          { id: "l6", itemId: "L2", itemCode: "NET-84-210-16-350", description: "WCM/6", qtyPcs: 1, netWeightKg: 164.85, grossWeightKg: 169.0 },
        ],
      },
    ],
  },
];

export const INSPECTIONS: InspectionRecord[] = [
  {
    id: "QC-2208",
    salesOrderId: "SO-2208",
    packingListId: "PL-2208",
    inspector: "",
    result: "pending",
    cartonsChecked: 0,
    defectsFound: 0,
    remarks: "",
    lines: [
      { id: "INSL-L1", itemId: "L1", itemCode: "NET-96-250-20-5IN", description: 'No.96(250/20x16) 5" Hi-Ex Braided Net', qtyPcs: 4, quotedWeightKg: 154.2, actualWeightKg: 154.2, quotedAmount: 4255.92 },
    ],
  },
  {
    id: "QC-2209",
    salesOrderId: "SO-2209",
    packingListId: "PL-2209",
    inspectedDate: "2026-07-26",
    inspector: "Elena Vasquez",
    result: "pass",
    cartonsChecked: 3,
    defectsFound: 0,
    remarks: "Mesh depth and selvage checked against PI. Twine coil weight confirmed. Released for balance invoicing.",
    lines: [
      { id: "INSL-L1", itemId: "L1", itemCode: "NET-120-210-22-350", description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net', qtyPcs: 2, quotedWeightKg: 483.0, actualWeightKg: 495.0, quotedAmount: 6996.74 },
      { id: "INSL-L2", itemId: "L2", itemCode: "NET-84-210-16-350", description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net', qtyPcs: 4, quotedWeightKg: 659.4, actualWeightKg: 645.0, quotedAmount: 9548.12 },
      { id: "INSL-L3", itemId: "L3", itemCode: "TWINE-HEX-TARRED", description: "H-Ex Lacing Twine, Tarred", qtyPcs: 150, quotedWeightKg: 150, actualWeightKg: 150, quotedAmount: 996.00 },
    ],
    // Items actual value ($17,506.25) plus freight ($350) — the order's full settled value, which is
    // what the balance is raised against, not the item lines alone.
    revisedOrderValue: 17856.25,
  },
  {
    id: "QC-2210",
    salesOrderId: "SO-2210",
    packingListId: "PL-2210",
    inspectedDate: "2026-07-31",
    inspector: "Elena Vasquez",
    result: "pass",
    cartonsChecked: 4,
    defectsFound: 0,
    remarks: "All four bales checked against PI. Net weights within tolerance. Released for balance invoicing.",
    lines: [
      { id: "INSL-L1", itemId: "L1", itemCode: "NET-96-210-20-350", description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net', qtyPcs: 4, quotedWeightKg: 911.6, actualWeightKg: 911.6, quotedAmount: 13199.96 },
      { id: "INSL-L2", itemId: "L2", itemCode: "NET-42-250-08-8IN", description: 'No.42(250/08x16) 8" Hi-Ex Braided Net', qtyPcs: 8, quotedWeightKg: 271.2, actualWeightKg: 271.2, quotedAmount: 7490.64 },
    ],
    revisedOrderValue: 21190.60,
  },
  {
    id: "QC-2201",
    salesOrderId: "SO-2201",
    packingListId: "PL-2201",
    inspectedDate: "2026-06-16",
    inspector: "Elena Vasquez",
    result: "pass",
    cartonsChecked: 6,
    defectsFound: 0,
    remarks: "Standard release inspection. No defects.",
    lines: [
      { id: "INSL-L1", itemId: "L1", itemCode: "NET-120-210-22-350", description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net', qtyPcs: 5, quotedWeightKg: 1207.5, actualWeightKg: 1207.5, quotedAmount: 17491.85 },
      { id: "INSL-L2", itemId: "L2", itemCode: "NET-84-210-16-350", description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net', qtyPcs: 5, quotedWeightKg: 824.25, actualWeightKg: 824.25, quotedAmount: 11935.15 },
    ],
    revisedOrderValue: 29677.00,
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
