import { useEffect, useState } from "react";
import { AlertTriangle, Copy, KeyRound, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { useAuth } from "@/lib/AuthContext";
import { createRole, fetchRoles, type ApiRole } from "@/lib/rbacApi";
import { createUser, fetchUsers, resetUserPassword, updateUserRoles, type ApiUser } from "@/lib/usersApi";
import { RolePicker } from "./RolePicker";

/**
 * "Create role" flow shared by both Add User and Edit Roles: RolePicker
 * only ever surfaces the INTENT to create a role it can't find — actually
 * creating one always goes through this confirmation, because a role
 * created this way starts with zero permissions granted (see
 * RoleController::store()) and is invisible in the sidebar for anyone
 * assigned it until someone visits Roles & Permissions and grants it
 * something. That's a real, consequential gap to walk into by accident.
 */
type CreateRoleContext = { mode: "add" } | { mode: "edit"; user: ApiUser };

export function UsersPanel() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("users.manage");

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add user
  const [showAddUser, setShowAddUser] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRoleIds, setNewRoleIds] = useState<number[]>([]);
  const [addingUser, setAddingUser] = useState(false);

  // Edit an existing user's roles
  const [editTarget, setEditTarget] = useState<ApiUser | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  // Shared "role doesn't exist yet" confirmation, used by both flows above
  const [pendingCreate, setPendingCreate] = useState<{ name: string; context: CreateRoleContext } | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);

  // Password reset (unchanged from before)
  const [resetTarget, setResetTarget] = useState<ApiUser | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [revealPassword, setRevealPassword] = useState<{ forName: string; password: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchUsers(), fetchRoles()])
      .then(([usersRes, rolesRes]) => {
        if (cancelled) return;
        setUsers(usersRes);
        setRoles(rolesRes);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------- Add user ----------------
  async function handleAddUser() {
    if (!newName.trim() || !newEmail.trim()) return;
    setAddingUser(true);
    setActionError(null);
    try {
      const created = await createUser(newName.trim(), newEmail.trim(), newRoleIds);
      setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAddUser(false);
      setRevealPassword({ forName: created.name, password: created.temporary_password });
      setNewName("");
      setNewEmail("");
      setNewRoleIds([]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't create that user.");
    } finally {
      setAddingUser(false);
    }
  }

  // ---------------- Edit an existing user's roles ----------------
  function openEditRoles(user: ApiUser) {
    setEditTarget(user);
    setEditRoleIds(user.roles.map((r) => r.id));
    setActionError(null);
  }

  async function handleSaveRoles() {
    if (!editTarget) return;
    setSavingRoles(true);
    setActionError(null);
    try {
      const updated = await updateUserRoles(editTarget.id, editRoleIds);
      // API returns roles as {id, name}[] already shaped like ApiUser.roles
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't update roles for that user.");
    } finally {
      setSavingRoles(false);
    }
  }

  // ---------------- Shared create-role flow ----------------
  async function confirmCreateRole() {
    if (!pendingCreate) return;
    setCreatingRole(true);
    try {
      const role = await createRole(pendingCreate.name);
      setRoles((prev) => [...prev, role]);
      if (pendingCreate.context.mode === "add") {
        setNewRoleIds((prev) => [...prev, role.id]);
      } else {
        setEditRoleIds((prev) => [...prev, role.id]);
      }
      setPendingCreate(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't create that role.");
      setPendingCreate(null);
    } finally {
      setCreatingRole(false);
    }
  }

  // ---------------- Password reset (unchanged) ----------------
  function openResetModal(user: ApiUser) {
    setResetTarget(user);
    setAdminPassword("");
    setResetError(null);
  }

  async function handleResetPassword() {
    if (!resetTarget || !adminPassword) return;
    setResetting(true);
    setResetError(null);
    try {
      const result = await resetUserPassword(resetTarget.id, adminPassword);
      setResetTarget(null);
      setRevealPassword({ forName: resetTarget.name, password: result.new_password });
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Couldn't reset that password.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-paper-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-3 text-alert-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
        <div>
          <p className="text-sm font-medium">Couldn't load users</p>
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
            You don't hold <code className="font-mono">users.manage</code> — this list isn't visible to you either;
            you're seeing it because your account is currently being used for testing.
          </p>
        </div>
      )}
      {actionError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-2.5 text-alert-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
          <p className="text-xs">{actionError}</p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Users"
          eyebrow="Tenant roster"
          subtitle="Every user's password is one-way hashed and cannot be viewed by anyone, ever — Reset Password generates a new one instead."
          action={
            canManage ? (
              <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowAddUser(true)}>
                Add User
              </Button>
            ) : undefined
          }
        />
        <Table>
          <THead>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Roles</TH>
            {canManage && <TH>Actions</TH>}
          </THead>
          <tbody>
            {users.map((user) => (
              <TR key={user.id}>
                <TD className="font-medium text-paper-800">{user.name}</TD>
                <TD className="text-paper-500">{user.email}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 && <span className="text-xs text-paper-300">No role assigned</span>}
                    {user.roles.map((role) => (
                      <span
                        key={role.id}
                        className="whitespace-nowrap rounded-full bg-paper-50 px-2 py-0.5 text-[11px] text-paper-600 border border-paper-200"
                      >
                        {role.name}
                      </span>
                    ))}
                  </div>
                </TD>
                {canManage && (
                  <TD>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEditRoles(user)}>
                        Edit Roles
                      </Button>
                      <Button variant="ghost" size="sm" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => openResetModal(user)}>
                        Reset Password
                      </Button>
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Add user */}
      <Modal
        open={showAddUser}
        onClose={() => setShowAddUser(false)}
        title="Add a user"
        subtitle="A temporary password is generated automatically and shown once after creation — there's no field for typing one in."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowAddUser(false)} disabled={addingUser}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddUser} disabled={addingUser}>
              {addingUser ? "Creating…" : "Create user"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Jomari Santos"
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="jomari@fortunenetandtwine.com"
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paper-600">Roles</label>
            <RolePicker
              allRoles={roles}
              selectedRoleIds={newRoleIds}
              onChange={setNewRoleIds}
              onRequestCreateRole={(name) => setPendingCreate({ name, context: { mode: "add" } })}
            />
          </div>
        </div>
      </Modal>

      {/* Edit an existing user's roles */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={`Edit roles — ${editTarget?.name}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditTarget(null)} disabled={savingRoles}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveRoles} disabled={savingRoles}>
              {savingRoles ? "Saving…" : "Save roles"}
            </Button>
          </>
        }
      >
        <div className="min-h-[240px]">
          <label className="mb-1 block text-xs font-medium text-paper-600">Roles</label>
          <RolePicker
            allRoles={roles}
            selectedRoleIds={editRoleIds}
            onChange={setEditRoleIds}
            onRequestCreateRole={(name) =>
              editTarget && setPendingCreate({ name, context: { mode: "edit", user: editTarget } })
            }
          />
        </div>
      </Modal>

      {/* Shared: confirm creating a role that doesn't exist yet */}
      <Modal
        open={pendingCreate !== null}
        onClose={() => setPendingCreate(null)}
        title={`"${pendingCreate?.name}" doesn't exist yet`}
        subtitle="You can create it now, but it starts with no modules or permissions granted — that stays under Roles & Permissions, not here."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPendingCreate(null)} disabled={creatingRole}>
              Cancel — pick an existing role
            </Button>
            <Button variant="primary" size="sm" onClick={confirmCreateRole} disabled={creatingRole}>
              {creatingRole ? "Creating…" : "Create role anyway"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs">
            Whoever holds this role will see nothing in the sidebar and won't be able to do anything with it until
            someone visits Settings → Roles &amp; Permissions and grants it access. If you meant an existing role,
            cancel and search again — role names must match exactly.
          </p>
        </div>
      </Modal>

      {/* Confirm own password before resetting someone else's */}
      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={`Reset password for ${resetTarget?.name}?`}
        subtitle="Confirm your own password to continue — this is you authorizing the action, not proof of ownership of their account."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setResetTarget(null)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleResetPassword} disabled={resetting || !adminPassword}>
              {resetting ? "Resetting…" : "Reset password"}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="mb-1 block text-xs font-medium text-paper-600">Your password</label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
          {resetError && (
            <p className="flex items-start gap-1.5 text-xs text-alert-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {resetError}
            </p>
          )}
          <p className="text-xs text-paper-400">
            {resetTarget?.name}'s existing sessions will be logged out and their new password will be shown once, here, immediately after.
          </p>
        </div>
      </Modal>

      {/* One-time password reveal — shared by both create-user and reset-password */}
      <Modal
        open={revealPassword !== null}
        onClose={() => setRevealPassword(null)}
        title={`Password for ${revealPassword?.forName}`}
        subtitle="This is shown once and cannot be retrieved again — copy it now and share it securely."
        footer={
          <Button variant="primary" size="sm" onClick={() => setRevealPassword(null)}>
            Done
          </Button>
        }
      >
        {revealPassword && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2.5">
            <code className="font-mono text-sm text-paper-800">{revealPassword.password}</code>
            <button
              onClick={() => navigator.clipboard.writeText(revealPassword.password)}
              className="shrink-0 rounded-md p-1.5 text-paper-400 hover:bg-paper-100 hover:text-paper-700"
              aria-label="Copy password"
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
