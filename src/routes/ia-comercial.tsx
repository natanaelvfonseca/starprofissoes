import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canViewAttendances, canViewSalesAi } from "@/lib/auth-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Tab = "visao" | "analises" | "conversas";
type Period = "today" | "7d" | "30d";

type ConsultantInsight = {
  id: string;
  name: string;
  whatsappStatus: string;
  conversations: number;
  inbound: number;
  outbound: number;
  lastMessageAt: string | null;
  sampleCount: number;
  sampleScore: number | null;
  sampleAt: string | null;
  latestReview: null | {
    score: number | null;
    at: string;
    summary: string | null;
    actions: string[];
    improvements: string[];
  };
};

type Overview = {
  unit: { id: string; name: string };
  period: { preset: Period; start: string; end: string };
  consultants: ConsultantInsight[];
  totals: {
    consultants: number;
    connected: number;
    conversations: number;
    inbound: number;
    outbound: number;
    analyzed: number;
    sampleScore: number | null;
  };
  updatedAt: string;
};

const LazySalesAi = React.lazy(() => import("@/components/inteligencia/SalesAiWorkspace"));
const LazyWhatsapp = React.lazy(() => import("@/components/inteligencia/WhatsappConversations"));
const formatter = new Intl.NumberFormat("pt-BR");

function dateLabel(date: string | null) {
  if (!date) return "Não disponível";
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? "Não disponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(d);
}

function DashboardMetric({
  label,
  value,
  note,
  icon: Icon,
  color = "#326DDD",
}: {
  label: string;
  value: number | string;
  note: string;
  icon: LucideIcon;
  color?: string;
}) {
  return (
    <Card className="rounded-[22px] border-[#E1E8F3] bg-white p-5 shadow-[0_18px_42px_-37px_rgba(22,38,87,.4)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold leading-5 text-[#70809A]">{label}</span>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ color, backgroundColor: color + "14" }}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3 text-[34px] font-black leading-tight tracking-tight text-[#14274C]">
        {typeof value === "number" ? formatter.format(value) : value}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#94A1B5]">{note}</p>
    </Card>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 rounded-[24px] border-[#E1E8F3] bg-white p-5 shadow-[0_16px_45px_-42px_rgba(22,38,87,.35)] sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-extrabold tracking-tight text-[#15284D]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-[#8997AC]">{subtitle}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function LoadingTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-32 animate-pulse rounded-2xl bg-[#EDF1F8]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[#EDF1F8]" />
    </div>
  );
}

export const Route = createFileRoute("/ia-comercial")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (["visao", "analises", "conversas"].includes(String(search.tab))
      ? search.tab
      : undefined) as Tab | undefined,
    consultantId:
      typeof search.consultantId === "string" && /^[0-9a-f-]{36}$/i.test(search.consultantId)
        ? search.consultantId
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Inteligência Comercial | Star Profissões" }] }),
  component: CommercialIntelligence,
});

function CommercialIntelligence() {
  const { session } = useAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const role = session?.user.role;
  const isConsultant = role === "CONSULTOR";
  const canAccess = role ? canViewSalesAi(role) : false;
  const manager = role ? canViewAttendances(role) : false;
  const requestedTab: Tab = search.tab ?? (isConsultant ? "analises" : "visao");
  const tab = isConsultant && requestedTab === "visao" ? "analises" : requestedTab;
  const unitId = session?.activeUnit?.id ?? "";
  const [period, setPeriod] = React.useState<Period>("7d");
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [refreshCount, setRefreshCount] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState("");

  const navigateTo = React.useCallback(
    (nextTab: Tab, consultantId?: string) => {
      void navigate({
        search: { tab: nextTab, consultantId },
        replace: false,
      });
    },
    [navigate],
  );

  React.useEffect(() => {
    if (tab !== "visao" || !manager || !unitId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setOverview(null);
    fetch(`/api/ia-comercial/visao?period=${period}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar a visão gerencial.");
        return payload as Overview;
      })
      .then((payload) => {
        if (!controller.signal.aborted && payload.unit.id === unitId) {
          setOverview(payload);
          setSelectedId((current) =>
            payload.consultants.some((x) => x.id === current)
              ? current
              : (payload.consultants[0]?.id ?? ""),
          );
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Não foi possível carregar.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, manager, unitId, period, refreshCount]);

  if (!session) return <LoadingTab />;
  if (!canAccess)
    return (
      <div className="rounded-xl bg-white p-6 text-sm text-[#7B879E]">
        Acesso não autorizado à Inteligência Comercial.
      </div>
    );

  const consultant = overview?.consultants.find((item) => item.id === selectedId) ?? null;
  const hasAccessToConversations = isConsultant || session.features.whatsappSupervision;
  const tabs: Array<{ id: Tab; text: string; icon: LucideIcon }> = isConsultant
    ? [
        { id: "analises", text: "Minha IA e conexão", icon: BrainCircuit },
        { id: "conversas", text: "Intervenções da liderança", icon: MessageCircleMore },
      ]
    : [
        { id: "visao", text: "Visão da equipe", icon: BarChart3 },
        { id: "analises", text: "Análise IA e scripts", icon: BrainCircuit },
        ...(hasAccessToConversations
          ? [{ id: "conversas" as const, text: "Conversas WhatsApp", icon: MessageCircleMore }]
          : []),
      ];

  const topAttention = (overview?.consultants ?? [])
    .filter((item) => item.sampleScore !== null && item.sampleScore < 65)
    .sort((a, b) => (a.sampleScore ?? 0) - (b.sampleScore ?? 0));
  const needsReview = (overview?.consultants ?? []).filter(
    (item) => item.conversations > 0 && item.sampleCount === 0,
  );

  return (
    <div className="space-y-5 pb-10">
      <header className="rounded-[26px] border border-[#E1E8F3] bg-white p-5 shadow-[0_18px_45px_-40px_rgba(22,0,108,.38)] sm:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.18em] text-[#3468D9]">
              <Sparkles className="h-4 w-4" /> Inteligência para a direção
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#14274C] sm:text-3xl">
              Inteligência Comercial
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7D8BA2]">
              {isConsultant
                ? "Conecte seu WhatsApp e acompanhe as orientações da liderança."
                : "Acompanhe a atividade da equipe, identifique oportunidades de melhoria e aprofunde as análises da IA nas conversas reais."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-[#EFF4FF] px-3 py-2 text-xs font-bold text-[#3468D9]">
              {session.activeUnit?.name ?? "Unidade ativa"}
            </span>
            {tab === "visao" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => setRefreshCount((count) => count + 1)}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
            ) : null}
          </div>
        </div>
        <div
          className="mt-6 flex flex-wrap gap-2 border-b border-[#EEF1F7] pb-3"
          role="tablist"
          aria-label="Áreas da Inteligência Comercial"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() =>
                navigateTo(item.id, item.id === "visao" ? undefined : search.consultantId)
              }
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                tab === item.id
                  ? "bg-[#16006C] text-white shadow-sm"
                  : "bg-[#F3F6FA] text-[#70819C] hover:bg-[#E9EFF8] hover:text-[#15284D]"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.text}
            </button>
          ))}
        </div>
        {tab === "visao" && manager ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-xl bg-[#F3F6FA] p-1">
              {(
                [
                  ["today", "Hoje"],
                  ["7d", "7 dias"],
                  ["30d", "30 dias"],
                ] as const
              ).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                    period === key
                      ? "bg-white text-[#326DDD] shadow-sm"
                      : "text-[#8A97AD] hover:text-[#15284D]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#94A0B2]">
              {overview
                ? `Atualizado em ${dateLabel(overview.updatedAt)}`
                : "Métricas da unidade ativa"}
            </p>
          </div>
        ) : null}
      </header>

      {tab === "visao" && manager ? (
        <>
          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              {error}{" "}
              <Button size="sm" variant="outline" onClick={() => setRefreshCount((x) => x + 1)}>
                Tentar novamente
              </Button>
            </div>
          ) : null}
          {loading ? (
            <LoadingTab />
          ) : overview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <DashboardMetric
                  label="Consultores ativos"
                  value={overview.totals.consultants}
                  note="Vinculados à unidade"
                  icon={Users}
                />
                <DashboardMetric
                  label="WhatsApp conectado"
                  value={overview.totals.connected}
                  note="Conexões da equipe"
                  icon={Wifi}
                  color="#20A797"
                />
                <DashboardMetric
                  label="Conversas movimentadas"
                  value={overview.totals.conversations}
                  note="Contatos com atividade no período"
                  icon={MessageCircleMore}
                  color="#845ED2"
                />
                <DashboardMetric
                  label="Mensagens trocadas"
                  value={overview.totals.inbound + overview.totals.outbound}
                  note={`${formatter.format(overview.totals.inbound)} recebidas · ${formatter.format(overview.totals.outbound)} enviadas`}
                  icon={MessageSquareText}
                  color="#D99523"
                />
                <DashboardMetric
                  label="Nota IA observada"
                  value={overview.totals.sampleScore ?? "—"}
                  note={`${formatter.format(overview.totals.analyzed)} avaliações recentes · amostras de até 8 por consultor`}
                  icon={Target}
                  color="#16A08C"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,.6fr)]">
                <Section
                  title="Equipe e qualidade do atendimento"
                  subtitle="Amostras da IA e volume de conversas. Selecione um consultor para investigar seu desempenho."
                >
                  {overview.consultants.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[610px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#EBEFF6] text-xs text-[#8C9AB0]">
                            <th className="px-3 pb-3 font-semibold">Consultor</th>
                            <th className="px-3 pb-3 text-right font-semibold">Conversas</th>
                            <th className="px-3 pb-3 text-right font-semibold">Mensagens</th>
                            <th className="px-3 pb-3 text-right font-semibold">Amostra IA</th>
                            <th className="px-3 pb-3 text-right font-semibold">Avaliações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.consultants.map((row) => (
                            <tr
                              key={row.id}
                              onClick={() => setSelectedId(row.id)}
                              className={`cursor-pointer border-b border-[#EFF2F7] last:border-0 hover:bg-[#F7F9FD] ${selectedId === row.id ? "bg-[#F3F7FE]" : ""}`}
                            >
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFF3FC] text-xs font-extrabold text-[#4564A3]">
                                    {row.name.slice(0, 1).toUpperCase()}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="block max-w-48 truncate font-bold text-[#25375B]">
                                      {row.name}
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] text-[#92A0B3]">
                                      {row.whatsappStatus === "connected" ? (
                                        <Wifi className="h-3 w-3 text-emerald-600" />
                                      ) : (
                                        <WifiOff className="h-3 w-3" />
                                      )}
                                      {row.whatsappStatus === "connected"
                                        ? "Online"
                                        : "Sem conexão ativa"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">
                                {formatter.format(row.conversations)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">
                                {formatter.format(row.inbound + row.outbound)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <span
                                  className={`rounded-lg px-2 py-1 text-xs font-extrabold ${
                                    row.sampleScore === null
                                      ? "bg-slate-100 text-slate-500"
                                      : row.sampleScore >= 80
                                        ? "bg-emerald-50 text-emerald-700"
                                        : row.sampleScore >= 65
                                          ? "bg-amber-50 text-amber-700"
                                          : "bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {row.sampleScore ?? "—"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right text-[#7888A1]">
                                {row.sampleCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#F7F9FC] p-8 text-center text-sm text-[#8A97AD]">
                      Nenhum consultor ativo nesta unidade.
                    </div>
                  )}
                </Section>
                <Section
                  title="Sinais para a gestão"
                  subtitle="Alertas baseados no histórico recente, não em suposições."
                >
                  <div className="space-y-3">
                    {topAttention.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className="flex w-full items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-left hover:bg-rose-50"
                      >
                        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        <div>
                          <p className="text-sm font-bold text-[#782E3D]">{item.name}</p>
                          <p className="mt-1 text-xs leading-5 text-[#99586A]">
                            Nota observada {item.sampleScore}. Vale revisar as avaliações e orientar
                            o atendimento.
                          </p>
                        </div>
                      </button>
                    ))}
                    {needsReview.slice(0, 3).map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className="flex w-full items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-left hover:bg-amber-50"
                      >
                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div>
                          <p className="text-sm font-bold text-[#715322]">{item.name}</p>
                          <p className="mt-1 text-xs leading-5 text-[#967447]">
                            {item.conversations} conversas com atividade, ainda sem avaliação da IA
                            no período.
                          </p>
                        </div>
                      </button>
                    ))}
                    {!topAttention.length && !needsReview.length ? (
                      <div className="flex items-start gap-2 rounded-xl bg-[#EFF9F6] p-4 text-xs leading-5 text-[#387968]">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Nenhum alerta derivado das amostras disponíveis. Continue acompanhando as
                        avaliações.
                      </div>
                    ) : null}
                    <p className="text-[11px] leading-5 text-[#99A5B8]">
                      Amostras pequenas e ausência de análise não demonstram, por si só, qualidade
                      ou desempenho geral.
                    </p>
                  </div>
                </Section>
              </div>
              {consultant ? (
                <Section
                  title={`Diagnóstico de ${consultant.name}`}
                  subtitle="Leitura gerencial com base em mensagens e análises já processadas."
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.65fr)]">
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-[#F4F7FC] p-4">
                          <p className="text-xs font-semibold text-[#8493AA]">
                            Atendimentos ativos
                          </p>
                          <p className="mt-1 text-2xl font-extrabold text-[#1B3154]">
                            {formatter.format(consultant.conversations)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-[#F4F7FC] p-4">
                          <p className="text-xs font-semibold text-[#8493AA]">Mensagens enviadas</p>
                          <p className="mt-1 text-2xl font-extrabold text-[#1B3154]">
                            {formatter.format(consultant.outbound)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-[#F4F7FC] p-4">
                          <p className="text-xs font-semibold text-[#8493AA]">Avaliações da IA</p>
                          <p className="mt-1 text-2xl font-extrabold text-[#1B3154]">
                            {consultant.sampleCount}
                          </p>
                        </div>
                      </div>
                      {consultant.latestReview ? (
                        <div className="rounded-xl border border-[#E4EBF5] p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-extrabold text-[#25385A]">
                              Último diagnóstico geral
                            </p>
                            <span className="text-[11px] text-[#A0AABA]">
                              {dateLabel(consultant.latestReview.at)}
                            </span>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#66758F]">
                            {consultant.latestReview.summary}
                          </p>
                          {consultant.latestReview.improvements.length ? (
                            <div className="mt-4">
                              <p className="text-xs font-extrabold uppercase tracking-wider text-[#8291AA]">
                                Pontos para melhorar
                              </p>
                              {consultant.latestReview.improvements
                                .slice(0, 3)
                                .map((item, index) => (
                                  <p key={index} className="mt-2 text-sm text-[#63738D]">
                                    • {item}
                                  </p>
                                ))}
                            </div>
                          ) : null}
                          {consultant.latestReview.actions.length ? (
                            <div className="mt-4">
                              <p className="text-xs font-extrabold uppercase tracking-wider text-[#8291AA]">
                                Próximas ações
                              </p>
                              {consultant.latestReview.actions.slice(0, 3).map((item, index) => (
                                <p key={index} className="mt-2 text-sm text-[#63738D]">
                                  • {item}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#D8E1F1] p-5 text-sm text-[#8896AB]">
                          Ainda não existe um diagnóstico geral salvo para este consultor. Acesse
                          Análise IA e scripts para avaliar suas conversas.
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 rounded-xl bg-[#F4F7FC] p-5">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="h-5 w-5 text-[#3468D9]" />
                        <p className="text-sm font-extrabold text-[#1C3055]">
                          Aprofundar a análise
                        </p>
                      </div>
                      <p className="text-xs leading-6 text-[#8290A5]">
                        Compare técnica de vendas, objeções, descoberta de necessidades e fechamento
                        com o script do curso.
                      </p>
                      <Button
                        className="mt-auto justify-between bg-[#16006C] text-white hover:bg-[#16006C]/90"
                        onClick={() => navigateTo("analises", consultant.id)}
                      >
                        Ver análise detalhada <ArrowRight className="h-4 w-4" />
                      </Button>
                      {hasAccessToConversations ? (
                        <Button
                          variant="outline"
                          className="justify-between"
                          onClick={() => navigateTo("conversas", consultant.id)}
                        >
                          Abrir conversas <MessageCircleMore className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <p className="text-[11px] leading-5 text-[#9CA7B9]">
                        Última atividade: {dateLabel(consultant.lastMessageAt)}
                      </p>
                    </div>
                  </div>
                </Section>
              ) : null}
              <div className="flex items-center gap-2 text-xs leading-5 text-[#98A5B7]">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Dados exclusivos da unidade ativa. As notas refletem avaliações disponíveis, não uma
                taxa de conversão ou ranking definitivo.
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "analises" ? (
        <React.Suspense fallback={<LoadingTab />}>
          <LazySalesAi
            key={unitId + ":" + (search.consultantId ?? "")}
            initialConsultantId={search.consultantId}
          />
        </React.Suspense>
      ) : null}
      {tab === "conversas" ? (
        <React.Suspense fallback={<LoadingTab />}>
          <LazyWhatsapp
            key={unitId + ":" + (search.consultantId ?? "")}
            initialConsultantId={search.consultantId}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}
