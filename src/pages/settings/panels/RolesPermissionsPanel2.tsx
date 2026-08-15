import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/AuthContext";
import {
  createRole,
  deleteRole as apiDeleteRole,
  fetchPermissions,
  fetchRoles,
  syncRolePermissions,
  type ApiPermission,
  type ApiRole,
} from "@/lib/rbacApi";

/**
 * Real backend now — GET /api/roles, GET /api/permissions,
 * PUT /api/roles/{id}/permissions (the actual access-grant mechanism).
 * A role is nothing more than a name plus whichever permission codes are
 * checked here; nothing anywhere hardcodes a role to a module.
 */
export function RolesPermissionsPanel() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("users.manage");

  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [permissions, setPermissions] = useState<ApiPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newRoleName, setNewRoleName] = useState("");
  const [showAddRole, setShowAddRole] = useState(false);
  const [addingRole, setAddingRole] = useState(false);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<ApiRole | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRoles(), fetchPermissions()])
      .then(([rolesRes, permsRes]) => {
        if (cancelled) return;
        setRoles(rolesRes);
        setPermissions(permsRes);
        setSelectedRoleId(rolesRes[0]?.id ?? null);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const modules = Array.from(new Set(permissions.map((p) => p.module)));
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  async function togglePermission(code: string) {
    if (!selectedRole || !canManage) return;
    const nextCodes = selectedRole.permission_codes.includes(code)
      ? selectedRole.permission_codes.filter((c) => c !== code)
      : [...selectedRole.permission_codes, code];

    setSavingCode(code);
    setActionError(null);
    try {
      const updated = await syncRolePermissions(selectedRole.id, nextCodes);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setSavingCode(null);
    }
  }

  async function handleAddRole() {
    const name = newRoleName.trim();
    if (!name) return;
    setAddingRole(true);
    setActionError(null);
    try {
      const role = await createRole(name);
      setRoles((prev) => [...prev, role]);
      setSelectedRoleId(role.id);
      setNewRoleName("");
      setShowAddRole(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't create that role.");
    } finally {
      setAddingRole(false);
    }
  }

  async function handleDeleteRole(role: ApiRole) {
    setDeletingRole(true);
    setActionError(null);
    try {
      await apiDeleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (selectedRoleId === role.id) {
        setSelectedRoleId(roles.find((r) => r.id !== role.id)?.id ?? null);
      }
      setConfirmDeleteRole(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete that role.");
    } finally {
      setDeletingRole(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-paper-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading roles & permissions…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-3 text-alert-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
        <div>
          <p className="text-sm font-medium">Couldn't load roles & permissions</p>
          <p className="text-xs text-alert-700">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!canManage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs">
            You can view roles and their grants, but you don't hold <code className="font-mono">users.manage</code> —
            changes are disabled.
          </p>
        </div>
      )}
      {actionError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-2.5 text-alert-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
          <p className="text-xs">{actionError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="lg:self-start">
          <CardHeader
            title="Roles"
            eyebrow="Access"
            action={
              canManage ? (
                <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowAddRole(true)}>
                  Add
                </Button>
              ) : undefined
            }
          />
          <div className="space-y-1">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  role.id === selectedRoleId ? "bg-pine-50 text-pine-800 font-medium" : "text-paper-600 hover:bg-paper-50"
                }`}
              >
                <span className="truncate">{role.name}</span>
                <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-paper-400 border border-paper-200">
                  {role.permission_codes.length}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          {selectedRole ? (
            <>
              <CardHeader
                title={selectedRole.name}
                eyebrow="Permission grants"
                subtitle="Every permission below is an independent grant — this role holds exactly the ones checked, nothing is implied by the role's name."
                action={
                  selectedRole.is_system_default ? (
                    <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] text-paper-400 border border-paper-200">
                      Starter role
                    </span>
                  ) : canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setConfirmDeleteRole(selectedRole)}
                    >
                      Delete role
                    </Button>
                  ) : undefined
                }
              />
              {selectedRole.user_count > 0 && (
                <p className="mb-3 text-xs text-paper-400">
                  {selectedRole.user_count} user{selectedRole.user_count === 1 ? "" : "s"} currently hold this role.
                </p>
              )}
              <div className="space-y-4">
                {modules.map((module) => (
                  <div key={module}>
                    <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-paper-400">
                      {module}
                    </p>
                    <div className="space-y-1">
                      {permissions
                        .filter((p) => p.module === module)
                        .map((perm) => {
                          const checked = selectedRole.permission_codes.includes(perm.code);
                          const isSaving = savingCode === perm.code;
                          return (
                            <label
                              key={perm.code}
                              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                                canManage ? "cursor-pointer hover:bg-paper-50" : "cursor-not-allowed opacity-70"
                              }`}
                            >
                              <span className="flex items-center gap-2 text-sm text-paper-700">
                                {isSaving ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-manifest-600" />
                                ) : (
                                  <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${checked ? "text-manifest-600" : "text-paper-300"}`} />
                                )}
                                {perm.label}
                                <span className="font-mono text-[10px] text-paper-400">{perm.code}</span>
                              </span>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canManage || isSaving}
                                onChange={() => togglePermission(perm.code)}
                                className="h-4 w-4 rounded border-paper-300 text-pine-600 focus:ring-2 focus:ring-manifest-100 disabled:opacity-50"
                              />
                            </label>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-paper-400">Select or add a role to manage its grants.</p>
          )}
        </Card>
      </div>

      <Modal
        open={showAddRole}
        onClose={() => setShowAddRole(false)}
        title="Add a role"
        subtitle="Starts with no permissions granted — add them once it's created."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAddRole(false)} disabled={addingRole}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddRole} disabled={addingRole}>
              {addingRole ? "Adding…" : "Add role"}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-xs font-medium text-paper-600">Role name</label>
        <input
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          placeholder="e.g. Regional Sales Lead"
          className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </Modal>

      <Modal
        open={confirmDeleteRole !== null}
        onClose={() => setConfirmDeleteRole(null)}
        title={`Delete "${confirmDeleteRole?.name}"?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteRole(null)} disabled={deletingRole}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deletingRole}
              onClick={() => confirmDeleteRole && handleDeleteRole(confirmDeleteRole)}
            >
              {deletingRole ? "Deleting…" : "Delete role"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          {confirmDeleteRole && confirmDeleteRole.user_count > 0
            ? `${confirmDeleteRole.user_count} user${confirmDeleteRole.user_count === 1 ? "" : "s"} currently hold this role and will lose every permission it granted. `
            : ""}
          This doesn't affect permissions granted to anyone through any other role they may also hold.
        </p>
      </Modal>
    </div>
  );
}
