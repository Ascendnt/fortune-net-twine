import { useEffect, useRef, useState } from "react";
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
 * A native checkbox's indeterminate state can't be set as a JSX prop — the
 * DOM property has to be set imperatively. This tiny wrapper is the
 * standard way to do that in React without reaching for a UI library.
 */
function ModuleCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="h-3.5 w-3.5 rounded border-paper-300 text-pine-600 focus:ring-2 focus:ring-manifest-100 disabled:opacity-50"
    />
  );
}

/**
 * Real backend — GET /api/roles, GET /api/permissions,
 * PUT /api/roles/{id}/permissions (the actual access-grant mechanism).
 *
 * Each module section header now has its own checkbox — checked when the
 * role holds EVERY permission in that module, unchecked when it holds
 * NONE, indeterminate when it holds some but not all. Toggling it is not
 * a separate grant mechanism: it computes the full new permission_codes
 * array for the role (existing codes ± this module's codes) and sends it
 * through the exact same sync call the individual checkboxes use. One
 * mechanism, one endpoint — this is a bulk convenience on top of it, not
 * a second system alongside it.
 *
 * Turning a module's checkbox OFF removes every permission for that
 * module, including its .view grant — which also removes it from the
 * sidebar for that role, since menu visibility reads off the same data.
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
  const [savingModule, setSavingModule] = useState<string | null>(null);
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

  async function applyPermissionChange(nextCodes: string[]) {
    if (!selectedRole) return;
    const updated = await syncRolePermissions(selectedRole.id, nextCodes);
    setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function togglePermission(code: string) {
    if (!selectedRole || !canManage) return;
    const nextCodes = selectedRole.permission_codes.includes(code)
      ? selectedRole.permission_codes.filter((c) => c !== code)
      : [...selectedRole.permission_codes, code];

    setSavingCode(code);
    setActionError(null);
    try {
      await applyPermissionChange(nextCodes);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setSavingCode(null);
    }
  }

  async function toggleModule(module: string) {
    if (!selectedRole || !canManage) return;
    const moduleCodes = permissions.filter((p) => p.module === module).map((p) => p.code);
    const grantedInModule = moduleCodes.filter((c) => selectedRole.permission_codes.includes(c));
    const allGranted = grantedInModule.length === moduleCodes.length;

    // All-or-none: if fully granted, revoke the whole module; otherwise
    // (none or partial) grant the whole module. Partial -> full grant,
    // not full revoke, so clicking a part-filled box "completes" it
    // rather than wiping out what's already there — matches how a
    // standard indeterminate checkbox is expected to behave on click.
    const nextCodes = allGranted
      ? selectedRole.permission_codes.filter((c) => !moduleCodes.includes(c))
      : Array.from(new Set([...selectedRole.permission_codes, ...moduleCodes]));

    setSavingModule(module);
    setActionError(null);
    try {
      await applyPermissionChange(nextCodes);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setSavingModule(null);
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
                subtitle="Check a module's own box to grant or revoke everything in it at once — or check individual permissions below it for finer control. Both write to the same grant."
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
                {modules.map((module) => {
                  const modulePerms = permissions.filter((p) => p.module === module);
                  const grantedCount = modulePerms.filter((p) => selectedRole.permission_codes.includes(p.code)).length;
                  const allGranted = grantedCount === modulePerms.length;
                  const noneGranted = grantedCount === 0;
                  const isSavingModule = savingModule === module;

                  return (
                    <div key={module}>
                      <label
                        className={`mb-1.5 flex items-center gap-2 px-1 ${
                          canManage ? "cursor-pointer" : "cursor-not-allowed"
                        }`}
                      >
                        {isSavingModule ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-manifest-600" />
                        ) : (
                          <ModuleCheckbox
                            checked={allGranted}
                            indeterminate={!allGranted && !noneGranted}
                            disabled={!canManage || isSavingModule}
                            onChange={() => toggleModule(module)}
                          />
                        )}
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-paper-500">
                          {module}
                        </span>
                        <span className="font-mono text-[10px] text-paper-300">
                          {grantedCount}/{modulePerms.length}
                        </span>
                      </label>
                      <div className="space-y-1 pl-1">
                        {modulePerms.map((perm) => {
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
                                disabled={!canManage || isSaving || isSavingModule}
                                onChange={() => togglePermission(perm.code)}
                                className="h-4 w-4 rounded border-paper-300 text-pine-600 focus:ring-2 focus:ring-manifest-100 disabled:opacity-50"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
