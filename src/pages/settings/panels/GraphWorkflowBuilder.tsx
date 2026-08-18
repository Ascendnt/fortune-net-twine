import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ApiRole } from "@/lib/rbacApi";
import type { NodeType, WorkflowEdgeDef, WorkflowNodeDef } from "@/lib/approvalData";

const NODE_W = 168;
const NODE_H = 56;
const CANVAS_H = 420;

/**
 * Purely informational — a role bound here without this permission will
 * still work exactly as designed (RBAC and Approval Workflow stay
 * decoupled; the engine resolves approvers by role membership alone, see
 * WorkflowEngine::resolveRoleApprover()). This just tells the admin
 * building the workflow that the assigned person may not see it in their
 * own Approvals queue yet without it — never blocks saving.
 */
function roleLacksReviewPermission(roleId: string | null, roles: ApiRole[]): boolean {
  if (!roleId) return false;
  const role = roles.find((r) => String(r.id) === roleId);
  return role ? !role.permission_codes.includes("approvals.review") : false;
}

function nodeColor(type: NodeType, invalid: boolean) {
  if (invalid) return { fill: "#FBEAEA", border: "#D97A6E", text: "#8A3B2E" }; // alert tones
  if (type === "start") return { fill: "#E6F4EA", border: "#4E9A63", text: "#1E5C31" }; // green
  if (type === "end") return { fill: "#EDEBFA", border: "#8B7FD1", text: "#4A3F91" }; // muted violet
  return { fill: "#E7F4F3", border: "#3FA79E", text: "#0E5F58" }; // manifest teal — approver
}

/**
 * Ported from ci4-approval-workflow's app/Views/workflow/builder.php, adapted
 * to React state instead of direct DOM manipulation. Same interaction model:
 * drag a dot's body to reposition it, drag from its small handle to draw a
 * live connection, release over another dot to connect (anywhere else to
 * cancel), click a line to delete just that connection.
 */
export function GraphWorkflowBuilder({
  nodes,
  edges,
  problems,
  roles,
  onChange,
}: {
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
  problems: string[];
  roles: ApiRole[];
  onChange: (nodes: WorkflowNodeDef[], edges: WorkflowEdgeDef[]) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const invalidNodeIds = new Set<string>();
  for (const n of nodes) {
    const out = edges.filter((e) => e.fromNodeId === n.id).length;
    const inc = edges.filter((e) => e.toNodeId === n.id).length;
    if (out === 0 && inc === 0) invalidNodeIds.add(n.id);
    if ((n.nodeType === "start" || n.nodeType === "approver") && out === 0) invalidNodeIds.add(n.id);
    if ((n.nodeType === "approver" || n.nodeType === "end") && inc === 0) invalidNodeIds.add(n.id);
    if (n.nodeType === "approver" && !n.roleId && !n.userId) invalidNodeIds.add(n.id);
  }

  function canvasPoint(e: ReactMouseEvent | MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function startDragNode(id: string) {
    return (e: ReactMouseEvent) => {
      e.stopPropagation();
      setDraggingNodeId(id);
      const onMove = (ev: MouseEvent) => {
        const p = canvasPoint(ev);
        onChange(
          nodes.map((n) =>
            n.id === id
              ? { ...n, posX: Math.max(0, p.x - NODE_W / 2), posY: Math.max(0, p.y - NODE_H / 2) }
              : n
          ),
          edges
        );
      };
      const onUp = () => {
        setDraggingNodeId(null);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }

  function startConnect(id: string) {
    return (e: ReactMouseEvent) => {
      e.stopPropagation();
      setConnectingFromId(id);
      const onMove = (ev: MouseEvent) => setCursor(canvasPoint(ev));
      const onUp = (ev: MouseEvent) => {
        const p = canvasPoint(ev);
        const target = nodes.find(
          (n) => p.x >= n.posX && p.x <= n.posX + NODE_W && p.y >= n.posY && p.y <= n.posY + NODE_H
        );
        if (target && target.id !== id) {
          const exists = edges.some((ed) => ed.fromNodeId === id && ed.toNodeId === target.id);
          if (!exists) {
            onChange(nodes, [...edges, { id: `e-${Date.now().toString(36)}`, fromNodeId: id, toNodeId: target.id }]);
          }
        }
        setConnectingFromId(null);
        setCursor(null);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }

  function addNode(type: NodeType) {
    const id = `n-${Date.now().toString(36)}`;
    onChange(
      [
        ...nodes,
        {
          id,
          nodeType: type,
          roleId: type === "approver" ? String(roles[0]?.id ?? "") || null : null,
          userId: null,
          label: type === "start" ? "Start" : type === "end" ? "End" : "New Approver",
          posX: 40 + (nodes.length % 4) * 40,
          posY: 40 + Math.floor(nodes.length / 4) * 90,
        },
      ],
      edges
    );
  }

  function removeNode(id: string) {
    onChange(
      nodes.filter((n) => n.id !== id),
      edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id)
    );
  }

  function removeEdge(id: string) {
    onChange(nodes, edges.filter((e) => e.id !== id));
  }

  function updateNode(id: string, patch: Partial<WorkflowNodeDef>) {
    onChange(
      nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      edges
    );
  }

  const hasStart = nodes.some((n) => n.nodeType === "start");
  const hasEnd = nodes.some((n) => n.nodeType === "end");

  function centerOf(node: WorkflowNodeDef) {
    return { x: node.posX + NODE_W / 2, y: node.posY + NODE_H / 2 };
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addNode("start")} disabled={hasStart}>
          Add Start
        </Button>
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addNode("approver")}>
          Add Approver
        </Button>
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addNode("end")} disabled={hasEnd}>
          Add End
        </Button>
        <span className="ml-auto text-[11px] text-paper-400">
          Drag a dot's body to move it · drag from its right-edge handle to connect · click a line to delete it
        </span>
      </div>

      <div
        ref={canvasRef}
        className="relative overflow-hidden rounded-lg border border-paper-200 bg-paper-50"
        style={{ height: CANVAS_H }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((edge) => {
            const from = nodes.find((n) => n.id === edge.fromNodeId);
            const to = nodes.find((n) => n.id === edge.toNodeId);
            if (!from || !to) return null;
            const a = centerOf(from);
            const b = centerOf(to);
            return (
              <g key={edge.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94A3AD" strokeWidth={2} markerEnd="url(#arrow)" />
                {/* wide invisible stroke = an easier click target than the thin visible line */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={14}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => removeEdge(edge.id)}
                />
              </g>
            );
          })}
          {connectingFromId && cursor && (() => {
            const from = nodes.find((n) => n.id === connectingFromId);
            if (!from) return null;
            const a = centerOf(from);
            return <line x1={a.x} y1={a.y} x2={cursor.x} y2={cursor.y} stroke="#3FA79E" strokeWidth={2} strokeDasharray="5,4" />;
          })()}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#94A3AD" />
            </marker>
          </defs>
        </svg>

        {nodes.map((node) => {
          const colors = nodeColor(node.nodeType, invalidNodeIds.has(node.id));
          return (
            <div
              key={node.id}
              onMouseDown={startDragNode(node.id)}
              className="absolute flex cursor-move select-none flex-col justify-center rounded-lg border-2 px-3 py-1.5 shadow-sm"
              style={{
                left: node.posX,
                top: node.posY,
                width: NODE_W,
                minHeight: NODE_H,
                background: colors.fill,
                borderColor: colors.border,
                zIndex: draggingNodeId === node.id ? 10 : 1,
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <input
                  value={node.label}
                  onChange={(e) => updateNode(node.id, { label: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 truncate bg-transparent text-xs font-semibold focus:outline-none"
                  style={{ color: colors.text }}
                />
                {node.nodeType !== "start" && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => removeNode(node.id)}
                    className="shrink-0 text-paper-400 hover:text-alert-600"
                    aria-label={`Remove ${node.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              {node.nodeType === "approver" && (
                <select
                  value={node.roleId ?? ""}
                  onChange={(e) => updateNode(node.id, { roleId: e.target.value || null, userId: null })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="mt-1 rounded border border-white/60 bg-white/70 px-1 py-0.5 text-[11px]"
                >
                  <option value="">— bind a role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {!r.permission_codes.includes("approvals.review") ? " (no review permission)" : ""}
                    </option>
                  ))}
                </select>
              )}
              {node.nodeType === "approver" && roleLacksReviewPermission(node.roleId, roles) && (
                <div
                  className="mt-1 flex items-center gap-1 text-[10px] text-amber-700"
                  title="This role can still act as approver — the engine resolves by role membership, not permissions. They just won't see it in their own Approvals queue until granted."
                >
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                  No review permission yet
                </div>
              )}
              {/* drag-to-connect handle */}
              <div
                onMouseDown={startConnect(node.id)}
                title="Drag to connect to another dot"
                className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-paper-400 hover:bg-manifest-500"
              />
            </div>
          );
        })}
      </div>

      {problems.length > 0 && (
        <div className="mt-3 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-3">
          <p className="mb-1 text-xs font-semibold text-alert-800">
            {problems.length} thing{problems.length > 1 ? "s" : ""} to fix before this can be saved
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-alert-700">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
