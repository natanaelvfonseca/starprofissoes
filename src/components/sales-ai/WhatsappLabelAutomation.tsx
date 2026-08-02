import * as React from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AutomationData = {
  instances: Array<{
    id: string;
    name: string;
    consultantName: string;
    consultantEmail: string;
    status: string;
    labelsSyncedAt: string | null;
  }>;
  selectedInstanceId: string | null;
  labels: Array<{ id: string; name: string; color: string | null }>;
  labelsError: string | null;
  webhookError: string | null;
  evolutionVersion: string | null;
  rules: Array<{
    id: string;
    instanceId: string;
    labelId: string;
    labelName: string;
    pipelineColumnId: string;
    pipelineColumnName: string;
    active: boolean;
    updatedAt: string;
  }>;
  columns: Array<{ id: string; name: string; color: string; position: number }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    action: string;
    labelName: string | null;
    phone: string | null;
    status: "processed" | "ignored" | "unresolved" | "error" | "processing";
    reason: string | null;
    errorMessage: string | null;
    createdAt: string;
    leadName: string | null;
    consultantName: string | null;
    previousColumnName: string | null;
    nextColumnName: string | null;
  }>;
  summary: {
    active: boolean;
    activeRules: number;
    totalRules: number;
    lastSyncAt: string | null;
    lastEventAt: string | null;
  };
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function formatDate(value: string | null) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateFormatter.format(date);
}

function eventTone(status: AutomationData["recentEvents"][number]["status"]) {
  if (status === "processed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "unresolved") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function eventLabel(status: AutomationData["recentEvents"][number]["status"]) {
  return {
    processed: "Movido",
    ignored: "Ignorado",
    unresolved: "Não localizado",
    error: "Erro",
    processing: "Processando",
  }[status];
}

export function WhatsappLabelAutomation({ unitId }: { unitId: string | null }) {
  const [data, setData] = React.useState<AutomationData | null>(null);
  const [instanceId, setInstanceId] = React.useState("");
  const [labelId, setLabelId] = React.useState("");
  const [columnId, setColumnId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(
    async (silent = false, requestedInstanceId = instanceId) => {
      if (!unitId) return;
      if (!silent) setLoading(true);

      try {
        const params = new URLSearchParams({ unitId });
        if (requestedInstanceId) params.set("instanceId", requestedInstanceId);
        const response = await requestJson<{ ok: true } & AutomationData>(
          `/api/integrations/evolution-labels?${params.toString()}`,
        );
        setData(response);
        setInstanceId(response.selectedInstanceId ?? "");
        setLabelId((current) =>
          current && response.labels.some((label) => label.id === current)
            ? current
            : response.labels[0]?.id ?? "",
        );
        setColumnId((current) =>
          current && response.columns.some((column) => column.id === current)
            ? current
            : response.columns[0]?.id ?? "",
        );
      } catch (error) {
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar automações.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [instanceId, unitId],
  );

  React.useEffect(() => {
    setData(null);
    setInstanceId("");
    void load(false, "");
  }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addRule() {
    if (!unitId || !instanceId || !labelId || !columnId) {
      toast.error("Selecione a instância, a etiqueta e a etapa.");
      return;
    }
    setSaving(true);
    try {
      await requestJson("/api/integrations/evolution-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, instanceId, labelId, pipelineColumnId: columnId }),
      });
      await load(true);
      toast.success("Regra de etiqueta salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRule(
    rule: AutomationData["rules"][number],
    changes: Partial<Pick<typeof rule, "pipelineColumnId" | "active">>,
  ) {
    if (!unitId) return;
    const next = { ...rule, ...changes };
    setData((current) =>
      current
        ? {
            ...current,
            rules: current.rules.map((item) => (item.id === rule.id ? next : item)),
          }
        : current,
    );
    try {
      await requestJson("/api/integrations/evolution-labels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          ruleId: rule.id,
          pipelineColumnId: next.pipelineColumnId,
          active: next.active,
        }),
      });
      await load(true);
    } catch (error) {
      await load(true);
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar a regra.");
    }
  }

  async function removeRule(ruleId: string) {
    if (!unitId || !window.confirm("Excluir esta regra de automação?")) return;
    try {
      await requestJson("/api/integrations/evolution-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, ruleId }),
      });
      await load(true);
      toast.success("Regra excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir a regra.");
    }
  }

  if (!unitId) {
    return (
      <Card className="border-primary/15">
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Selecione uma unidade para configurar a automação por etiquetas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={data?.summary.active ? CheckCircle2 : WifiOff}
          label="Status"
          value={data?.summary.active ? "Automação ativa" : "Sem regras ativas"}
          active={data?.summary.active}
        />
        <StatusCard
          icon={Tag}
          label="Regras"
          value={`${data?.summary.activeRules ?? 0} ativas de ${data?.summary.totalRules ?? 0}`}
        />
        <StatusCard
          icon={Clock3}
          label="Última sincronização"
          value={formatDate(data?.summary.lastSyncAt ?? null)}
        />
        <StatusCard
          icon={Wifi}
          label="Evolution API"
          value={data?.evolutionVersion ? `Versão ${data.evolutionVersion}` : "Versão não informada"}
        />
      </div>

      <Card className="overflow-hidden border-primary/15 shadow-card">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4 text-primary" /> Automação por etiquetas
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Etiqueta adicionada no WhatsApp move o lead para a etapa definida no CRM.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={instanceId}
                onValueChange={(value) => {
                  setInstanceId(value);
                  void load(false, value);
                }}
              >
                <SelectTrigger className="w-full sm:w-[310px]">
                  <SelectValue placeholder="Instância do consultor" />
                </SelectTrigger>
                <SelectContent>
                  {data?.instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.consultantName} · {instance.status === "connected" ? "online" : "offline"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Sincronizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          {data?.labelsError || data?.webhookError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {data.labelsError
                ? `Etiquetas indisponíveis: ${data.labelsError}`
                : `Webhook pendente: ${data.webhookError}`}
            </div>
          ) : null}

          {!data?.instances.length && !loading ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <WifiOff className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <p className="mt-3 font-semibold">Nenhuma instância de consultor nesta unidade</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O consultor precisa iniciar a conexão na IA Comercial antes de criar regras.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)_auto] lg:items-end">
              <div className="space-y-2">
                <Label>Etiqueta do WhatsApp</Label>
                <Select value={labelId} onValueChange={setLabelId} disabled={!data?.labels.length}>
                  <SelectTrigger><SelectValue placeholder="Selecione a etiqueta" /></SelectTrigger>
                  <SelectContent>
                    {data?.labels.map((label) => (
                      <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="mb-2 hidden h-5 w-5 text-primary lg:block" />
              <div className="space-y-2">
                <Label>Etapa do pipeline</Label>
                <Select value={columnId} onValueChange={setColumnId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                  <SelectContent>
                    {data?.columns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void addRule()} disabled={saving || !labelId || !columnId}>
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar regra
              </Button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Etapa no CRM</TableHead>
                  <TableHead className="w-28">Ativa</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rules.length ? data.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#F4B728]" /> {rule.labelName}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">ID {rule.labelId}</p>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rule.pipelineColumnId}
                        onValueChange={(value) => void updateRule(rule, { pipelineColumnId: value })}
                      >
                        <SelectTrigger className="h-9 min-w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {data.columns.map((column) => (
                            <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.active}
                        onCheckedChange={(active) => void updateRule(rule, { active })}
                        aria-label={`Ativar regra ${rule.labelName}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => void removeRule(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-primary/15 shadow-card">
        <CardHeader className="border-b border-border/70 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" /> Eventos recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {data?.recentEvents.length ? data.recentEvents.map((event) => (
            <div key={event.id} className="grid gap-3 px-5 py-4 md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-center">
              <div>
                <Badge variant="outline" className={eventTone(event.status)}>{eventLabel(event.status)}</Badge>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{formatDate(event.createdAt)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {event.labelName ?? "Etiqueta"}{event.leadName ? ` · ${event.leadName}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{event.reason ?? event.errorMessage ?? "Evento recebido."}</p>
              </div>
              {event.nextColumnName ? (
                <Badge variant="secondary" className="w-fit bg-primary/10 text-primary">
                  {event.previousColumnName ?? "Sem etapa"} <ArrowRight className="mx-1 h-3 w-3" /> {event.nextColumnName}
                </Badge>
              ) : null}
            </div>
          )) : (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum evento de etiqueta recebido.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  active = false,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <Card className="border-primary/15 shadow-card">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", active ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary")}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
