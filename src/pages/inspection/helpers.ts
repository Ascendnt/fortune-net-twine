import { listOrders, piRefLine } from "@/lib/packing";
import type { Customer, InspectionRecord, PackingList, SalesOrder } from "@/lib/types";

// Reading a report's context out of the rest of the data. Shared by the index, which needs it a row
// at a time, and the report screen, which needs it once. Pure functions over the collections rather
// than closures over the store, so neither screen can quietly answer these differently.

export const STATUS_LABEL: Record<string, string> = {
  pending: "Preparing",
  sent: "With customer",
  confirmed: "Confirmed",
  held: "Held",
};

/** Reports written before a load could cover several orders carry a single `salesOrderId`. */
export function orderIdsFor(record: InspectionRecord): string[] {
  return record.salesOrderIds ?? (record.salesOrderId ? [record.salesOrderId] : []);
}

export function listFor(record: InspectionRecord, packingLists: PackingList[]): PackingList | undefined {
  return packingLists.find((p) => p.id === record.packingListId);
}

export function ordersFor(record: InspectionRecord, salesOrders: SalesOrder[]): SalesOrder[] {
  return orderIdsFor(record)
    .map((id) => salesOrders.find((o) => o.id === id))
    .filter((o): o is SalesOrder => Boolean(o));
}

export function customerOf(
  record: InspectionRecord,
  packingLists: PackingList[],
  salesOrders: SalesOrder[],
  customers: Customer[]
): Customer | undefined {
  const list = listFor(record, packingLists);
  if (list) return customers.find((c) => c.id === list.customerId);
  return customers.find((c) => c.id === ordersFor(record, salesOrders)[0]?.customerId);
}

/** The PI references the report covers, as the customer's copy writes them. */
export function refsFor(record: InspectionRecord, packingLists: PackingList[], salesOrders: SalesOrder[]): string {
  const list = listFor(record, packingLists);
  if (list) return piRefLine(listOrders(list));
  return orderIdsFor(record)
    .map((id) => salesOrders.find((o) => o.id === id)?.quotationId ?? id)
    .join(", ");
}
