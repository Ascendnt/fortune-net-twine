import type { InspectionRecord, PaymentRecord, Quotation, SalesOrder } from "./types";
import { isPendingApproval } from "./paymentApproval";
import { piRef } from "./format";

/**
 * The notification feed behind the bell.
 *
 * Derived from the current state every time it is read rather than stored, because a stored feed
 * goes stale: an item saying "PI-33011 awaiting approval" has to disappear the moment somebody
 * approves it, and the only way to guarantee that is to compute it from the same data the rest of
 * the screen is drawn from.
 *
 * Everything a notification says is something the user can act on, and every one carries the link
 * to the place the action happens. A feed of things you cannot do anything about is noise people
 * learn to ignore, which is worse than no feed at all.
 */

export type NotificationTone = "alert" | "warning" | "info";

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: NotificationTone;
}

/** Alerts first, then warnings, then the rest. Within a tone, insertion order is kept. */
const TONE_ORDER: Record<NotificationTone, number> = { alert: 0, warning: 1, info: 2 };

export function buildNotifications(
  state: {
    quotations: Quotation[];
    salesOrders: SalesOrder[];
    payments: PaymentRecord[];
    inspections: InspectionRecord[];
  },
  today: string
): AppNotification[] {
  const out: AppNotification[] = [];

  // An order that has hit a blocker stops dead until somebody looks at it, so it leads the feed.
  for (const order of state.salesOrders) {
    const blocked = order.stages.find((s) => s.status === "blocked");
    if (!blocked) continue;
    out.push({
      id: `blocked-${order.id}`,
      title: `${order.id} is blocked`,
      detail: blocked.blocker || "Blocked, no reason recorded",
      href: `/orders/${order.id}`,
      tone: "alert",
    });
  }

  for (const p of state.payments) {
    if (p.status === "overdue") {
      out.push({
        id: `overdue-${p.id}`,
        title: `${p.type} payment overdue on ${p.salesOrderId}`,
        detail: p.dueDate ? `Was due ${p.dueDate}` : "No due date recorded",
        href: "/payments",
        tone: "alert",
      });
    }
    if (isPendingApproval(p)) {
      out.push({
        id: `approve-${p.id}`,
        title: `${p.id} is waiting for approval`,
        detail: p.approval?.intendedApprover
          ? `Raised by ${p.approval.author}, routed to ${p.approval.intendedApprover}`
          : `Raised by ${p.approval?.author ?? "someone"}, not routed to anyone in particular`,
        href: "/payments",
        tone: "warning",
      });
    }
  }

  for (const q of state.quotations) {
    if (q.status === "for_approval") {
      out.push({
        id: `qapprove-${q.id}`,
        title: `${piRef(q.id, q.revisionNo)} awaiting approval`,
        detail: `Drafted by ${q.assignedSalesperson}`,
        href: `/quotations/${q.id}`,
        tone: "warning",
      });
    }
    // Only quotations actually out with a customer can lapse. A draft has no validity to run out.
    const live = q.status === "sent" || q.status === "under_negotiation";
    if (live && q.validityDate && q.validityDate < today) {
      out.push({
        id: `expired-${q.id}`,
        title: `${piRef(q.id, q.revisionNo)} has passed its validity`,
        detail: `Valid until ${q.validityDate}. Re-issue it or close it off.`,
        href: `/quotations/${q.id}`,
        tone: "warning",
      });
    }
  }

  for (const i of state.inspections) {
    if (i.result === "pending") {
      out.push({
        id: `inspect-${i.id}`,
        title: `${i.salesOrderId} is waiting on inspection`,
        detail: "The goods are packed. Nothing invoices or ships until they pass.",
        href: "/inspection",
        tone: "info",
      });
    }
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
