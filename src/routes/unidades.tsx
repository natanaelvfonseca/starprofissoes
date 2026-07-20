import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { canManageUnits, type UnitSummary } from "@/lib/auth-types";

type UnitsResponse = {
  units: Array<UnitSummary>;
};

type UnitEditForm = {
  unitId: string;
  name: string;
};

export const Route = createFileRoute("/unidades")({
  head: () => ({ meta: [{ title: "Unidades - Star Profissões" }] }),
  component: UnitsPage,
});

function UnitsPage() {
  const { session, refreshSession } = useAuth();
  const [units, setUnits] = React.useState<Array<UnitSummary>>([]);
  const [loading, setLoading] = React.useState(true);  const [createUnitOpen, setCreateUnitOpen] = React.useState(false);
  const [savingUnit, setSavingUnit] = React.useState(false);
  const [savingUnitEdit, setSavingUnitEdit] = React.useState(false);
  const [deletingUnit, setDeletingUnit] = React.useState(false);
  const [unitName, setUnitName] = React.useState("");
  const [unitEditForm, setUnitEditForm] = React.useState<UnitEditForm | null>(null);
  const [deleteUnitTarget, setDeleteUnitTarget] = React.useState<UnitSummary | null>(null);
  const canManageUnitRecords = session ? canManageUnits(session.user.role) : false;
  const loadUnits = React.useCallback(async () => {
    if (!canManageUnitRecords) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/admin/units", { credentials: "same-origin" });
      const data = (await response.json().catch(() => ({}))) as UnitsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível carregar as unidades.");
      }

      setUnits(data.units);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar unidades.");
    } finally {
      setLoading(false);
    }
  }, [canManageUnitRecords]);

  React.useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  if (!canManageUnitRecords || !session) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas Dev, CEO, CVO e Marketing podem gerenciar unidades.
          </p>
        </div>
      </div>
    );
  }

  async function handleCreateUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingUnit(true);

    try {
      const response = await fetch("/api/admin/units", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ name: unitName }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        unit?: UnitSummary;
      };

      if (!response.ok || !data.unit) {
        throw new Error(data.error ?? "Não foi possível criar a unidade.");
      }

      setUnits((current) => [...current, data.unit!].sort((a, b) => a.name.localeCompare(b.name)));
      setUnitName("");
      setCreateUnitOpen(false);
      await refreshSession();
      toast.success("Unidade criada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar unidade.");
    } finally {
      setSavingUnit(false);
    }
  }

  async function handleEditUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!unitEditForm) {
      return;
    }

    setSavingUnitEdit(true);

    try {
      const response = await fetch("/api/admin/units", {
        method: "PUT",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(unitEditForm),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        unit?: UnitSummary;
      };

      if (!response.ok || !data.unit) {
        throw new Error(data.error ?? "Não foi possível editar a unidade.");
      }

      setUnits((current) =>
        current
          .map((unit) => (unit.id === data.unit!.id ? data.unit! : unit))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setUnitEditForm(null);
      await refreshSession();
      toast.success("Unidade atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao editar a unidade.");
    } finally {
      setSavingUnitEdit(false);
    }
  }

  async function handleDeleteUnit() {
    if (!deleteUnitTarget) {
      return;
    }

    setDeletingUnit(true);

    try {
      const response = await fetch("/api/admin/units", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: deleteUnitTarget.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível excluir a unidade.");
      }

      setUnits((current) => current.filter((unit) => unit.id !== deleteUnitTarget.id));
      setDeleteUnitTarget(null);
      await refreshSession();
      toast.success("Unidade excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir a unidade.");
    } finally {
      setDeletingUnit(false);
    }
  }

  function handleOpenCreateUnit() {
    setCreateUnitOpen(true);
  }

  return (
    <div className="space-y-6">      <PageHeader
        eyebrow="Administração"
        title="Unidades"
        description="Gerencie a estrutura de unidades disponível no sistema."
        actions={
          <>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {loading ? "Carregando..." : `${units.length} unidade(s)`}
            </Badge>
            {session.canCreateUnits ? (
              <Button type="button" onClick={handleOpenCreateUnit}>
                <Plus className="h-4 w-4" />
                Nova unidade
              </Button>
            ) : null}
          </>
        }
      />

      {loading ? (
        <Card className="shadow-card">
          <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Carregando unidades...
          </CardContent>
        </Card>
      ) : units.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <Card
              key={unit.id}
              className="group overflow-hidden border-border/70 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
            >
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-sm">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-bold">{unit.name}</h2>
                    {session.activeUnit?.id === unit.id ? (
                      <Badge variant="secondary" className="bg-success/10 text-success">
                        Ativa
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{unit.slug}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() => setUnitEditForm({ unitId: unit.id, name: unit.name })}
                    aria-label={`Editar unidade ${unit.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteUnitTarget(unit)}
                    aria-label={`Excluir unidade ${unit.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="shadow-card">
          <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="font-bold">Nenhuma unidade cadastrada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre uma unidade para começar a organizar os usuários.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={createUnitOpen} onOpenChange={(open) => !savingUnit && setCreateUnitOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateUnit}>
            <DialogHeader>
              <DialogTitle>Nova unidade</DialogTitle>
              <DialogDescription>Informe o nome da nova unidade.</DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <div className="space-y-2">
                <Label htmlFor="unit-name">Nome da unidade</Label>
                <Input
                  id="unit-name"
                  value={unitName}
                  onChange={(event) => setUnitName(event.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateUnitOpen(false)}
                disabled={savingUnit}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingUnit}>
                {savingUnit ? "Criando..." : "Criar unidade"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(unitEditForm)}
        onOpenChange={(open) => !open && !savingUnitEdit && setUnitEditForm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEditUnit}>
            <DialogHeader>
              <DialogTitle>Editar unidade</DialogTitle>
              <DialogDescription>
                O novo nome ficará disponível em todo o sistema e será salvo no banco de dados.
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <div className="space-y-2">
                <Label htmlFor="edit-unit-name">Nome da unidade</Label>
                <Input
                  id="edit-unit-name"
                  value={unitEditForm?.name ?? ""}
                  onChange={(event) =>
                    setUnitEditForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  autoFocus
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnitEditForm(null)}
                disabled={savingUnitEdit}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingUnitEdit}>
                {savingUnitEdit ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteUnitTarget)}
        onOpenChange={(open) => !open && !deletingUnit && setDeleteUnitTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir unidade</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUnitTarget
                ? `Deseja excluir "${deleteUnitTarget.name}" permanentemente? Os dados exclusivos desta unidade também serão removidos. Unidades com usuários vinculados não podem ser excluídas.`
                : "Deseja excluir esta unidade?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUnit}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingUnit}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteUnit();
              }}
            >
              {deletingUnit ? "Excluindo..." : "Excluir unidade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
