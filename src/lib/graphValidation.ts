import type { WorkflowEdgeDef, WorkflowNodeDef } from "./approvalData";

/**
 * Mirrors Modules/Approval/app/Services/WorkflowGraphValidator.php exactly —
 * same problems, same wording — so what the builder blocks on locally is
 * never out of sync with what the server would reject anyway. Runs on every
 * edit for instant feedback; the server re-checks on save regardless (a
 * direct API call must not be able to bypass the same guarantee).
 */
export function findGraphProblems(nodes: WorkflowNodeDef[], edges: WorkflowEdgeDef[]): string[] {
  const problems: string[] = [];
  if (nodes.length === 0) return ["This workflow has no dots yet."];

  for (const node of nodes) {
    const label = node.label || node.nodeType;
    const out = edges.filter((e) => e.fromNodeId === node.id).length;
    const inc = edges.filter((e) => e.toNodeId === node.id).length;

    if (out === 0 && inc === 0) {
      problems.push(`"${label}" isn't connected to anything.`);
      continue;
    }
    if ((node.nodeType === "start" || node.nodeType === "approver") && out === 0) {
      problems.push(`"${label}" has nowhere to send the request — add an outgoing connection.`);
    }
    if ((node.nodeType === "approver" || node.nodeType === "end") && inc === 0) {
      problems.push(`"${label}" has nothing routing into it.`);
    }
    if (node.nodeType === "approver" && !node.roleId && !node.userId) {
      problems.push(`"${label}" isn't bound to a role or a specific person.`);
    }
    if (node.nodeType === "approver" && node.roleId && node.userId) {
      problems.push(`"${label}" is bound to both a role and a person — pick one.`);
    }
  }

  for (const edge of edges) {
    if (edge.fromNodeId === edge.toNodeId) {
      problems.push("A connection loops a dot back to itself.");
    }
  }

  const startCount = nodes.filter((n) => n.nodeType === "start").length;
  if (startCount === 0) problems.push("This workflow has no Start dot.");
  else if (startCount > 1) problems.push("This workflow has more than one Start dot — there can only be one.");

  if (!nodes.some((n) => n.nodeType === "end")) {
    problems.push("This workflow has no End dot.");
  }

  return problems;
}
