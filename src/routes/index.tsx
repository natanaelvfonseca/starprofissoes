import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserRoundX,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { canViewGrowth } from "@/lib/auth-types";
import { subscribeCommercialConfiguration } from "@/lib/commercial-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Period = "today" | "7d" | "30d" | "custom";

type DashboardData = {
  period: { start: string; end: string; days: number; hourly: boolean };
  scope: "individual" | "unit";
  metrics: {
    leadsReceived: number;
    previousLeads: number;
    uncontactedLeads: number;
    enrollments: number;
    pendingTasks: number;
  };
  attendances: Array<{
    id: string | null;
    name: string;
    city: string | null;
    state: string | null;
    classDate: string | null;
    leads: number;
  }>;
  sources: Array<{ name: string; leads: number }>;
  trend: Array<{ bucket: string; leads: number }>;
  updatedAt: string;
};

const chartColors = ["#3465D8", "#F1B735", "#16006C", "#22A699", "#8C65CF", "#E18D55"];
const numberFormat = new Intl.NumberFormat("pt-BR");

function currentLocalDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return [get("year"), get("month"), get("day")].join("-");
}

function compactDate(day: string | null) {
  if (!day) return "";
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function periodText(data: DashboardData | null, period: Period) {
  if (!data) return "Acompanhamento comercial";
  if (period === "today") return "Hoje, " + compactDate(data.period.end);
  return compactDate(data.period.start) + " a " + compactDate(data.period.end);
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex min-h-[225px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#DEE5F1] bg-[#F9FAFD] px-4 text-center">
      <Activity className="h-6 w-6 text-[#AAB6CD]" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  color,
  loading,
  children,
}: {
  title: string;
  value?: number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border-[#E3E8F1] bg-white shadow-[0_18px_36px_-32px_rgba(25,39,80,.45)]">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-semibold text-[#59667F]">{title}</p>
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: color + "14", color }}
          >
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-2 text-[36px] font-extrabold leading-none tracking-tight text-[#14234C] sm:text-[42px]">
          {loading ? (
            <span className="inline-block h-10 w-20 animate-pulse rounded-lg bg-slate-100" />
          ) : value === undefined ? (
            "—"
          ) : (
            numberFormat.format(value)
          )}
        </div>
        <div className="mt-3 min-h-5 text-xs text-[#8893A8]">{children ?? helper}</div>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Star Profissões" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = useAuth();
  const unitId = session?.activeUnit?.id ?? "";
  const [period, setPeriod] = React.useState<Period>("today");
  const [customOpen, setCustomOpen] = React.useState(false);
  const [customStart, setCustomStart] = React.useState(() => currentLocalDate());
  const [customEnd, setCustomEnd] = React.useState(() => currentLocalDate());
  const [appliedCustom, setAppliedCustom] = React.useState({ start: "", end: "" });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const isConsultant = session?.user.role === "CONSULTOR";
  const canSeeReports = session ? canViewGrowth(session.user.role) : false;

  React.useEffect(() => {
    if (!unitId || (period === "custom" && (!appliedCustom.start || !appliedCustom.end))) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let working = false;
    let active = true;
    const fetchDashboard = async (initial = false) => {
      if (working || !active) return;
      working = true;
      if (initial) setLoading(true);
      else setRefreshing(true);
      try {
        const query = new URLSearchParams({ unitId, period });
        if (period === "custom") {
          query.set("startDate", appliedCustom.start);
          query.set("endDate", appliedCustom.end);
        }
        const response = await fetch("/api/crm/dashboard?" + query.toString(), {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o painel.");
        if (active) {
          setData(payload as DashboardData);
          setError("");
        }
      } catch (cause) {
        if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Não foi possível carregar o painel.");
          if (initial) setData(null);
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
        working = false;
      }
    };

    void fetchDashboard(true);
    const unsubscribe = subscribeCommercialConfiguration(unitId, () => {
      void fetchDashboard();
    });
    const interval = window.setInterval(() => {
      void fetchDashboard();
    }, 60_000);
    const onFocus = () => {
      void fetchDashboard();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      controller.abort();
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [unitId, period, appliedCustom.start, appliedCustom.end, refreshKey]);

  const choosePeriod = (next: Period) => {
    setPeriod(next);
    setCustomOpen(false);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd || customStart > customEnd || customEnd > currentLocalDate()) {
      setError("Selecione um intervalo válido até a data de hoje.");
      return;
    }
    const days =
      Math.round(
        (Date.parse(customEnd + "T12:00:00Z") - Date.parse(customStart + "T12:00:00Z")) / 86400000,
      ) + 1;
    if (days > 90) {
      setError("O período personalizado pode ter no máximo 90 dias.");
      return;
    }
    setError("");
    setAppliedCustom({ start: customStart, end: customEnd });
    setPeriod("custom");
    setCustomOpen(false);
  };

  const sourceData = React.useMemo(() => {
    const sources = data?.sources ?? [];
    const first = sources.slice(0, 5);
    const others = sources.slice(5).reduce((total, source) => total + source.leads, 0);
    return others ? [...first, { name: "Outros", leads: others }] : first;
  }, [data?.sources]);

  const totalSourceLeads = sourceData.reduce((sum, item) => sum + item.leads, 0);
  const maxAttendanceLeads = Math.max(1, ...(data?.attendances.map((item) => item.leads) ?? [0]));
  const lastPeriod = data?.metrics.previousLeads ?? 0;
  const leadDiff = (data?.metrics.leadsReceived ?? 0) - lastPeriod;
  const delta = lastPeriod ? Math.round((leadDiff / lastPeriod) * 100) : null;
  const chartTooltipStyle = {
    border: "1px solid #E3E8F1",
    borderRadius: 12,
    boxShadow: "0 14px 36px -20px rgba(20,35,76,.3)",
    fontSize: 12,
  };

  return (
    <div className="space-y-5 pb-7">
      <section className="flex flex-col justify-between gap-5 rounded-[24px] border border-[#E3E8F1] bg-white p-5 shadow-[0_16px_48px_-42px_rgba(22,0,108,.35)] sm:p-7 xl:flex-row xl:items-center">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.18em] text-[#386FDB]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Visão geral da operação
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#14234C] sm:text-3xl">
            Painel comercial
          </h1>
          <p className="text-sm text-[#7A859A]">
            {session?.activeUnit?.name ?? "Unidade ativa"} · {periodText(data, period)}
          </p>
          <p className="text-xs text-[#9CA6B8]">
            {isConsultant
              ? "Entradas da unidade e suas pendências e matrículas."
              : "Entradas, atendimento e matrículas da unidade."}
          </p>
        </div>
        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#E3E8F1] bg-[#F6F8FC] p-1">
            {(
              [
                ["today", "Hoje"],
                ["7d", "7 dias"],
                ["30d", "30 dias"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => choosePeriod(value)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${period === value ? "bg-white text-[#234EB8] shadow-sm" : "text-[#72809A] hover:text-[#14234C]"}`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomOpen((current) => !current)}
              className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${period === "custom" ? "bg-white text-[#234EB8] shadow-sm" : "text-[#72809A] hover:text-[#14234C]"}`}
            >
              <CalendarDays className="h-4 w-4" /> Personalizado
            </button>
          </div>
          {customOpen ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#E3E8F1] bg-white p-3">
              <label className="text-xs font-medium text-[#62708A]">
                De
                <input
                  aria-label="Data inicial"
                  type="date"
                  max={currentLocalDate()}
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="mt-1 block rounded-lg border border-[#DEE5F1] px-2 py-1.5 text-sm text-[#14234C]"
                />
              </label>
              <label className="text-xs font-medium text-[#62708A]">
                Até
                <input
                  aria-label="Data final"
                  type="date"
                  max={currentLocalDate()}
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="mt-1 block rounded-lg border border-[#DEE5F1] px-2 py-1.5 text-sm text-[#14234C]"
                />
              </label>
              <Button size="sm" onClick={applyCustom}>
                Aplicar
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] text-[#A0AABD]">
              {refreshing ? "Atualizando…" : data ? "Atualização automática a cada minuto" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button
              size="sm"
              asChild
              className="gap-1.5 bg-[#16006C] text-white hover:bg-[#16006C]/90"
            >
              <Link to="/crm">
                Abrir CRM <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Leads recebidos"
          value={data?.metrics.leadsReceived}
          helper="Novas entradas no período"
          icon={Users}
          color="#3465D8"
          loading={loading}
        >
          {data && delta !== null ? (
            <span
              className={`inline-flex items-center gap-1 font-medium ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-500"}`}
            >
              {delta > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : delta < 0 ? (
                <TrendingDown className="h-3.5 w-3.5" />
              ) : null}
              {delta > 0 ? "+" : ""}
              {delta}% vs. período anterior
            </span>
          ) : (
            "Novas entradas no período"
          )}
        </MetricCard>
        <MetricCard
          title="Sem primeiro contato"
          value={data?.metrics.uncontactedLeads}
          helper={
            isConsultant
              ? "Sua fila e fila compartilhada · acumulado"
              : "Fila atual da unidade · acumulado"
          }
          icon={UserRoundX}
          color="#E18D55"
          loading={loading}
        />
        <MetricCard
          title="Matrículas"
          value={data?.metrics.enrollments}
          helper={isConsultant ? "Suas conversões no período" : "Conversões da unidade no período"}
          icon={GraduationCap}
          color="#22A699"
          loading={loading}
        />
        <MetricCard
          title="Retornos pendentes"
          value={data?.metrics.pendingTasks}
          helper={
            isConsultant
              ? "Suas tarefas vencidas ou até hoje"
              : "Tarefas vencidas ou até hoje · unidade"
          }
          icon={Clock3}
          color="#7A5AC4"
          loading={loading}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(330px,.82fr)]">
        <Card className="overflow-hidden rounded-[24px] border-[#E3E8F1] bg-white shadow-[0_18px_40px_-35px_rgba(25,39,80,.5)]">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-[#14234C]">Leads por turma</h2>
                <p className="mt-1 text-xs text-[#8792A6]">
                  Turmas que mais receberam novos leads no período.
                </p>
              </div>
              <span className="rounded-lg bg-[#EAF0FF] px-2.5 py-1.5 text-xs font-bold text-[#3465D8]">
                Top 7
              </span>
            </div>
            {loading ? (
              <Placeholder text="Carregando turmas…" />
            ) : data?.attendances.length ? (
              <div className="space-y-4">
                {data.attendances.map((item) => {
                  const label = item.id
                    ? `${item.name} · ${item.city ?? ""}/${item.state ?? ""}${item.classDate ? " · " + compactDate(item.classDate) : ""}`
                    : item.name;
                  return (
                    <div key={item.id ?? "unlinked"} className="group">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        {item.id ? (
                          <a
                            href={`/crm?attendanceId=${encodeURIComponent(item.id)}&startDate=${data.period.start}&endDate=${data.period.end}`}
                            className="min-w-0 truncate text-[13px] font-semibold text-[#3D4B67] hover:text-[#3465D8] hover:underline"
                            title={label}
                          >
                            {label}
                          </a>
                        ) : (
                          <span
                            className="min-w-0 truncate text-[13px] font-semibold text-[#3D4B67]"
                            title={label}
                          >
                            {label}
                          </span>
                        )}
                        <span className="shrink-0 text-sm font-extrabold tabular-nums text-[#14234C]">
                          {numberFormat.format(item.leads)}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#EEF2F8]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#377DFE] to-[#16006C] transition-all duration-500"
                          style={{ width: `${(item.leads / maxAttendanceLeads) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-2 text-xs text-[#94A0B4]">
                  Selecione uma turma para consultar seus leads no CRM.
                </p>
              </div>
            ) : (
              <Placeholder text="Nenhum lead recebido nas turmas neste período." />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[24px] border-[#E3E8F1] bg-white shadow-[0_18px_40px_-35px_rgba(25,39,80,.5)]">
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-lg font-extrabold text-[#14234C]">Origem dos leads</h2>
            <p className="mt-1 text-xs text-[#8792A6]">De onde chegam as novas oportunidades.</p>
            {loading ? (
              <Placeholder text="Carregando canais…" />
            ) : sourceData.length ? (
              <div className="flex flex-col items-center gap-1">
                <div className="relative h-[215px] w-full max-w-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceData}
                        dataKey="leads"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={89}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {sourceData.map((item, index) => (
                          <Cell key={item.name} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value) => numberFormat.format(Number(value ?? 0))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[27px] font-black text-[#14234C]">
                      {numberFormat.format(totalSourceLeads)}
                    </span>
                    <span className="text-[11px] text-[#9AA6B8]">leads</span>
                  </div>
                </div>
                <div className="grid w-full gap-2">
                  {sourceData.map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: chartColors[index % chartColors.length] }}
                        />
                        <span className="truncate text-[#61708A]" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-[#14234C]">
                        {numberFormat.format(item.leads)}{" "}
                        <span className="font-medium text-[#A2ABBB]">
                          ({Math.round((item.leads / totalSourceLeads) * 100)}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Placeholder text="Nenhum lead com origem registrada no período." />
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden rounded-[24px] border-[#E3E8F1] bg-white shadow-[0_18px_40px_-35px_rgba(25,39,80,.5)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-[#14234C]">Evolução das entradas</h2>
              <p className="mt-1 text-xs text-[#8792A6]">
                {data?.period.hourly
                  ? "Volume de leads por hora, no dia de hoje."
                  : "Novos leads recebidos em cada dia do período."}
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#EAF0FF] px-3 py-1.5 text-xs font-bold text-[#3465D8]">
              <span className="h-2 w-2 rounded-full bg-[#3465D8]" /> Leads recebidos
            </span>
          </div>
          <div className="mt-5">
            {loading ? (
              <Placeholder text="Carregando evolução…" />
            ) : data?.trend.length ? (
              <div className="h-[250px] w-full sm:h-[290px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.trend}
                    margin={{ top: 10, right: 12, left: -24, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="starDashboardTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3465D8" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="#3465D8" stopOpacity={0.015} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#E7ECF4" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="bucket"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={16}
                      tick={{ fill: "#98A4B7", fontSize: 11 }}
                      tickFormatter={(value: string) =>
                        data.period.hourly
                          ? value + "h"
                          : value.slice(8, 10) + "/" + value.slice(5, 7)
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fill: "#98A4B7", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value) => [numberFormat.format(Number(value ?? 0)), "Leads"]}
                      labelFormatter={(value) =>
                        data.period.hourly ? String(value) + ":00" : compactDate(String(value))
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="leads"
                      stroke="#3465D8"
                      strokeWidth={3}
                      fill="url(#starDashboardTrend)"
                      activeDot={{ r: 5, fill: "#3465D8" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Placeholder text="Ainda não há entradas neste período." />
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EFF2F7] pt-4 text-xs text-[#8E9AAF]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Dados da unidade ativa,
              atualizados periodicamente
            </span>
            {canSeeReports ? (
              <Link
                to="/bi"
                className="flex items-center gap-1 font-bold text-[#3465D8] hover:underline"
              >
                Abrir relatórios <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
