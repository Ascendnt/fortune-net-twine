export function formatMoney(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatWeight(kg: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(kg)} kg`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * The proforma reference as it is shown on screen and printed on the document.
 *
 * The first issue of a quotation is not a revision of anything, so it prints bare. Once it has been
 * revised the revision travels with the number, which is what the customer and the bank match on:
 * PI-33007 first, then PI-33007-R1, PI-33007-R2 and so on.
 */
export function piRef(id: string, revisionNo: number): string {
  return revisionNo > 0 ? `${id}-R${revisionNo}` : id;
}

/** How a revision reads in history and headers. Revision 0 is the first issue, not "Revision 0". */
export function revisionLabel(revisionNo: number): string {
  return revisionNo > 0 ? `Revision ${revisionNo}` : "Initial issue";
}

/** The short form used in badges and filter chips: "—" for the first issue, else "R2". */
export function revisionTag(revisionNo: number): string {
  return revisionNo > 0 ? `R${revisionNo}` : "—";
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
