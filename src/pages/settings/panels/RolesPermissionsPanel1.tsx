import { useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  INITIAL_ROLE_GRANTS,
  PERMISSIONS,
  PERMISSION_MODULES,
  type RoleGrant,
} from "@/lib/rbacData";

/**
 * Deliberately NOT a hardcoded "role locks a module" screen. A role is just a
 * named set of permission grants — toggling a checkbox here is the entire
 * mechanism, the same one the backend's role_permissions pivot represents.
 * Nothing on this screen assumes a fixed list of roles or a fixed mapping of
 * role-to-module; both are fully editable data.
 *
 * NOTE: local component state for now (no Roles/Permissions API exists yet —
 * only /login, /logout, /me are built). Swapping this for real API calls
 * later is a data-source change only; the UI and interaction model stay put.
 */
export function RolesPermissionsPanel() {
  const [roles, setRoles] = useState<RoleGrant[]>(INITIAL_ROLE_GRANTS);
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const [newRoleName, setNewRoleName] = useState("");
  const [showAddRole, setShowAddRole] = useState(false);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<RoleGrant | null>(null);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  function togglePermission(code: string) {
    if (!selectedRole) return;
    setRoles((prev) =>
      prev.map((r) =>
        r.id !== selectedRole.id
          ? r
          : {
              ...r,
              permissionCodes: r.permissionCodes.includes(code)
                ? r.permissionCodes.filter((c) => c !== code)
                : [...r.permissionCodes, code],
            }
      )
    );
  }

  function addRole() {
    const name = newRoleName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\W+/g, "-");
   // setRoles((prev) => [...prev, { id, name, isSystemDefault: false, permissionCodes: [] }]);
   setRoles((prev) => [
    ...prev,
    { id, name, isSystemDefault: false, canOverride: false, permissionCodes: [] },
  ]); 
   setSelectedRoleId(id);
    setNewRoleName("");
    setShowAddRole(false);
  }

  function deleteRole(role: RoleGrant) {
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    if (selectedRoleId === role.id) {
      setSelectedRoleId(roles.find((r) => r.id !== role.id)?.id ?? "");
    }
    setConfirmDeleteRole(null);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
      <Card className="lg:self-start">
        <CardHeader
          title="Roles"
          eyebrow="Access"
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setShowAddRole(true)}
            >
              Add
            </Button>
          }
        />
        <div className="space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                role.id === selectedRoleId
                  ? "bg-pine-50 text-pine-800 font-medium"
                  : "text-paper-600 hover:bg-paper-50"
              }`}
            >
              <span className="truncate">{role.name}</span>
              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-paper-400 border border-paper-200">
                {role.permissionCodes.length}
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
                !selectedRole.isSystemDefault ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setConfirmDeleteRole(selectedRole)}
                  >
                    Delete role
                  </Button>
                ) : (
                  <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] text-paper-400 border border-paper-200">
                    Starter role
                  </span>
                )
              }
            />
            <div className="space-y-4">
              {PERMISSION_MODULES.map((module) => (
                <div key={module}>
                  <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-paper-400">
                    {module}
                  </p>
                  <div className="space-y-1">
                    {PERMISSIONS.filter((p) => p.module === module).map((perm) => {
                      const checked = selectedRole.permissionCodes.includes(perm.code);
                      return (
                        <label
                          key={perm.code}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-paper-50"
                        >
                          <span className="flex items-center gap-2 text-sm text-paper-700">
                            <ShieldCheck
                              className={`h-3.5 w-3.5 shrink-0 ${checked ? "text-manifest-600" : "text-paper-300"}`}
                            />
                            {perm.label}
                            <span className="font-mono text-[10px] text-paper-400">{perm.code}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(perm.code)}
                            className="h-4 w-4 rounded border-paper-300 text-pine-600 focus:ring-2 focus:ring-manifest-100"
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

      <Modal
        open={showAddRole}
        onClose={() => setShowAddRole(false)}
        title="Add a role"
        subtitle="Starts with no permissions granted — add them once it's created."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAddRole(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={addRole}>
              Add role
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
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteRole(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => confirmDeleteRole && deleteRole(confirmDeleteRole)}
            >
              Delete role
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Any user currently holding this role loses every permission it granted. This doesn't affect
          permissions granted to them through any other role they may also hold.
        </p>
      </Modal>
    </div>
  );
}
