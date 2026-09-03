import * as React from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Cable, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { useAuth } from "@/lib/auth";
import { canManageMetaAds } from "@/lib/auth-types";

type LeadFormConnection = {
  formId: string;
  formName: string | null;
  pageId: string | null;
  turmaId: string | null;
  turmaName: string | null;
  unitId: string | null;
  unitName: string | null;
  status: "connected" | "pending_configuration";
};

type AttendanceOption = {
  id: string;
  unitId: string;
  unitName: string;
  name: string;
};

type LeadIntegrationsData = {
  forms: Array<LeadFormConnection>;
  attendances: Array<AttendanceOption>;
};

async function readJson<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na operação.");
  return data;
}

export const Route = createFileRoute("/integracoes-leads")({
  head: () => ({ meta: [{ title: "Integrações de Leads · Star Profissões" }] }),
  component: LeadIntegrationsPage,
});

function LeadIntegrationsPage() {
  const { session } = useAuth();
  const [data, setData] = React.useState<LeadIntegrationsData>({ forms: [], attendances: [] });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [selectedForm, setSelectedForm] = React.useState<LeadFormConnection | null>(null);
  const [selectedAttendanceId, setSelectedAttendanceId] = React.useState("");
  const canManage = session ? canManageMetaAds(session.user.role) : false;

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await readJson<LeadIntegrationsData>(
          await fetch("/api/lead-integrations", {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar integrações.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (session && canManage) void loadData();
  }, [canManage, loadData, session]);

  if (session && !canManage) return <Navigate to="/" />;

  const attendancesByUnit = data.attendances.reduce<Record<string, Array<AttendanceOption>>>(
    (groups, attendance) => {
      (groups[attendance.unitName] ??= []).push(attendance);
      return groups;
    },
    {},
  );

  const openConnection = (form: LeadFormConnection) => {
    setSelectedForm(form);
    setSelectedAttendanceId(form.turmaId ?? "");
  };

  const closeConnection = () => {
    if (saving) return;
    setSelectedForm(null);
    setSelectedAttendanceId("");
  };

  const saveConnection = async () => {
    if (!selectedForm || !selectedAttendanceId) return;
    setSaving(true);
    try {
      await readJson(
        await fetch("/api/lead-integrations", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            formId: selectedForm.formId,
            turmaId: selectedAttendanceId,
          }),
        }),
      );
      toast.success("Formulário conectado à turma.");
      setSelectedForm(null);
      setSelectedAttendanceId("");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar conexão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integração temporária Make → Star"
        title="Integrações de Leads"
        description="Conecte cada formulário recebido pelo Make a uma turma existente na Star."
        actions={
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Atualizar
          </Button>
        }
      />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Formulários recebidos</CardTitle>
          <CardDescription>
            A unidade é determinada automaticamente pela turma selecionada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando formulários...
            </div>
          ) : data.forms.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Formulário</TableHead>
                    <TableHead>Form ID</TableHead>
                    <TableHead>Turma conectada</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.forms.map((form) => (
                    <TableRow key={form.formId}>
                      <TableCell className="font-medium">
                        {form.formName || "Nome não informado"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{form.formId}</TableCell>
                      <TableCell>{form.turmaName || "—"}</TableCell>
                      <TableCell>{form.unitName || "—"}</TableCell>
                      <TableCell>
                        {form.status === "connected" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            Conectado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Aguardando configuração</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openConnection(form)}>
                          {form.turmaId ? "Alterar" : "Conectar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Cable className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="font-bold">Nenhum formulário recebido</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Assim que o Make enviar um formulário novo, ele aparecerá aqui para configuração.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedForm)} onOpenChange={(open) => !open && closeConnection()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Conectar formulário</DialogTitle>
            <DialogDescription>
              {selectedForm?.formName || "Formulário sem nome"} · ID {selectedForm?.formId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="lead-integration-attendance">Turma</Label>
            <Select value={selectedAttendanceId} onValueChange={setSelectedAttendanceId}>
              <SelectTrigger id="lead-integration-attendance">
                <SelectValue placeholder="Selecione uma turma" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(attendancesByUnit).map(([unitName, attendances]) => (
                  <SelectGroup key={unitName}>
                    <SelectLabel>{unitName}</SelectLabel>
                    {attendances.map((attendance) => (
                      <SelectItem key={attendance.id} value={attendance.id}>
                        {attendance.name} · {attendance.unitName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {!data.attendances.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma turma ativa está disponível nas suas unidades.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeConnection} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void saveConnection()}
              disabled={saving || !selectedAttendanceId}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Salvar conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
