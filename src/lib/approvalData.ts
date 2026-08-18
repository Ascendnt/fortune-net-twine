// Extends the original approvalData.ts with the graph ("connect the dot")
// routing mode, ported from the ci4-approval-workflow reference project,
// plus workflow_assignments — kept regardless of mode since it fills a real
// gap (routing by WHO is requesting, not just what's being approved).

export type RoutingMode = "linear" | "graph";
export type NodeType = "start" | "approver" | "end";

export interface ApprovalStepDef {
  id: string;
  sequence: number;
  name: string;
  approverRoleId: string;
  required: boolean;
}

export interface WorkflowNodeDef {
  id: string; // client-generated id until saved
  nodeType: NodeType;
  roleId: string | null; // approver bound to a role...
  userId: string | null; // ...OR a specific person, never both
  label: string;
  posX: number;
  posY: number;
}

export interface WorkflowEdgeDef {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface ApprovalWorkflowDef {
  id: string;
  name: string;
  appliesTo: string;
  active: boolean;
  routingMode: RoutingMode;
  // Linear mode
  steps: ApprovalStepDef[];
  // Graph mode
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
}

/** Resolves which workflow applies to a given requester (role or specific person) for a record type. */
export interface WorkflowAssignmentDef {
  id: string;
  workflowId: string;
  appliesToType: "role" | "user";
  appliesToId: string; // a RoleGrant.id, or a mock user id/name
  recordType: string;
}

export const APPLIES_TO_OPTIONS: { value: string; label: string }[] = [
  { value: "quotation", label: "Quotation" },
  { value: "payment", label: "Payment" },
  { value: "shipment_loading", label: "Shipment Loading" },
  { value: "sales_order", label: "Sales Order" },
];

export const INITIAL_APPROVAL_WORKFLOWS: ApprovalWorkflowDef[] = [
  {
    id: "pi-approval",
    name: "PI Approval",
    appliesTo: "quotation",
    active: true,
    routingMode: "linear",
    steps: [
      {
        id: "pi-approval-1",
        sequence: 1,
        name: "Sales Manager Sign-off",
        approverRoleId: "sales-manager",
        required: true,
      },
    ],
    nodes: [],
    edges: [],
  },
  {
    id: "payment-clearance",
    name: "Payment Clearance",
    appliesTo: "payment",
    active: true,
    routingMode: "linear",
    steps: [
      {
        id: "payment-clearance-1",
        sequence: 1,
        name: "Finance Verification",
        approverRoleId: "finance-accounting",
        required: true,
      },
    ],
    nodes: [],
    edges: [],
  },
  {
    id: "loading-authorization",
    name: "Loading Authorization",
    appliesTo: "shipment_loading",
    active: true,
    // Demonstrates the graph mode out of the box: Logistics Check ->
    // Management Clearance, drawn as dots and a line rather than a list.
    routingMode: "graph",
    steps: [],
    nodes: [
      { id: "n-start", nodeType: "start", roleId: null, userId: null, label: "Start", posX: 60, posY: 140 },
      {
        id: "n-logistics",
        nodeType: "approver",
        roleId: "exportation-logistics",
        userId: null,
        label: "Logistics Check",
        posX: 280,
        posY: 80,
      },
      {
        id: "n-management",
        nodeType: "approver",
        roleId: "management",
        userId: null,
        label: "Management Clearance",
        posX: 500,
        posY: 200,
      },
      { id: "n-end", nodeType: "end", roleId: null, userId: null, label: "End", posX: 720, posY: 140 },
    ],
    edges: [
      { id: "e1", fromNodeId: "n-start", toNodeId: "n-logistics" },
      { id: "e2", fromNodeId: "n-logistics", toNodeId: "n-management" },
      { id: "e3", fromNodeId: "n-management", toNodeId: "n-end" },
    ],
  },
];

export const INITIAL_WORKFLOW_ASSIGNMENTS: WorkflowAssignmentDef[] = [
  { id: "wa-1", workflowId: "pi-approval", appliesToType: "role", appliesToId: "sales-representative", recordType: "quotation" },
  { id: "wa-2", workflowId: "payment-clearance", appliesToType: "role", appliesToId: "sales-representative", recordType: "payment" },
  { id: "wa-3", workflowId: "loading-authorization", appliesToType: "role", appliesToId: "exportation-logistics", recordType: "shipment_loading" },
];
