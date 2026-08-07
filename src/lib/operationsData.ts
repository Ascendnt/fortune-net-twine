// Operations records for orders already moving through the factory.
//
// Seeded against the sales orders that are far enough along to have them, so each screen opens with
// something real to look at rather than an empty state: SO-1044 is on the water, SO-1047 and
// SO-1048 are in production, SO-1050 is packed and waiting on inspection.

import type { InspectionRecord, PackingList, ProductionRun, Shipment } from "./types";

export const PRODUCTION_RUNS: ProductionRun[] = [
  {
    id: "PR-4047",
    salesOrderId: "SO-1047",
    itemCode: "NET-120-210-22-350",
    description: 'No.120(210/22x16) 3-1/2" Nylon Braided Net',
    qtyOrdered: 12,
    qtyCompleted: 8,
    qtyRejected: 1,
    startedDate: "2026-07-14",
    note: "Line 2. One piece rejected on selvage fault, re-run scheduled.",
  },
  {
    id: "PR-4048",
    salesOrderId: "SO-1047",
    itemCode: "TWINE-HEX-TARRED",
    description: "H-Ex Lacing Twine, Tarred",
    qtyOrdered: 200,
    qtyCompleted: 200,
    qtyRejected: 0,
    startedDate: "2026-07-14",
    completedDate: "2026-07-22",
  },
  {
    id: "PR-4049",
    salesOrderId: "SO-1048",
    itemCode: "NET-84-210-16-350",
    description: 'No.84(210/16x16) 3-1/2" Nylon Braided Net',
    qtyOrdered: 20,
    qtyCompleted: 6,
    qtyRejected: 0,
    startedDate: "2026-07-28",
    note: "Urgent order, running on two lines.",
  },
  {
    id: "PR-4050",
    salesOrderId: "SO-1050",
    itemCode: "NET-96-210-20-350",
    description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net',
    qtyOrdered: 8,
    qtyCompleted: 8,
    qtyRejected: 0,
    startedDate: "2026-07-06",
    completedDate: "2026-07-19",
  },
];

export const PACKING_LISTS: PackingList[] = [
  {
    id: "PL-5050",
    salesOrderId: "SO-1050",
    createdDate: "2026-07-20",
    packedBy: "Ronaldo Cruz",
    finalizedDate: "2026-07-21",
    remarks: "Marked for Long Beach. Four bales strapped in pairs.",
    cartons: [
      { id: "c1", markNo: "WCM/1", itemCode: "NET-96-210-20-350", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 468.0, status: "packed" },
      { id: "c2", markNo: "WCM/2", itemCode: "NET-96-210-20-350", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 468.0, status: "packed" },
      { id: "c3", markNo: "WCM/3", itemCode: "NET-96-210-20-350", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 468.0, status: "packed" },
      { id: "c4", markNo: "WCM/4", itemCode: "NET-96-210-20-350", qtyPcs: 2, netWeightKg: 455.8, grossWeightKg: 468.0, status: "packed" },
    ],
  },
  {
    id: "PL-5044",
    salesOrderId: "SO-1044",
    createdDate: "2026-07-15",
    packedBy: "Ronaldo Cruz",
    finalizedDate: "2026-07-16",
    cartons: [
      { id: "c1", markNo: "PTS/1", itemCode: "NET-120-210-22-350", qtyPcs: 3, netWeightKg: 724.5, grossWeightKg: 741.0, status: "shipped" },
      { id: "c2", markNo: "PTS/2", itemCode: "NET-120-210-22-350", qtyPcs: 3, netWeightKg: 724.5, grossWeightKg: 741.0, status: "shipped" },
    ],
  },
];

export const INSPECTIONS: InspectionRecord[] = [
  {
    id: "QC-6050",
    salesOrderId: "SO-1050",
    packingListId: "PL-5050",
    inspector: "Elena Vasquez",
    result: "pending",
    cartonsChecked: 0,
    defectsFound: 0,
    remarks: "",
  },
  {
    id: "QC-6044",
    salesOrderId: "SO-1044",
    packingListId: "PL-5044",
    inspectedDate: "2026-07-17",
    inspector: "Elena Vasquez",
    result: "pass",
    cartonsChecked: 2,
    defectsFound: 0,
    remarks: "Mesh depth and selvage checked against PI. Marks legible. Released for loading.",
  },
];

export const SHIPMENTS: Shipment[] = [
  {
    id: "SH-7044",
    salesOrderId: "SO-1044",
    status: "departed",
    vessel: "MV Pacific Trader V.221E",
    containerNo: "TCLU 4821960",
    billOfLadingNo: "MNLJKT-2026-0447",
    portOfLoading: "Manila, Philippines",
    portOfDischarge: "Jakarta, Indonesia",
    etd: "2026-07-22",
    eta: "2026-08-04",
    bookedDate: "2026-07-18",
    grossWeightKg: 1482,
    remarks: "Single 20ft container. Documents couriered to the bank on departure.",
  },
];
