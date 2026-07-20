import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import {
  canDeleteManagedUser,
  canDeleteUsers,
  canEditManagedUser,
  canEditUsers,
  getAssignableRoles,
  getInitials,
  isExecutiveRole,
  isMasterRole,
  ROLE_LABELS,
  type ManagedUser,
  type UnitSummary,
  type UserRole,
} from "@/lib/auth-types";

type UsersResponse = {
  users: Array<ManagedUser>;
};

type UnitsResponse = {
  units: Array<UnitSummary>;
};

type DeleteTarget = {
  id: string;
  name: string;
  role: UserRole;
};

type EditForm = {
  userId: string;
  name: string;
  email: string;
  password: string;
};

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [{ title: "Usuários - Star Profissões" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = React.useState<Array<ManagedUser>>([]);
  const [units, setUnits] = React.useState<Array<UnitSummary>>([]);
  const [loading, setLoading] = React.useState(true);  const [createUserOpen, setCreateUserOpen] = React.useState(false);
  const [savingUser, setSavingUser] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [deletingUser, setDeletingUser] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [editForm, setEditForm] = React.useState<EditForm | null>(null);
  const [search, setSearch] = React.useState("");
  const userRole = session?.user.role;
  const assignableRoles = React.useMemo(
    () => (userRole ? getAssignableRoles(userRole) : []),
    [userRole],
  );
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "" as UserRole | "",
    unitId: "",
  });
  const canChooseUnit = userRole
    ? isMasterRole(userRole) || isExecutiveRole(userRole) || userRole === "MARKETING"
    : false;
  const canDeleteUserRecords = userRole ? canDeleteUsers(userRole) : false;
  const canEditUserRecords = userRole ? canEditUsers(userRole) : false;
  const defaultUnit = session?.activeUnit ?? session?.units[0] ?? null;
  const defaultUnitId = defaultUnit?.id ?? "";
  const effectiveUnitId = canChooseUnit ? form.unitId : defaultUnitId || form.unitId;
  const unitOptions = units.length ? units : (session?.units ?? []);
  React.useEffect(() => {
    if (!session) {
      return;
    }

    setForm((current) => {
      const nextRole = current.role || assignableRoles[0] || "";
      const sessionDefaultUnitId = session.activeUnit?.id || session.units[0]?.id || "";
      const currentUnitStillExists = session.units.some((unit) => unit.id === current.unitId);
      const nextUnitId =
        isMasterRole(session.user.role) ||
        isExecutiveRole(session.user.role) ||
        session.user.role === "MARKETING"
        ? currentUnitStillExists
          ? current.unitId
          : sessionDefaultUnitId
        : sessionDefaultUnitId;

      if (current.role === nextRole && current.unitId === nextUnitId) {
        return current;
      }

      return { ...current, role: nextRole, unitId: nextUnitId };
    });
  }, [assignableRoles, session]);

  const loadData = React.useCallback(async () => {
    if (!session?.canRegisterUsers || !defaultUnitId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const usersResponse = await fetch("/api/admin/users", { credentials: "same-origin" });
      const unitsResponse = canChooseUnit
        ? await fetch("/api/admin/units", { credentials: "same-origin" })
        : null;

      if (!usersResponse.ok || (unitsResponse && !unitsResponse.ok)) {
        throw new Error("Não foi possível carregar os usuários.");
      }

      const usersData = (await usersResponse.json()) as UsersResponse;
      const unitsData = unitsResponse
        ? ((await unitsResponse.json()) as UnitsResponse)
        : { units: session.units };
      setUsers(usersData.users);
      setUnits(unitsData.units);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, [canChooseUnit, defaultUnitId, session]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!session?.canRegisterUsers) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu usuário não tem permissão para gerenciar usuários.
          </p>
        </div>
      </div>
    );
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!effectiveUnitId) {
      toast.error("Unidade indisponível para o cadastro.");
      return;
    }

    setSavingUser(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, unitId: effectiveUnitId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível cadastrar usuário.");
      }

      setForm((current) => ({ ...current, name: "", email: "", password: "" }));
      setCreateUserOpen(false);
      await loadData();
      toast.success("Usuário cadastrado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao cadastrar usuário.");
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) {
      return;
    }

    setDeletingUser(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ userId: deleteTarget.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível excluir usuário.");
      }

      setUsers((current) => current.filter((user) => user.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Usuário excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir usuário.");
    } finally {
      setDeletingUser(false);
    }
  }

  async function handleEditUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editForm) {
      return;
    }

    setSavingEdit(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: ManagedUser;
      };

      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "Não foi possível editar usuário.");
      }

      setUsers((current) => current.map((user) => (user.id === data.user!.id ? data.user! : user)));
      setEditForm(null);
      toast.success(editForm.password ? "Usuário e senha atualizados." : "Usuário atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao editar usuário.");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleOpenCreateUser() {
    setCreateUserOpen(true);
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = normalizedSearch
    ? users.filter((user) => {
        const searchableText = [
          user.name,
          user.email,
          user.unitName,
          ROLE_LABELS[user.role],
          user.role,
          user.status === "active" ? "ativo" : "inativo",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
    : users;

  return (
    <div className="space-y-6">      <PageHeader
        eyebrow="Administração"
        title="Usuários"
        description="Cadastre e gerencie as pessoas vinculadas à unidade ativa."
        actions={
          <>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {session.activeUnit?.name ?? "Sem unidade ativa"}
            </Badge>
            <Button type="button" onClick={handleOpenCreateUser}>
              <UserPlus className="h-4 w-4" />
              Cadastrar usuário
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden shadow-card">
        <CardHeader className="flex flex-col gap-3 border-b border-border/70 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-gold text-gold-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Usuários da unidade</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading
                  ? "Atualizando lista..."
                  : normalizedSearch
                    ? `${filteredUsers.length} de ${users.length} usuário(s)`
                    : `${users.length} usuário(s) ativo(s)`}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar usuário..."
              className="h-9 pl-9 text-sm"
              aria-label="Buscar usuário"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="pl-6">Usuário</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[112px] pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                    Carregando usuários...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length ? (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="group h-[68px]">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
                          {getInitials(user.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.unitName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-success/10 text-success">
                        Ativo
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-1">
                        {canEditUserRecords && canEditManagedUser(session.user.role, user.role) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() =>
                              setEditForm({
                                userId: user.id,
                                name: user.name,
                                email: user.email,
                                password: "",
                              })
                            }
                            aria-label={`Editar ${user.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canDeleteUserRecords &&
                        user.id !== session.user.id &&
                        canDeleteManagedUser(session.user.role, user.role) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setDeleteTarget({ id: user.id, name: user.name, role: user.role })
                            }
                            aria-label={`Excluir ${user.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="mx-auto max-w-sm text-muted-foreground">
                      <Users className="mx-auto mb-3 h-6 w-6 opacity-50" />
                      <p className="font-medium text-foreground">
                        {normalizedSearch
                          ? "Nenhum usuário encontrado"
                          : "Nenhum usuário nesta unidade"}
                      </p>
                      <p className="mt-1 text-sm">
                        {normalizedSearch
                          ? "Tente buscar por outro nome, email, função ou unidade."
                          : "Use o botão acima para fazer o primeiro cadastro."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createUserOpen} onOpenChange={(open) => !savingUser && setCreateUserOpen(open)}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle>Cadastrar usuário</DialogTitle>
              <DialogDescription>
                Preencha os dados de acesso e selecione a função do novo usuário.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="create-name">Nome</Label>
                <Input
                  id="create-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Senha inicial</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="create-password"
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, password: event.target.value }))
                    }
                    className="pl-9"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Função</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, role: value as UserRole }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                {canChooseUnit ? (
                  <Select
                    value={effectiveUnitId}
                    onValueChange={(value) => setForm((current) => ({ ...current, unitId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={defaultUnit?.name ?? ""} disabled readOnly />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateUserOpen(false)}
                disabled={savingUser}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingUser || !form.role || !effectiveUnitId}>
                {savingUser ? "Salvando..." : "Cadastrar usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editForm)}
        onOpenChange={(open) => !open && !savingEdit && setEditForm(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleEditUser}>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
              <DialogDescription>
                Altere nome, email ou defina uma nova senha. Os dados serão atualizados no banco.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input
                  id="edit-name"
                  value={editForm?.name ?? ""}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm?.email ?? ""}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, email: event.target.value } : current,
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Nova senha</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="edit-password"
                    type="password"
                    value={editForm?.password ?? ""}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, password: event.target.value } : current,
                      )
                    }
                    className="pl-9"
                    minLength={8}
                    placeholder="Deixe em branco para manter"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Ao trocar a senha, as sessões abertas deste usuário serão encerradas.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditForm(null)}
                disabled={savingEdit}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && !deletingUser && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Deseja excluir "${deleteTarget.name}" permanentemente? O cadastro e o acesso serão removidos do banco de dados.`
                : "Deseja excluir este usuário?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUser}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingUser}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteUser();
              }}
            >
              {deletingUser ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
