import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import type { ApprovalRequest } from "@/lib/types";

export function ApprovalsInbox() {
  const { approvals, resolveApproval, pushToast, customers: CUSTOMERS } = useStore();
  const [target, setTarget] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | "returned">("approved");

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  function confirm() {
    if (!target) return;
    resolveApproval(target.id, decision);
    pushToast({
      tone: decision === "approved" ? "success" : decision === "rejected" ? "danger" : "warning",
      title: `Request ${decision}`,
      description: `${target.type} · ${target.referenceId}`,
    });
    setTarget(null);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Approval Workflow"
        title="Approvals"
        description="Sign-offs required across the quotation-to-invoice cycle: PI approval, discounts, and payment clearance."
      />

      {pending.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Inbox is clear" description="No approvals pending your review." />
      ) : (
        <Table>
          <THead>
            <TH>Type</TH>
            <TH>Reference</TH>
            <TH>Customer</TH>
            <TH>Requested By</TH>
            <TH>Due</TH>
            <TH>Level</TH>
            <TH>Reason</TH>
            <TH>Action</TH>
          </THead>
          <tbody>
            {pending.map((a) => {
              const customer = CUSTOMERS.find((c) => c.id === a.customerId);
              return (
                <TR key={a.id}>
                  <TD className="text-xs font-medium">{a.type}</TD>
                  <TD className="font-mono text-xs font-semibold text-pine-800">{a.referenceId}</TD>
                  <TD className="text-xs">{customer?.name}</TD>
                  <TD className="text-xs">{a.requestedBy}</TD>
                  <TD className="font-mono text-xs">{formatDate(a.dueDate)}</TD>
                  <TD className="text-xs">{a.level}</TD>
                  <TD className="max-w-xs text-xs text-paper-500">{a.reason}</TD>
                  <TD>
                    <Button variant="primary" size="sm" onClick={() => { setTarget(a); setDecision("approved"); }}>
                      Review
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      {resolved.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-400">Recently resolved</p>
          <Table>
            <THead>
              <TH>Type</TH>
              <TH>Reference</TH>
              <TH>Requested By</TH>
              <TH>Status</TH>
            </THead>
            <tbody>
              {resolved.map((a) => (
                <TR key={a.id}>
                  <TD className="text-xs">{a.type}</TD>
                  <TD className="font-mono text-xs">{a.referenceId}</TD>
                  <TD className="text-xs">{a.requestedBy}</TD>
                  <TD>
                    <Badge status={a.status} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`${target?.type}: ${target?.referenceId}`}
        subtitle={target?.reason}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === "approved" ? "success" : decision === "rejected" ? "danger" : "secondary"}
              size="sm"
              onClick={confirm}
            >
              Confirm {decision === "approved" ? "Approval" : decision === "rejected" ? "Rejection" : "Return"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {(["approved", "returned", "rejected"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDecision(d)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                decision === d ? "border-pine-700 bg-pine-700 text-white" : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              }`}
            >
              {d === "approved" ? "Approve" : d === "rejected" ? "Reject" : "Return for revision"}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
