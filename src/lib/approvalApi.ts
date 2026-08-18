import { getToken } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type RoutingMode = "linear" | "graph";
export type NodeType = "start" | "approver" | "end";

export interface ApiApprovalStep {
  id: number;
  sequence: number;
  name: string;
  approver_role_id: number;
  is_required: boolean;
}

export interface ApiWorkflowNode {
  id: number;
  node_type: NodeType;
  role_id: number | null;
  user_id: number | null;
  label: string | null;
  pos_x: number;
  pos_y: number;
}

export interface ApiWorkflowEdge {
  id: number;
  from_node_id: number;
  to_node_id: number;
}

export interface ApiWorkflowAssignment {
  id: number;
  approval_workflow_id: number;
  workflow_name: string;
  applies_to_type: "role" | "user";
  applies_to_id: number;
  record_type: string;
}

export interface ApiApprovalWorkflow {
  id: number;
  name: string;
  applies_to: string;
  routing_mode: RoutingMode;
  is_active: boolean;
  steps: ApiApprovalStep[];
  nodes: ApiWorkflowNode[];
  edges: ApiWorkflowEdge[];
  assignments: ApiWorkflowAssignment[];
}

async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body.errors) {
      const first = Object.values(body.errors)[0];
      return Array.isArray(first) ? String(first[0]) : String(first);
    }
    return body.message ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

// ---------------- Workflows ----------------

export async function fetchWorkflows(): Promise<ApiApprovalWorkflow[]> {
  const res = await authedFetch("/api/approval-workflows");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function createWorkflow(
  name: string,
  appliesTo: string,
  routingMode: RoutingMode
): Promise<ApiApprovalWorkflow> {
  const res = await authedFetch("/api/approval-workflows", {
    method: "POST",
    body: JSON.stringify({ name, applies_to: appliesTo, routing_mode: routingMode }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function updateWorkflow(
  id: number,
  patch: Partial<{ name: string; applies_to: string; is_active: boolean }>
): Promise<ApiApprovalWorkflow> {
  const res = await authedFetch(`/api/approval-workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function deleteWorkflow(id: number): Promise<void> {
  const res = await authedFetch(`/api/approval-workflows/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

// ---------------- Linear steps ----------------

export async function addStep(
  workflowId: number,
  name: string,
  approverRoleId: number
): Promise<ApiApprovalStep> {
  const res = await authedFetch(`/api/approval-workflows/${workflowId}/steps`, {
    method: "POST",
    body: JSON.stringify({ name, approver_role_id: approverRoleId }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function updateStep(
  workflowId: number,
  stepId: number,
  patch: Partial<{ name: string; approver_role_id: number; is_required: boolean }>
): Promise<ApiApprovalStep> {
  const res = await authedFetch(`/api/approval-workflows/${workflowId}/steps/${stepId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function removeStep(workflowId: number, stepId: number): Promise<void> {
  const res = await authedFetch(`/api/approval-workflows/${workflowId}/steps/${stepId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

// ---------------- Graph (nodes/edges) ----------------

export interface GraphSaveNode {
  client_id: string;
  node_type: NodeType;
  role_id: number | null;
  user_id: number | null;
  label: string;
  pos_x: number;
  pos_y: number;
}
export interface GraphSaveEdge {
  from_client_id: string;
  to_client_id: string;
}

export async function validateGraph(
  workflowId: number,
  nodes: GraphSaveNode[],
  edges: GraphSaveEdge[]
): Promise<string[]> {
  const res = await authedFetch(`/api/approval-workflows/${workflowId}/graph/validate`, {
    method: "POST",
    body: JSON.stringify({ nodes, edges }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const body = await res.json();
  return body.problems as string[];
}

export async function saveGraph(
  workflowId: number,
  nodes: GraphSaveNode[],
  edges: GraphSaveEdge[]
): Promise<{ nodes: ApiWorkflowNode[]; edges: ApiWorkflowEdge[] } | { problems: string[] }> {
  const res = await authedFetch(`/api/approval-workflows/${workflowId}/graph`, {
    method: "POST",
    body: JSON.stringify({ nodes, edges }),
  });
  const body = await res.json();
  if (res.status === 422) return { problems: body.problems as string[] };
  if (!res.ok) throw new Error(body.message ?? "Something went wrong.");
  return body;
}

// ---------------- Workflow assignments ----------------

export async function fetchAssignments(): Promise<ApiWorkflowAssignment[]> {
  const res = await authedFetch("/api/workflow-assignments");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function addAssignment(
  workflowId: number,
  appliesToType: "role" | "user",
  appliesToId: number,
  recordType: string
): Promise<ApiWorkflowAssignment> {
  const res = await authedFetch("/api/workflow-assignments", {
    method: "POST",
    body: JSON.stringify({
      approval_workflow_id: workflowId,
      applies_to_type: appliesToType,
      applies_to_id: appliesToId,
      record_type: recordType,
    }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function removeAssignment(id: number): Promise<void> {
  const res = await authedFetch(`/api/workflow-assignments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}
