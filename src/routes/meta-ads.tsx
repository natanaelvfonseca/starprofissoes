import * as React from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import {
  AlertCircle,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  PanelsTopLeft,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Unplug,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { canConnectMetaAds, canManageMetaAds, canViewMetaAds } from "@/lib/auth-types";

type MetaIntegration = {
  app_id: string | null;
  graph_api_version: string;
  status: "active" | "inactive";
  callback_url: string | null;
  appSecret: "configured" | null;
  verifyToken: "configured" | null;
  last_communication_at: string | null;
  total_events_received: number;
  total_leads_created: number;
  total_errors: number;
};

type MetaPage = {
  id: string;
  page_name: string;
  page_id: string;
  tokenMasked: string | null;
  token_status: "unknown" | "valid" | "invalid";
  last_validated_at: string | null;
  subscription_status: "unknown" | "subscribed" | "not_subscribed" | "error";
  formsCount: number;
  leads_received_count: number;
  status: "active" | "inactive";
  last_error: string | null;
};

type MetaForm = {
  id: string;
  page_id: string;
  page_name: string;
  meta_page_id: string;
  form_name: string;
  meta_form_id: string;
  unit_id: string | null;
  unit_name: string | null;
  course_id: string | null;
  course_name: string | null;
  attendance_id: string | null;
  attendance_status: "active" | "inactive" | null;
  acquisition_channel_id: string | null;
  acquisition_channel_name: string | null;
  initial_stage: string;
  field_mapping: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  status: "active" | "inactive";
  leads_received_count: number;
  last_lead_received_at: string | null;
  synced_at: string | null;
  configurationLabel: string | null;
};

type MetaEvent = {
  id: string;
  page_id: string;
  form_id: string;
  leadgen_id: string;
  campaign_name: string | null;
  form_name: string | null;
  page_name: string | null;
  received_at: string;
  status: string;
  error_message: string | null;
  routing_error: string | null;
  routing_source: string | null;
  attendance_id: string | null;
  mapped_payload: { fullName?: string; phone?: string } | null;
};

type UnitOption = { id: string; name: string; slug: string };
type AttendanceOption = {
  id: string;
  unitId: string;
  courseId: string;
  status: "active" | "inactive";
  displayName: string;
};
type ChannelOption = { id: string; unitId: string; name: string; status: "active" | "inactive" };

type MetaState = {
  integration: MetaIntegration;
  pages: Array<MetaPage>;
  forms: Array<MetaForm>;
  processedEvents: Array<MetaEvent>;
  pendingEvents: Array<MetaEvent>;
  options: {
    units: Array<UnitOption>;
    attendances: Array<AttendanceOption>;
    channels: Array<ChannelOption>;
  };
};

type MetaConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type MetaDisconnectTarget = { scope: "page"; page: MetaPage } | { scope: "all" };

type FormDraft = {
  id: string;
  pageDbId: string;
  metaFormId: string;
  formName: string;
  unitId: string;
  attendanceId: string;
  acquisitionChannelId: string;
  initialStage: string;
  status: "active" | "inactive";
  fieldMapping: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
};

const emptyFormDraft: FormDraft = {
  id: "",
  pageDbId: "",
  metaFormId: "",
  formName: "",
  unitId: "",
  attendanceId: "",
  acquisitionChannelId: "",
  initialStage: "Novo lead",
  status: "inactive",
  fieldMapping: [],
  settings: {},
};

const stages = [
  "Novo lead",
  "Em contato",
  "Qualificado",
  "Proposta",
  "Pagamento pendente",
  "Recuperação",
];

async function readJson<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na operação.");
  return data;
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function eventLabel(event: MetaEvent) {
  return event.mapped_payload?.fullName || event.form_name || `Evento ${event.leadgen_id}`;
}

function connectionStatusFromState(data: MetaState): MetaConnectionStatus {
  const activePages = data.pages.filter((page) => page.status === "active");
  const hasConnectionError = activePages.some(
    (page) => page.token_status === "invalid" || page.subscription_status === "error",
  );

  if (data.integration.status === "active" && hasConnectionError) return "error";
  if (
    data.integration.status === "active" &&
    activePages.some((page) => Boolean(page.tokenMasked))
  ) {
    return "connected";
  }

  return "disconnected";
}

function mostRecentDate(values: Array<string | null>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return dates[0]?.toISOString() ?? null;
}

export const Route = createFileRoute("/meta-ads")({
  head: () => ({ meta: [{ title: "Meta Ads · Star Profissões" }] }),
  component: MetaAdsPage,
});

function MetaAdsPage() {
  const { session } = useAuth();
  const [data, setData] = React.useState<MetaState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [workingKey, setWorkingKey] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [metaConnectionStatus, setMetaConnectionStatus] =
    React.useState<MetaConnectionStatus>("disconnected");
  const [formDialogOpen, setFormDialogOpen] = React.useState(false);
  const [formDraft, setFormDraft] = React.useState<FormDraft>(emptyFormDraft);
  const [metaDisconnectTarget, setMetaDisconnectTarget] =
    React.useState<MetaDisconnectTarget | null>(null);
  const metaOAuthPopupTimerRef = React.useRef<ReturnType<typeof window.setInterval> | null>(null);
  const metaOAuthSucceededRef = React.useRef(false);
  const metaConnectionStatusBeforeOAuthRef = React.useRef<MetaConnectionStatus>("disconnected");
  const canManage = session ? canManageMetaAds(session.user.role) : false;
  const canConnect = session ? canConnectMetaAds(session.user.role) : false;

  const stopMetaOAuthPopupMonitor = React.useCallback(() => {
    if (metaOAuthPopupTimerRef.current !== null) {
      window.clearInterval(metaOAuthPopupTimerRef.current);
      metaOAuthPopupTimerRef.current = null;
    }
  }, []);

  const loadData = React.useCallback(
    async (query = appliedSearch) => {
      setLoading(true);
      try {
        const next = await readJson<MetaState>(
          await fetch(`/api/meta-ads?search=${encodeURIComponent(query)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );
        setData(next);
        setMetaConnectionStatus(connectionStatusFromState(next));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar Meta Ads.");
      } finally {
        setLoading(false);
      }
    },
    [appliedSearch],
  );

  React.useEffect(() => {
    if (session && canViewMetaAds(session.user.role)) void loadData();
  }, [loadData, session]);

  React.useEffect(() => {
    const handleMetaOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== "https://kogna.online" || event.data?.type !== "META_OAUTH_SUCCESS") {
        return;
      }

      metaOAuthSucceededRef.current = true;
      stopMetaOAuthPopupMonitor();
      setMetaConnectionStatus((current) =>
        current === "connecting" ? metaConnectionStatusBeforeOAuthRef.current : current,
      );
      void loadData();
    };

    window.addEventListener("message", handleMetaOAuthMessage);

    return () => window.removeEventListener("message", handleMetaOAuthMessage);
  }, [loadData, stopMetaOAuthPopupMonitor]);

  React.useEffect(
    () => () => {
      stopMetaOAuthPopupMonitor();
    },
    [stopMetaOAuthPopupMonitor],
  );

  if (session && !canViewMetaAds(session.user.role)) return <Navigate to="/" />;

  async function runAction(
    action: string,
    payload: Record<string, unknown>,
    success: string,
    key = action,
  ) {
    setWorkingKey(key);
    try {
      await readJson(
        await fetch("/api/meta-ads", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ action, ...payload }),
        }),
      );
      toast.success(success);
      await loadData();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na operação.");
      return false;
    } finally {
      setWorkingKey("");
    }
  }

  async function syncConnectedAssets() {
    const connectedPages = (data?.pages ?? []).filter(
      (page) => page.status === "active" && Boolean(page.tokenMasked),
    );

    if (!connectedPages.length) return;

    setWorkingKey("syncConnection");
    try {
      for (const page of connectedPages) {
        await readJson(
          await fetch("/api/meta-ads", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ action: "syncForms", pageDbId: page.id }),
          }),
        );
      }
      toast.success("Ativos da Meta sincronizados.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar a Meta.");
    } finally {
      setWorkingKey("");
    }
  }

  async function disconnectMetaTarget() {
    if (!metaDisconnectTarget) return;

    const disconnectingAll = metaDisconnectTarget.scope === "all";
    const key = disconnectingAll
      ? "disconnectMeta"
      : `disconnectPage-${metaDisconnectTarget.page.id}`;
    const body = disconnectingAll
      ? { action: "disconnectMeta" }
      : { action: "disconnectPage", pageId: metaDisconnectTarget.page.id };

    setWorkingKey(key);

    try {
      await readJson(
        await fetch("/api/meta-ads", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        }),
      );
      toast.success(disconnectingAll ? "Meta desconectada." : "Página desconectada.");
      setMetaDisconnectTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao desconectar a Meta.");
    } finally {
      await loadData();
      setWorkingKey("");
    }
  }

  async function connectWithMeta() {
    const width = 600;
    const height = 750;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "",
      "meta_oauth",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      toast.error("O navegador bloqueou a janela da Meta. Permita popups e tente novamente.");
      return;
    }

    stopMetaOAuthPopupMonitor();
    metaOAuthSucceededRef.current = false;
    metaConnectionStatusBeforeOAuthRef.current = metaConnectionStatus;
    metaOAuthPopupTimerRef.current = window.setInterval(() => {
      if (!popup.closed) {
        return;
      }

      stopMetaOAuthPopupMonitor();

      if (!metaOAuthSucceededRef.current) {
        setMetaConnectionStatus((current) =>
          current === "connecting" ? metaConnectionStatusBeforeOAuthRef.current : current,
        );
      }
    }, 500);

    popup.focus();
    setMetaConnectionStatus("connecting");

    try {
      const data = await readJson<{ url: string }>(
        await fetch("/api/meta/connect-url", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      );
      const connectUrl = new URL(data.url);

      if (connectUrl.origin !== "https://kogna.online" || connectUrl.pathname !== "/meta/connect") {
        throw new Error("URL de conexão Meta inválida.");
      }

      popup.location.href = data.url;
    } catch (error) {
      stopMetaOAuthPopupMonitor();

      if (!popup.closed) {
        popup.close();
      }

      setMetaConnectionStatus(metaConnectionStatusBeforeOAuthRef.current);
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar a conexão Meta.");
    }
  }

  function editForm(form: MetaForm) {
    setFormDraft({
      id: form.id,
      pageDbId: form.page_id,
      metaFormId: form.meta_form_id,
      formName: form.form_name,
      unitId: form.unit_id ?? "",
      attendanceId: form.attendance_id ?? "",
      acquisitionChannelId: form.acquisition_channel_id ?? "",
      initialStage: form.initial_stage || "Novo lead",
      status: form.status,
      fieldMapping: form.field_mapping ?? [],
      settings: form.settings ?? {},
    });
    setFormDialogOpen(true);
  }

  const activeAttendances = (data?.options.attendances ?? []).filter(
    (item) =>
      item.unitId === formDraft.unitId &&
      (item.status === "active" || item.id === formDraft.attendanceId),
  );
  const channels = (data?.options.channels ?? []).filter(
    (item) => item.unitId === formDraft.unitId && item.status === "active",
  );
  const metrics = data?.integration;
  const lastSynchronization = data
    ? mostRecentDate([
        ...data.forms.map((form) => form.synced_at),
        ...data.pages.map((page) => page.last_validated_at),
        data.integration.last_communication_at,
      ])
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Crescimento"
        title="Meta Ads"
        description="Integração de páginas, formulários, turmas e eventos de leads da Meta."
        actions={
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Eventos recebidos"
          value={metrics?.total_events_received ?? 0}
          icon={Webhook}
        />
        <MetricCard
          label="Leads criados"
          value={metrics?.total_leads_created ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          label="Pendentes"
          value={data?.pendingEvents.length ?? 0}
          icon={AlertCircle}
          tone="warning"
        />
        <MetricCard
          label="Erros"
          value={metrics?.total_errors ?? 0}
          icon={AlertCircle}
          tone="danger"
        />
      </div>

      <Tabs defaultValue="connection" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="connection">Conexão Meta</TabsTrigger>
          <TabsTrigger value="forms">Formulários</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <MetaConnectionPanel
            status={metaConnectionStatus}
            pages={data?.pages ?? []}
            lastSynchronization={lastSynchronization}
            loading={loading}
            canManage={canManage}
            canConnect={canConnect}
            syncing={workingKey === "syncConnection"}
            disconnecting={workingKey.startsWith("disconnect")}
            onConnect={connectWithMeta}
            onSync={() => void syncConnectedAssets()}
            onDisconnectPage={(page) => setMetaDisconnectTarget({ scope: "page", page })}
            onDisconnectAll={() => setMetaDisconnectTarget({ scope: "all" })}
          />
        </TabsContent>

        <TabsContent value="forms">
          <Card className="overflow-hidden border-primary/10 shadow-card">
            <CardHeader className="flex-row items-center justify-between border-b bg-primary/5">
              <div>
                <CardTitle className="text-base">Formulários de leads</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cada formulário ativo deve apontar para uma turma ativa.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Formulário</TableHead>
                    <TableHead>Turma</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-5 text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <LoadingRow columns={6} />
                  ) : data?.forms.length ? (
                    data.forms.map((form) => (
                      <TableRow key={form.id}>
                        <TableCell className="pl-5">
                          <div className="font-semibold">{form.form_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {form.page_name} · {form.meta_form_id}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          {form.attendance_id ? (
                            (data.options.attendances.find((item) => item.id === form.attendance_id)
                              ?.displayName ??
                            form.course_name ??
                            "Turma indisponível")
                          ) : (
                            <Badge variant="outline" className="text-amber-700">
                              Configuração legada
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{form.acquisition_channel_name ?? "—"}</TableCell>
                        <TableCell>{form.leads_received_count}</TableCell>
                        <TableCell>
                          <StatusBadge status={form.status} />
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => editForm(form)}
                            disabled={!canManage}
                          >
                            <Settings2 />
                            Configurar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow
                      columns={6}
                      text={
                        data?.pages.length
                          ? "Sincronize uma página para trazer os formulários."
                          : "Conecte a Meta para trazer os formulários."
                      }
                    />
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <form
            className="flex max-w-xl gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search);
              void loadData(search);
            }}
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nome, telefone, evento, formulário ou campanha"
            />
            <Button type="submit" variant="outline">
              <Search />
              Pesquisar
            </Button>
          </form>
          <EventTable
            title="Pendentes de configuração"
            events={data?.pendingEvents ?? []}
            loading={loading}
            canManage={canManage}
            workingKey={workingKey}
            onReprocess={(event) =>
              void runAction(
                "reprocessEvent",
                { eventId: event.id },
                "Evento reprocessado.",
                `event-${event.id}`,
              )
            }
          />
          <EventTable
            title="Eventos processados"
            events={data?.processedEvents ?? []}
            loading={loading}
            canManage={false}
            workingKey={workingKey}
            onReprocess={() => undefined}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar formulário</DialogTitle>
            <DialogDescription>
              A turma selecionada define unidade, curso, local e responsáveis dos próximos leads.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3 md:grid-cols-2">
            <Field label="Formulário">
              <Input value={formDraft.formName} disabled />
            </Field>
            <Field label="Unidade">
              <Select
                value={formDraft.unitId}
                onValueChange={(value) =>
                  setFormDraft((current) => ({
                    ...current,
                    unitId: value,
                    attendanceId: "",
                    acquisitionChannelId: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {data?.options.units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="space-y-2 md:col-span-2">
              <Label>Turma</Label>
              <Select
                value={formDraft.attendanceId}
                onValueChange={(value) =>
                  setFormDraft((current) => ({ ...current, attendanceId: value }))
                }
                disabled={!formDraft.unitId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  {activeAttendances.map((attendance) => (
                    <SelectItem key={attendance.id} value={attendance.id}>
                      {attendance.displayName}
                      {attendance.status === "inactive" ? " · Inativa" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formDraft.unitId && !activeAttendances.some((item) => item.status === "active") ? (
                <p className="text-xs text-muted-foreground">Nenhuma turma ativa nesta unidade</p>
              ) : null}
            </div>
            <Field label="Canal de aquisição">
              <Select
                value={formDraft.acquisitionChannelId}
                onValueChange={(value) =>
                  setFormDraft((current) => ({ ...current, acquisitionChannelId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Etapa inicial">
              <Select
                value={formDraft.initialStage}
                onValueChange={(value) =>
                  setFormDraft((current) => ({ ...current, initialStage: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={formDraft.status}
                onValueChange={(value) =>
                  setFormDraft((current) => ({
                    ...current,
                    status: value as "active" | "inactive",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                workingKey === "saveForm" ||
                (formDraft.status === "active" && !formDraft.attendanceId)
              }
              onClick={async () => {
                if (await runAction("saveForm", formDraft, "Formulário configurado."))
                  setFormDialogOpen(false);
              }}
            >
              {workingKey === "saveForm" ? <Loader2 className="animate-spin" /> : <Save />}Salvar
              configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(metaDisconnectTarget)}
        onOpenChange={(open) =>
          !open && !workingKey.startsWith("disconnect") && setMetaDisconnectTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {metaDisconnectTarget?.scope === "all"
                ? "Desconectar a Meta da Star Profissões?"
                : "Desconectar esta página?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {metaDisconnectTarget?.scope === "all"
                ? "Todas as páginas conectadas deixarão de enviar novos leads para o CRM. Os dados e leads existentes serão preservados."
                : "A Star deixará de receber novos leads e sincronizar formulários desta página. Os leads que já entraram no CRM serão preservados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={workingKey.startsWith("disconnect")}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={workingKey.startsWith("disconnect")}
              onClick={(event) => {
                event.preventDefault();
                void disconnectMetaTarget();
              }}
            >
              {workingKey.startsWith("disconnect") ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Unplug />
              )}
              {metaDisconnectTarget?.scope === "all" ? "Desconectar Meta" : "Desconectar página"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetaConnectionPanel({
  status,
  pages,
  lastSynchronization,
  loading,
  canManage,
  canConnect,
  syncing,
  disconnecting,
  onConnect,
  onSync,
  onDisconnectPage,
  onDisconnectAll,
}: {
  status: MetaConnectionStatus;
  pages: Array<MetaPage>;
  lastSynchronization: string | null;
  loading: boolean;
  canManage: boolean;
  canConnect: boolean;
  syncing: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onSync: () => void;
  onDisconnectPage: (page: MetaPage) => void;
  onDisconnectAll: () => void;
}) {
  const connectedPages = pages.filter(
    (page) => page.status === "active" && Boolean(page.tokenMasked),
  );
  const primaryPage = connectedPages[0] ?? null;

  if (loading && !pages.length) {
    return (
      <Card className="border-primary/10 shadow-card">
        <CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando conexão Meta...</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "connecting") {
    return (
      <Card className="border-primary/10 shadow-card" aria-live="polite">
        <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
          <MetaBrandMark />
          <Loader2 className="h-7 w-7 animate-spin text-[#0866ff]" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Conectando à Meta...</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Você será direcionado para concluir a autorização com segurança.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="border-red-200/80 shadow-card">
        <CardContent className="flex min-h-80 flex-col items-center justify-center gap-5 px-6 text-center">
          <MetaBrandMark />
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight">
              Não foi possível concluir a conexão com a Meta
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Tente autorizar novamente. Nenhuma credencial técnica precisa ser informada nesta
              tela.
            </p>
          </div>
          <Button onClick={onConnect} disabled={!canConnect}>
            <ExternalLink />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "disconnected") {
    return (
      <Card className="overflow-hidden border-primary/10 shadow-card">
        <CardContent className="relative flex min-h-[25rem] flex-col items-center justify-center gap-6 px-6 py-14 text-center">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0866ff]/8 to-transparent" />
          <MetaBrandMark />
          <div className="relative max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0866ff]">
              Meta
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Conecte a Star Profissões à Meta
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Conecte o portfólio empresarial da Star Profissões para acessar suas páginas, contas
              de anúncios, formulários instantâneos e leads.
            </p>
          </div>
          <Button size="lg" onClick={onConnect} disabled={!canConnect}>
            <ExternalLink />
            Conectar com a Meta
          </Button>
          <p className="relative max-w-xl text-xs leading-5 text-muted-foreground">
            A conexão é realizada diretamente pela Meta. Sua senha do Facebook não é compartilhada
            com a plataforma.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-emerald-200/70 shadow-card">
        <CardHeader className="border-b bg-gradient-to-r from-emerald-50/90 via-background to-[#0866ff]/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MetaBrandMark compact />
              <div>
                <CardTitle className="text-lg">Meta conectada</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Anúncios e formulários integrados à Star Profissões.
                </p>
              </div>
            </div>
            <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Conectado
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ConnectionInfo
              icon={Building2}
              label="Portfólio empresarial"
              value="Será identificado pela autorização OAuth"
            />
            <ConnectionInfo
              icon={PanelsTopLeft}
              label="Página"
              value={primaryPage?.page_name ?? "Nenhuma página autorizada"}
            />
            <ConnectionInfo
              icon={BadgeDollarSign}
              label="Conta de anúncios"
              value="Será identificada pela autorização OAuth"
            />
            <ConnectionInfo
              icon={Clock3}
              label="Última sincronização"
              value={dateTime(lastSynchronization)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onSync} disabled={!canManage || syncing || !connectedPages.length}>
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Sincronizar agora
            </Button>
            <Button variant="outline" onClick={onConnect} disabled={!canConnect || disconnecting}>
              <Settings2 />
              Gerenciar conexão
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onDisconnectAll}
              disabled={!canManage || !connectedPages.length || disconnecting}
            >
              <Unplug />
              Desconectar Meta
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Ativos conectados</CardTitle>
          <p className="text-xs text-muted-foreground">
            Páginas e contas autorizadas diretamente pela Meta.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {connectedPages.map((page) => (
            <div
              key={page.id}
              className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-lg bg-[#0866ff]/10 p-2 text-[#0866ff]">
                  <PanelsTopLeft className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Página</p>
                  <p className="truncate font-semibold">{page.page_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    ID: {page.page_id} · {page.formsCount} formulário(s)
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDisconnectPage(page)}
                  disabled={!canManage || disconnecting}
                >
                  <Unplug />
                  Desconectar página
                </Button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed bg-muted/10 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                <BadgeDollarSign className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Conta de anúncios</p>
                <p className="font-semibold">Aguardando autorização OAuth</p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">
              Em breve
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetaBrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label="Meta"
      className={`relative flex items-center justify-center rounded-2xl bg-[#0866ff] font-semibold text-white shadow-[0_16px_35px_-18px_rgba(8,102,255,0.8)] ${
        compact ? "h-11 w-11 text-3xl" : "h-16 w-16 text-5xl"
      }`}
    >
      <span className="-translate-y-0.5" aria-hidden="true">
        ∞
      </span>
    </div>
  );
}

function ConnectionInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-sm font-semibold leading-5">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: typeof Webhook;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  };
  return (
    <Card className="border-primary/10 shadow-card">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
        <div className={`rounded-xl p-3 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return status === "active" ? (
    <Badge className="bg-emerald-100 text-emerald-700">Ativo</Badge>
  ) : (
    <Badge variant="secondary">Inativo</Badge>
  );
}

function LoadingRow({ columns }: { columns: number }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="h-24 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="h-24 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function EventTable({
  title,
  events,
  loading,
  canManage,
  workingKey,
  onReprocess,
}: {
  title: string;
  events: Array<MetaEvent>;
  loading: boolean;
  canManage: boolean;
  workingKey: string;
  onReprocess: (event: MetaEvent) => void;
}) {
  return (
    <Card className="overflow-hidden border-primary/10 shadow-card">
      <CardHeader className="border-b bg-primary/5">
        <CardTitle className="text-base">
          {title}{" "}
          <Badge variant="secondary" className="ml-2">
            {events.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Lead / evento</TableHead>
              <TableHead>Formulário</TableHead>
              <TableHead>Campanha</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead className="pr-5 text-right">Ação</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRow columns={canManage ? 6 : 5} />
            ) : events.length ? (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="pl-5">
                    <div className="font-semibold">{eventLabel(event)}</div>
                    <div className="max-w-56 truncate text-xs text-muted-foreground">
                      {event.id}
                    </div>
                    {event.error_message || event.routing_error ? (
                      <div className="mt-1 max-w-md whitespace-normal text-xs text-red-600">
                        {event.error_message ?? event.routing_error}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div>{event.form_name ?? event.form_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.page_name ?? event.page_id}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    {event.campaign_name ?? "—"}
                  </TableCell>
                  <TableCell>{dateTime(event.received_at)}</TableCell>
                  <TableCell>
                    <Badge variant={event.status === "processed" ? "default" : "outline"}>
                      {event.status}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="pr-5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(workingKey)}
                        onClick={() => onReprocess(event)}
                      >
                        {workingKey === `event-${event.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RefreshCw />
                        )}
                        Reprocessar
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <EmptyRow columns={canManage ? 6 : 5} text="Nenhum evento nesta lista." />
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
