import type { OrderDocumentCategory } from "./types";

/**
 * Rules for files attached to a sales order.
 *
 * There is no file server behind this build, so an uploaded file is held in browser storage. That
 * is a real constraint, not a detail to paper over: browsers give roughly 5 MB of localStorage per
 * origin, and base64 inflates a file by about a third on the way in. Everything here exists to
 * make that limit visible up front rather than as a silent failure after somebody has waited for
 * a 40 MB scan to encode.
 */

/** Per-file ceiling. Comfortably inside the quota once base64 overhead is counted. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Total across every attachment, leaving room for the rest of the app's own state. */
export const MAX_TOTAL_UPLOAD_BYTES = 8 * 1024 * 1024;

export const DOCUMENT_CATEGORIES: { id: OrderDocumentCategory; label: string }[] = [
  { id: "internal", label: "Internal" },
  { id: "customer", label: "Customer" },
  { id: "shipping", label: "Shipping" },
  { id: "finance", label: "Finance" },
  { id: "other", label: "Other" },
];

/** Human-readable size. Kept exact at the boundaries so 1024 bytes reads as 1 KB, not 1024 B. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Whether a file can be accepted, given what is already stored.
 *
 * Returns a message to show the user, or null to go ahead. Both limits are checked because a
 * hundred small files fill the quota just as effectively as one large one.
 */
export function validateUpload(args: {
  sizeBytes: number;
  name: string;
  existingTotalBytes: number;
}): string | null {
  if (args.sizeBytes === 0) {
    return `${args.name} is empty.`;
  }
  if (args.sizeBytes > MAX_UPLOAD_BYTES) {
    return `${args.name} is ${formatBytes(args.sizeBytes)}. The limit is ${formatBytes(
      MAX_UPLOAD_BYTES
    )} per file — try a compressed copy or a lower-resolution scan.`;
  }
  if (args.existingTotalBytes + args.sizeBytes > MAX_TOTAL_UPLOAD_BYTES) {
    return `This order is already holding ${formatBytes(
      args.existingTotalBytes
    )} of attachments. Remove something before adding more.`;
  }
  return null;
}

/** A short label for the file type, from the extension rather than the MIME string. */
export function fileKind(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return ext ? ext.toUpperCase() : "FILE";
}
