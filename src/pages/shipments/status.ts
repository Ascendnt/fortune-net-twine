import type { ShipmentStatus } from "@/lib/types";

/** Where a container has got to, in the colours the rest of the app uses for the same idea. */
export const STATUS_TONE: Record<ShipmentStatus, string> = {
  booked: "bg-manifest-100 text-manifest-800",
  loaded: "bg-amber-100 text-amber-800",
  departed: "bg-pine-100 text-pine-800",
  arrived: "bg-pine-100 text-pine-800",
};
