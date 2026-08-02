import * as React from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { canManageMetaAds, canViewMetaAds } from "@/lib/auth-types";

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
  const [integrationForm, setIntegrationForm] = React.useState({
    appId: "",
    appSecret: "",
    verifyToken: "",
    graphApiVersion: "v23.0",
    callbackUrl: "",
    status: "inactive" as "active" | "inactive",
  });
  const [pageDialogOpen, setPageDialogOpen] = React.useState(false);
  const [pageForm, setPageForm] = React.useState({
    pageName: "",
    pageId: "",
    pageAccessToken: "",
    status: "active" as "active" | "inactive",
  });
  const [formDialogOpen, setFormDialogOpen] = React.useState(false);
  const [formDraft, setFormDraft] = React.useState<FormDraft>(emptyFormDraft);
  const canManage = session ? canManageMetaAds(session.user.role) : false;

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
        setIntegrationForm((current) => ({
          ...current,
          appId: next.integration.app_id ?? "",
          graphApiVersion: next.integration.graph_api_version || "v23.0",
          callbackUrl:
            next.integration.callback_url || `${window.location.origin}/api/webhooks/meta-leads`,
          status: next.integration.status,
        }));
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

      <Tabs defaultValue="forms" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="forms">Formulários</TabsTrigger>
          <TabsTrigger value="pages">Páginas e integração</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

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
                          : "Cadastre uma página da Meta para começar."
                      }
                    />
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          <Card className="border-primary/10 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" />
                Integração
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="App ID">
                <Input
                  value={integrationForm.appId}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({ ...current, appId: event.target.value }))
                  }
                  disabled={!canManage}
                />
              </Field>
              <Field label={`App Secret${metrics?.appSecret ? " · configurado" : ""}`}>
                <Input
                  type="password"
                  value={integrationForm.appSecret}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({ ...current, appSecret: event.target.value }))
                  }
                  placeholder={metrics?.appSecret ? "Manter segredo atual" : "Informe o App Secret"}
                  disabled={!canManage}
                />
              </Field>
              <Field label={`Token de verificação${metrics?.verifyToken ? " · configurado" : ""}`}>
                <Input
                  type="password"
                  value={integrationForm.verifyToken}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      verifyToken: event.target.value,
                    }))
                  }
                  placeholder={metrics?.verifyToken ? "Manter token atual" : "Informe o token"}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Versão Graph API">
                <Input
                  value={integrationForm.graphApiVersion}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      graphApiVersion: event.target.value,
                    }))
                  }
                  disabled={!canManage}
                />
              </Field>
              <Field label="URL do webhook">
                <div className="flex gap-2">
                  <Input
                    value={integrationForm.callbackUrl}
                    onChange={(event) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        callbackUrl: event.target.value,
                      }))
                    }
                    disabled={!canManage}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Copiar URL"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(integrationForm.callbackUrl)
                        .then(() => toast.success("URL copiada."))
                    }
                  >
                    <Copy />
                  </Button>
                </div>
              </Field>
              <Field label="Status">
                <Select
                  value={integrationForm.status}
                  onValueChange={(value) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      status: value as "active" | "inactive",
                    }))
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="inactive">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2 xl:col-span-3">
                <Button
                  onClick={() =>
                    void runAction("saveIntegration", integrationForm, "Integração salva.")
                  }
                  disabled={!canManage || workingKey === "saveIntegration"}
                >
                  {workingKey === "saveIntegration" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  Salvar integração
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-primary/10 shadow-card">
            <CardHeader className="flex-row items-center justify-between border-b bg-primary/5">
              <CardTitle className="text-base">Páginas conectadas</CardTitle>
              <Button onClick={() => setPageDialogOpen(true)} disabled={!canManage}>
                <Plus />
                Adicionar página
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Página</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Formulários</TableHead>
                    <TableHead className="pr-5 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <LoadingRow columns={5} />
                  ) : data?.pages.length ? (
                    data.pages.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="pl-5">
                          <div className="font-semibold">{page.page_name}</div>
                          <div className="text-xs text-muted-foreground">{page.page_id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{page.tokenMasked ?? "Não informado"}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {page.token_status}
                          </div>
                        </TableCell>
                        <TableCell>
                          {page.subscription_status === "subscribed" ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Inscrita</Badge>
                          ) : (
                            <Badge variant="outline">{page.subscription_status}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{page.formsCount}</TableCell>
                        <TableCell className="pr-5">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canManage || Boolean(workingKey)}
                              onClick={() =>
                                void runAction(
                                  "validatePage",
                                  { pageDbId: page.id },
                                  "Token validado.",
                                  `validate-${page.id}`,
                                )
                              }
                            >
                              Validar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canManage || Boolean(workingKey)}
                              onClick={() =>
                                void runAction(
                                  "subscribePage",
                                  { pageDbId: page.id },
                                  "Página inscrita no webhook.",
                                  `subscribe-${page.id}`,
                                )
                              }
                            >
                              Inscrever
                            </Button>
                            <Button
                              size="sm"
                              disabled={!canManage || Boolean(workingKey)}
                              onClick={() =>
                                void runAction(
                                  "syncForms",
                                  { pageDbId: page.id },
                                  "Formulários sincronizados.",
                                  `sync-${page.id}`,
                                )
                              }
                            >
                              {workingKey === `sync-${page.id}` ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <RefreshCw />
                              )}
                              Sincronizar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow columns={5} text="Nenhuma página conectada." />
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

      <Dialog open={pageDialogOpen} onOpenChange={setPageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar página da Meta</DialogTitle>
            <DialogDescription>
              Informe os dados da página que receberá os formulários de leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <Field label="Nome da página">
              <Input
                value={pageForm.pageName}
                onChange={(event) =>
                  setPageForm((current) => ({ ...current, pageName: event.target.value }))
                }
              />
            </Field>
            <Field label="Page ID">
              <Input
                value={pageForm.pageId}
                onChange={(event) =>
                  setPageForm((current) => ({ ...current, pageId: event.target.value }))
                }
              />
            </Field>
            <Field label="Token de acesso da página">
              <Input
                type="password"
                value={pageForm.pageAccessToken}
                onChange={(event) =>
                  setPageForm((current) => ({ ...current, pageAccessToken: event.target.value }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPageDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !pageForm.pageName.trim() || !pageForm.pageId.trim() || workingKey === "savePage"
              }
              onClick={async () => {
                if (await runAction("savePage", pageForm, "Página salva.")) {
                  setPageDialogOpen(false);
                  setPageForm({ pageName: "", pageId: "", pageAccessToken: "", status: "active" });
                }
              }}
            >
              {workingKey === "savePage" ? <Loader2 className="animate-spin" /> : <Save />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
