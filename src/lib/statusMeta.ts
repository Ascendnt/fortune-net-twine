export type Tone = "pine" | "manifest" | "amber" | "alert" | "neutral";

export interface StatusMeta {
  label: string;
  tone: Tone;
  stamp?: boolean;
}

const map: Record<string, StatusMeta> = {
  // Quotation
  draft: { label: "Draft", tone: "neutral" },
  for_approval: { label: "For Approval", tone: "amber" },
  approved: { label: "Approved", tone: "pine", stamp: true },
  sent: { label: "Sent to Customer", tone: "manifest" },
  under_negotiation: { label: "Under Negotiation", tone: "amber" },
  accepted: { label: "Accepted", tone: "pine", stamp: true },
  rejected: { label: "Rejected", tone: "alert", stamp: true },
  expired: { label: "Expired", tone: "alert" },
  revised: { label: "Revised", tone: "manifest" },

  // Stage status
  completed: { label: "Completed", tone: "pine" },
  in_progress: { label: "In Progress", tone: "manifest" },
  blocked: { label: "Blocked", tone: "alert" },
  pending: { label: "Pending", tone: "amber" },

  // Production
  pending_scheduling: { label: "Pending Scheduling", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "manifest" },
  materials_pending: { label: "Materials Pending", tone: "amber" },
  in_production: { label: "In Production", tone: "manifest" },
  partially_completed: { label: "Partially Completed", tone: "amber" },
  on_hold: { label: "On Hold", tone: "alert" },
  cancelled: { label: "Cancelled", tone: "alert" },
  not_started: { label: "Not Started", tone: "neutral" },

  // Payments
  expected: { label: "Expected", tone: "neutral" },
  submitted_for_verification: { label: "Submitted for Verification", tone: "amber" },
  partially_paid: { label: "Partially Paid", tone: "amber" },
  verified: { label: "Verified", tone: "pine", stamp: true },
  overdue: { label: "Overdue", tone: "alert" },

  // Invoices
  issued: { label: "Issued", tone: "manifest" },
  paid: { label: "Paid", tone: "pine", stamp: true },

  // Documents
  approved_doc: { label: "Approved", tone: "pine" },
  "n/a": { label: "N/A", tone: "neutral" },

  // Approvals
  returned: { label: "Returned for Revision", tone: "amber" },

  // Priority
  standard: { label: "Standard", tone: "neutral" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "alert" },

  // Generic allowed/blocked
  allowed: { label: "Allowed", tone: "pine" },
};

export function getStatusMeta(status: string): StatusMeta {
  return map[status] ?? { label: status, tone: "neutral" };
}

export const toneClasses: Record<Tone, { bg: string; text: string; border: string; dot: string }> = {
  pine: { bg: "bg-pine-50", text: "text-pine-700", border: "border-pine-200", dot: "bg-pine-600" },
  manifest: { bg: "bg-manifest-50", text: "text-manifest-700", border: "border-manifest-200", dot: "bg-manifest-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-600" },
  alert: { bg: "bg-alert-50", text: "text-alert-700", border: "border-alert-200", dot: "bg-alert-600" },
  neutral: { bg: "bg-paper-100", text: "text-paper-600", border: "border-paper-300", dot: "bg-paper-400" },
};
