import type { ShipmentScope } from "@/lib/types";

/**
 * How a P.I. is going out on a load, and the sentence that explains each choice.
 *
 * Shared by the index screen, which asks when a list is created, and the detail screen, which
 * asks again when an order is consolidated in or a scope is corrected. One list so the wording the
 * packer reads is the same in both places.
 */
export const SCOPES: { id: ShipmentScope; label: string; help: string }[] = [
  { id: "full", label: "Full shipment", help: "Everything on the order goes in this one load." },
  { id: "partial", label: "Partial shipment", help: "Part of the order now, the rest to follow." },
  { id: "final", label: "Final shipment", help: "The last load. Everything outstanding must be on it." },
];
