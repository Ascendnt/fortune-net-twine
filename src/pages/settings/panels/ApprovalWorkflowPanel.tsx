import { useEffect, useState } from "react";
import { AlertTriangle, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/AuthContext";
import { fetchRoles, type ApiRole } from "@/lib/rbacApi";
import {
  addAssignment,
  addStep,
  createWorkflow,
  deleteWorkflow,
  fetchAssignments,
  fetchWorkflows,
  removeAssignment,
  removeStep,
  saveGraph,
  updateStep,
  updateWorkflow,
  validateGraph,
  type ApiApprovalWorkflow,
  type ApiWorkflowAssignment,
  type GraphSaveEdge,
  type GraphSaveNode,
  type RoutingMode,
} from "@/lib/approvalApi";
import { GraphWorkflowBuilder } from "./GraphWorkflowBuilder";
import type { WorkflowEdgeDef, WorkflowNodeDef } from "@/lib/approvalData";

const APPLIES_TO_OPTIONS = [
  { value: "quotation", label: "Quotation" },
  { value: "payment", label: "Payment" },
  { value: "shipment_loading", label: "Shipment Loading" },
  { value: "sales_order", label: "Sales Order" },
];

function roleHasReviewPermission(roleId: number, roles: ApiRole[]): boolean {
  const role = roles.find((r) => r.id === roleId);
  return role ? role.permission_codes.includes("approvals.review") : true;
}

/**
 * Real backend now, both routing modes. Linear steps persist immediately
 * per action (add/edit/remove each call their own endpoint), matching how
 * Roles & Permissions already behaves. Graph mode uses an explicit
 * Save/Validate flow instead — dragging dots around on every pixel isn't
 * something to auto-save, and the graph's full-replace save semantics
 * (see approvalApi.ts) mean a save always returns a fresh node/edge set
 * that replaces local state entirely.
 *
 * RBAC and Approval Workflow stay deliberately decoupled: binding a role
 * with no `approvals.review` permission is a warning, never a blocking
 * error, here or on the backend (WorkflowGraphValidator doesn't check
 * permissions at all — see its docblock).
 */
export function ApprovalWorkflowPanel() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("users.manage");

  const [workflows, setWorkflows] = useState<ApiApprovalWorkflow[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [assignments, setAssignments] = useState<ApiWorkflowAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Local, editable graph state per workflow — only diverges from the
  // server once the admin starts dragging; reset to server state after
  // every save (see handleSaveGraph).
  const [graphDrafts, setGraphDrafts] = useState<Record<number, { nodes: WorkflowNodeDef[]; edges: WorkflowEdgeDef[] }>>({});
  const [graphProblems, setGraphProblems] = useState<Record<number, string[]>>({});
  const [savingGraph, setSavingGraph] = useState<number | null>(null);
  const [graphSavedFlash, setGraphSavedFlash] = useState<number | null>(null);

  const [showAddWorkflow, setShowAddWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowAppliesTo, setNewWorkflowAppliesTo] = useState(APPLIES_TO_OPTIONS[0].value);
  const [newWorkflowMode, setNewWorkflowMode] = useState<RoutingMode>("linear");
  const [addingWorkflow, setAddingWorkflow] = useState(false);
  const [confirmDeleteWorkflow, setConfirmDeleteWorkflow] = useState<ApiApprovalWorkflow | null>(null);

  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    workflowId: 0,
    appliesToType: "role" as "role" | "user",
    appliesToId: 0,
    recordType: APPLIES_TO_OPTIONS[0].value,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchWorkflows(), fetchRoles(), fetchAssignments()])
      .then(([workflowsRes, rolesRes, assignmentsRes]) => {
        if (cancelled) return;
        setWorkflows(workflowsRes);
        setRoles(rolesRes);
        setAssignments(assignmentsRes);
        setNewAssignment((prev) => ({
          ...prev,
          workflowId: workflowsRes[0]?.id ?? 0,
          appliesToId: rolesRes[0]?.id ?? 0,
        }));
        const drafts: typeof graphDrafts = {};
        for (const w of workflowsRes) {
          if (w.routing_mode === "graph") {
            drafts[w.id] = {
              nodes: w.nodes.map((n) => ({
                id: String(n.id),
                nodeType: n.node_type,
                roleId: n.role_id !== null ? String(n.role_id) : null,
                userId: n.user_id !== null ? String(n.user_id) : null,
                label: n.label ?? "",
                posX: n.pos_x,
                posY: n.pos_y,
              })),
              edges: w.edges.map((e) => ({ id: String(e.id), fromNodeId: String(e.from_node_id), toNodeId: String(e.to_node_id) })),
            };
          }
        }
        setGraphDrafts(drafts);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------- Workflow CRUD ----------------
  async function handleAddWorkflow() {
    const name = newWorkflowName.trim();
    if (!name) return;
    setAddingWorkflow(true);
    setActionError(null);
    try {
      const workflow = await createWorkflow(name, newWorkflowAppliesTo, newWorkflowMode);
      setWorkflows((prev) => [...prev, workflow]);
      if (workflow.routing_mode === "graph") {
        setGraphDrafts((prev) => ({
          ...prev,
          [workflow.id]: {
            nodes: workflow.nodes.map((n) => ({
              id: String(n.id),
              nodeType: n.node_type,
              roleId: n.role_id !== null ? String(n.role_id) : null,
              userId: n.user_id !== null ? String(n.user_id) : null,
              label: n.label ?? "",
              posX: n.pos_x,
              posY: n.pos_y,
            })),
            edges: workflow.edges.map((e) => ({ id: String(e.id), fromNodeId: String(e.from_node_id), toNodeId: String(e.to_node_id) })),
          },
        }));
      }
      setNewWorkflowName("");
      setShowAddWorkflow(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't create that workflow.");
    } finally {
      setAddingWorkflow(false);
    }
  }

  async function toggleActive(workflow: ApiApprovalWorkflow) {
    setActionError(null);
    try {
      const updated = await updateWorkflow(workflow.id, { is_active: !workflow.is_active });
      setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't update that workflow.");
    }
  }

  async function handleDeleteWorkflow(workflow: ApiApprovalWorkflow) {
    try {
      await deleteWorkflow(workflow.id);
      setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
      setAssignments((prev) => prev.filter((a) => a.approval_workflow_id !== workflow.id));
      setConfirmDeleteWorkflow(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete that workflow.");
    }
  }

  // ---------------- Linear steps — persist immediately per action ----------------
  async function handleAddStep(workflow: ApiApprovalWorkflow) {
    try {
      const step = await addStep(workflow.id, `Step ${workflow.steps.length + 1}`, roles[0]?.id ?? 0);
      setWorkflows((prev) => prev.map((w) => (w.id === workflow.id ? { ...w, steps: [...w.steps, step] } : w)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't add that step.");
    }
  }

  async function handleUpdateStep(workflow: ApiApprovalWorkflow, stepId: number, patch: Partial<{ name: string; approver_role_id: number; is_required: boolean }>) {
    try {
      const updated = await updateStep(workflow.id, stepId, patch);
      setWorkflows((prev) =>
        prev.map((w) => (w.id !== workflow.id ? w : { ...w, steps: w.steps.map((s) => (s.id === stepId ? updated : s)) }))
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that step.");
    }
  }

  async function handleRemoveStep(workflow: ApiApprovalWorkflow, stepId: number) {
    try {
      await removeStep(workflow.id, stepId);
      setWorkflows((prev) =>
        prev.map((w) => (w.id !== workflow.id ? w : { ...w, steps: w.steps.filter((s) => s.id !== stepId) }))
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't remove that step.");
    }
  }

  // ---------------- Graph mode — explicit Save, live Validate ----------------
  function updateGraphDraft(workflowId: number, nodes: WorkflowNodeDef[], edges: WorkflowEdgeDef[]) {
    setGraphDrafts((prev) => ({ ...prev, [workflowId]: { nodes, edges } }));
    // Live validation on every edit, mirroring the CI4 reference's
    // disable-Save-until-clean behavior — but this is a live SERVER check
    // (the backend is the actual authority), not just the client-side mirror.
    const graphNodes: GraphSaveNode[] = nodes.map((n) => ({
      client_id: n.id,
      node_type: n.nodeType,
      role_id: n.roleId ? Number(n.roleId) : null,
      user_id: n.userId ? Number(n.userId) : null,
      label: n.label,
      pos_x: n.posX,
      pos_y: n.posY,
    }));
    const graphEdges: GraphSaveEdge[] = edges.map((e) => ({ from_client_id: e.fromNodeId, to_client_id: e.toNodeId }));
    validateGraph(workflowId, graphNodes, graphEdges)
      .then((problems) => setGraphProblems((prev) => ({ ...prev, [workflowId]: problems })))
      .catch(() => {
        /* validation call failing shouldn't block editing — Save will re-check anyway */
      });
  }

  async function handleSaveGraph(workflow: ApiApprovalWorkflow) {
    const draft = graphDrafts[workflow.id];
    if (!draft) return;
    setSavingGraph(workflow.id);
    setActionError(null);
    try {
      const graphNodes: GraphSaveNode[] = draft.nodes.map((n) => ({
        client_id: n.id,
        node_type: n.nodeType,
        role_id: n.roleId ? Number(n.roleId) : null,
        user_id: n.userId ? Number(n.userId) : null,
        label: n.label,
        pos_x: n.posX,
        pos_y: n.posY,
      }));
      const graphEdges: GraphSaveEdge[] = draft.edges.map((e) => ({ from_client_id: e.fromNodeId, to_client_id: e.toNodeId }));

      const result = await saveGraph(workflow.id, graphNodes, graphEdges);
      if ("problems" in result) {
        setGraphProblems((prev) => ({ ...prev, [workflow.id]: result.problems }));
        return;
      }
      // Full-replace save returns fresh IDs — resync local draft to match,
      // otherwise the next edit's edges would reference IDs that no longer exist.
      setGraphDrafts((prev) => ({
        ...prev,
        [workflow.id]: {
          nodes: result.nodes.map((n) => ({
            id: String(n.id),
            nodeType: n.node_type,
            roleId: n.role_id !== null ? String(n.role_id) : null,
            userId: n.user_id !== null ? String(n.user_id) : null,
            label: n.label ?? "",
            posX: n.pos_x,
            posY: n.pos_y,
          })),
          edges: result.edges.map((e) => ({ id: String(e.id), fromNodeId: String(e.from_node_id), toNodeId: String(e.to_node_id) })),
        },
      }));
      setGraphProblems((prev) => ({ ...prev, [workflow.id]: [] }));
      setGraphSavedFlash(workflow.id);
      setTimeout(() => setGraphSavedFlash((cur) => (cur === workflow.id ? null : cur)), 2000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that graph.");
    } finally {
      setSavingGraph(null);
    }
  }

  // ---------------- Assignments ----------------
  async function handleAddAssignment() {
    try {
      const created = await addAssignment(
        newAssignment.workflowId,
        newAssignment.appliesToType,
        newAssignment.appliesToId,
        newAssignment.recordType
      );
      setAssignments((prev) => [...prev, created]);
      setShowAddAssignment(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't add that rule.");
    }
  }

  async function handleRemoveAssignment(id: number) {
    try {
      await removeAssignment(id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't remove that rule.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-paper-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading approval workflows…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-3 text-alert-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
        <div>
          <p className="text-sm font-medium">Couldn't load approval workflows</p>
          <p className="text-xs text-alert-700">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!canManage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs">
            You don't hold <code className="font-mono">users.manage</code> — you can view workflows here, but changes
            are disabled.
          </p>
        </div>
      )}
      {actionError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-2.5 text-alert-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
          <p className="text-xs">{actionError}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-paper-500">
          Each workflow routes approvals either as an ordered list (Linear) or a visual graph (Graph). Attach it to
          requesters via Workflow Assignments below — this applies to every module, not just one.
        </p>
        {canManage && (
          <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowAddWorkflow(true)}>
            Add Workflow
          </Button>
        )}
      </div>

      {workflows.map((workflow) => {
        const draft = graphDrafts[workflow.id] ?? { nodes: [], edges: [] };
        const problems = graphProblems[workflow.id] ?? [];
        return (
          <Card key={workflow.id}>
            <CardHeader
              title={workflow.name}
              eyebrow={`Applies to · ${APPLIES_TO_OPTIONS.find((o) => o.value === workflow.applies_to)?.label ?? workflow.applies_to} · ${workflow.routing_mode}`}
              action={
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-paper-500">
                    <input
                      type="checkbox"
                      checked={workflow.is_active}
                      disabled={!canManage}
                      onChange={() => toggleActive(workflow)}
                      className="h-3.5 w-3.5 rounded border-paper-300 text-pine-600 focus:ring-2 focus:ring-manifest-100"
                    />
                    Active
                  </label>
                  {canManage && (
                    <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDeleteWorkflow(workflow)}>
                      Delete
                    </Button>
                  )}
                </div>
              }
            />

            {workflow.routing_mode === "linear" ? (
              <div className="space-y-2">
                {workflow.steps.length === 0 && (
                  <p className="rounded-lg border border-dashed border-paper-200 px-3 py-3 text-center text-xs text-paper-400">
                    No steps yet — this workflow won't block anything until at least one is added.
                  </p>
                )}
                {workflow.steps
                  .slice()
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((step) => (
                    <div key={step.id} className="flex flex-col gap-2 rounded-lg bg-paper-50 px-3 py-2.5 sm:flex-row sm:items-center">
                      <GripVertical className="hidden h-4 w-4 shrink-0 text-paper-300 sm:block" />
                      <span className="w-6 shrink-0 font-mono text-xs text-paper-400">{step.sequence}</span>
                      <input
                        value={step.name}
                        disabled={!canManage}
                        onChange={(e) => handleUpdateStep(workflow, step.id, { name: e.target.value })}
                        className="min-w-0 flex-1 rounded-md border border-paper-200 bg-white px-2.5 py-1.5 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100 disabled:opacity-60"
                      />
                      <div className="flex flex-col">
                        <select
                          value={step.approver_role_id}
                          disabled={!canManage}
                          onChange={(e) => handleUpdateStep(workflow, step.id, { approver_role_id: Number(e.target.value) })}
                          className="rounded-md border border-paper-200 bg-white px-2.5 py-1.5 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100 disabled:opacity-60"
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        {!roleHasReviewPermission(step.approver_role_id, roles) && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700">
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> No review permission yet
                          </span>
                        )}
                      </div>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-paper-500">
                        <input
                          type="checkbox"
                          checked={step.is_required}
                          disabled={!canManage}
                          onChange={(e) => handleUpdateStep(workflow, step.id, { is_required: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-paper-300 text-pine-600 focus:ring-2 focus:ring-manifest-100"
                        />
                        Required
                      </label>
                      {canManage && (
                        <button
                          onClick={() => handleRemoveStep(workflow, step.id)}
                          className="shrink-0 rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                          aria-label={`Remove step ${step.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                {canManage && (
                  <button
                    onClick={() => handleAddStep(workflow)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-paper-300 py-1.5 text-[11px] font-medium text-paper-500 hover:border-manifest-400 hover:text-manifest-700"
                  >
                    <Plus className="h-3 w-3" /> Add step
                  </button>
                )}
              </div>
            ) : (
              <div>
                <GraphWorkflowBuilder
                  nodes={draft.nodes}
                  edges={draft.edges}
                  problems={problems}
                  roles={roles}
                  onChange={(nodes, edges) => updateGraphDraft(workflow.id, nodes, edges)}
                />
                {canManage && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={problems.length > 0 || savingGraph === workflow.id}
                      onClick={() => handleSaveGraph(workflow)}
                    >
                      {savingGraph === workflow.id ? "Saving…" : "Save Graph"}
                    </Button>
                    {graphSavedFlash === workflow.id && <span className="text-xs text-manifest-700">Saved.</span>}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <Card>
        <CardHeader
          title="Workflow Assignments"
          eyebrow="Routes by requester"
          subtitle="Resolves WHICH workflow a request uses based on who's submitting it — a rule aimed at a specific person wins over a rule aimed at their role. No matching rule means the request auto-approves."
          action={
            canManage ? (
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowAddAssignment(true)}>
                Add Rule
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-1.5">
          {assignments.length === 0 && (
            <p className="rounded-lg border border-dashed border-paper-200 px-3 py-3 text-center text-xs text-paper-400">
              No assignment rules yet — every request of every type will auto-approve until at least one is added.
            </p>
          )}
          {assignments.map((a) => {
            const target = a.applies_to_type === "role" ? roles.find((r) => r.id === a.applies_to_id)?.name : `User #${a.applies_to_id}`;
            const recordLabel = APPLIES_TO_OPTIONS.find((o) => o.value === a.record_type)?.label ?? a.record_type;
            return (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper-50 px-3 py-2 text-sm">
                <span className="text-paper-700">
                  <strong>{recordLabel}</strong> requests from{" "}
                  <span className="rounded bg-white px-1.5 py-0.5 text-xs border border-paper-200">
                    {a.applies_to_type === "role" ? "role" : "person"}: {target}
                  </span>{" "}
                  route through <strong>{a.workflow_name}</strong>
                </span>
                {canManage && (
                  <button onClick={() => handleRemoveAssignment(a.id)} className="shrink-0 rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600" aria-label="Remove rule">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Modal
        open={showAddWorkflow}
        onClose={() => setShowAddWorkflow(false)}
        title="Add an approval workflow"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAddWorkflow(false)} disabled={addingWorkflow}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddWorkflow} disabled={addingWorkflow}>
              {addingWorkflow ? "Adding…" : "Add workflow"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Workflow name</label>
            <input
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              placeholder="e.g. Large Order Sign-off"
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Applies to</label>
            <select
              value={newWorkflowAppliesTo}
              onChange={(e) => setNewWorkflowAppliesTo(e.target.value)}
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
            >
              {APPLIES_TO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Routing mode</label>
            <div className="inline-flex rounded-lg border border-paper-200 bg-paper-50 p-0.5">
              {(["linear", "graph"] as RoutingMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setNewWorkflowMode(mode)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    newWorkflowMode === mode ? "bg-white text-pine-700 shadow-sm" : "text-paper-500"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDeleteWorkflow !== null}
        onClose={() => setConfirmDeleteWorkflow(null)}
        title={`Delete "${confirmDeleteWorkflow?.name}"?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteWorkflow(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => confirmDeleteWorkflow && handleDeleteWorkflow(confirmDeleteWorkflow)}>
              Delete workflow
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Records already mid-approval under this workflow keep their existing approval history. Any Workflow
          Assignment rules pointing at this workflow are removed too.
        </p>
      </Modal>

      <Modal
        open={showAddAssignment}
        onClose={() => setShowAddAssignment(false)}
        title="Add a workflow assignment rule"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAddAssignment(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddAssignment}>
              Add rule
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Record type</label>
            <select
              value={newAssignment.recordType}
              onChange={(e) => setNewAssignment({ ...newAssignment, recordType: e.target.value })}
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
            >
              {APPLIES_TO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Applies to</label>
            <div className="mb-1.5 inline-flex rounded-lg border border-paper-200 bg-paper-50 p-0.5">
              {(["role", "user"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewAssignment({ ...newAssignment, appliesToType: t })}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    newAssignment.appliesToType === t ? "bg-white text-pine-700 shadow-sm" : "text-paper-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {newAssignment.appliesToType === "role" ? (
              <select
                value={newAssignment.appliesToId}
                onChange={(e) => setNewAssignment({ ...newAssignment, appliesToId: Number(e.target.value) })}
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                value={newAssignment.appliesToId || ""}
                onChange={(e) => setNewAssignment({ ...newAssignment, appliesToId: Number(e.target.value) })}
                placeholder="User ID"
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Route through</label>
            <select
              value={newAssignment.workflowId}
              onChange={(e) => setNewAssignment({ ...newAssignment, workflowId: Number(e.target.value) })}
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
