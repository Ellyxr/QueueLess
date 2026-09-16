import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Ban,
  CheckCircle2,
  Lock,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminShell } from "./admin-shell";
import {
  createEmptyAdminUser,
  MOCK_USERS,
  type AdminUserRole,
  type AdminUserRow,
} from "./admin-data";

const ROLE_LABEL: Record<AdminUserRole, string> = {
  student: "Student",
  vendor: "Vendor",
  admin: "Admin",
};

const ROLE_BADGE_CLASS: Record<AdminUserRole, string> = {
  student: "bg-blue-500/10 text-blue-600",
  vendor: "bg-emerald-500/10 text-emerald-600",
  admin: "bg-amber-500/10 text-amber-600",
};

function toggleRole(roles: AdminUserRole[], role: AdminUserRole): AdminUserRole[] {
  const has = roles.includes(role);
  if (has && roles.length === 1) return roles; // keep at least one role
  return has ? roles.filter((r) => r !== role) : [...roles, role];
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);

  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AdminUserRole>("student");

  const [draftEmail, setDraftEmail] = useState("");
  const [draftPassword, setDraftPassword] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (!showArchived && user.isArchived) return false;
      if (!term) return true;
      return (
        user.fullName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
      );
    });
  }, [users, search, showArchived]);

  const updateUser = (id: string, patch: Partial<AdminUserRow>) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, ...patch } : user)));
  };

  const handleCreateUser = () => {
    if (!newFullName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    const created = createEmptyAdminUser({
      fullName: newFullName.trim(),
      email: newEmail.trim(),
      role: newRole,
    });
    setUsers((prev) => [created, ...prev]);
    setIsCreateOpen(false);
    setNewFullName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("student");
  };

  const accessUser = users.find((user) => user.id === accessUserId) ?? null;

  const openAccessDialog = (user: AdminUserRow) => {
    setDraftEmail(user.email);
    setDraftPassword("");
    setAccessUserId(user.id);
  };

  const saveAccessChanges = () => {
    if (!accessUser) return;
    updateUser(accessUser.id, { email: draftEmail.trim() || accessUser.email });
    setAccessUserId(null);
  };

  return (
    <AdminShell>
      <div className="mb-6 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        Showing placeholder data — none of these actions persist yet. See AddressMe.md.
      </div>

      <Card className="border-card-border/80 bg-card/90 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-2xl tracking-tighter">Users</CardTitle>
            <CardDescription>Manage students, vendors, and admins.</CardDescription>
          </div>
          <Button className="gap-2 rounded-full" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create user
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="sm:max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Show archived
            </label>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data access</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id} className={user.isArchived ? "opacity-60" : ""}>
                    <TableCell className="font-medium text-foreground">{user.fullName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} variant="secondary" className={ROLE_BADGE_CLASS[role]}>
                            {ROLE_LABEL[role]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant="secondary"
                          className={
                            user.isActive
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-destructive/10 text-destructive"
                          }
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {user.isArchived && (
                          <Badge variant="secondary" className="bg-slate-500/10 text-slate-600">
                            Archived
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.dataAccessGranted ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                          <ShieldCheck className="h-3.5 w-3.5" /> Granted
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" /> Not granted
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Roles</DropdownMenuLabel>
                          {(Object.keys(ROLE_LABEL) as AdminUserRole[]).map((role) => (
                            <DropdownMenuCheckboxItem
                              key={role}
                              checked={user.roles.includes(role)}
                              onCheckedChange={() =>
                                updateUser(user.id, { roles: toggleRole(user.roles, role) })
                              }
                            >
                              {ROLE_LABEL[role]}
                            </DropdownMenuCheckboxItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateUser(user.id, { isActive: !user.isActive })}
                          >
                            {user.isActive ? (
                              <>
                                <Ban className="mr-2 h-4 w-4" /> Deactivate
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateUser(user.id, { isArchived: !user.isArchived })}
                          >
                            {user.isArchived ? (
                              <>
                                <ArchiveRestore className="mr-2 h-4 w-4" /> Unarchive
                              </>
                            ) : (
                              <>
                                <Archive className="mr-2 h-4 w-4" /> Archive
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openAccessDialog(user)}>
                            <UserCog className="mr-2 h-4 w-4" /> Manage email & password
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>Add a new student, vendor, or admin account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full name</label>
              <Input value={newFullName} onChange={(event) => setNewFullName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Temporary password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={newRole} onValueChange={(value) => setNewRole(value as AdminUserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={!newFullName.trim() || !newEmail.trim() || !newPassword.trim()}
              onClick={handleCreateUser}
            >
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accessUser !== null} onOpenChange={(open) => !open && setAccessUserId(null)}>
        <DialogContent>
          {accessUser && (
            <>
              <DialogHeader>
                <DialogTitle>Email & password</DialogTitle>
                <DialogDescription>{accessUser.fullName}</DialogDescription>
              </DialogHeader>

              {accessUser.dataAccessGranted ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New password</label>
                    <Input
                      type="password"
                      value={draftPassword}
                      onChange={(event) => setDraftPassword(event.target.value)}
                      placeholder="Leave blank to keep current password"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-border bg-secondary/30 p-5 text-center">
                  <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    This user hasn't granted access
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    QueueLess admins can only view or change an account's email and password once
                    that person grants permission from their own account settings.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" className="rounded-full" onClick={() => setAccessUserId(null)}>
                  Close
                </Button>
                {accessUser.dataAccessGranted && (
                  <Button className="rounded-full" onClick={saveAccessChanges}>
                    Save changes
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
