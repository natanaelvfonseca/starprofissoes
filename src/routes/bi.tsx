import * as React from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  GraduationCap,
  Layers3,
  RefreshCw,
  Search,
  Users,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Period = "today" | "7d" | "30d" | "custom";
type Section = "overview" | "attendances" | "leads" | "consultants";
type Group = { name: string; leads: number };
type TrendPoint = { bucket: string; leads: number; enrollments: number };
type ClassRow = {
  id: string;
  course: string;
  city: string;
  state: string;
  classDate: string;
  status: string;
  leads: number;
  enrollments: number;
};
type Consultant = {
  id: string;
  name: string;
  status: string;
  portfolio: number;
  received: number;
  enrollments: number;
};
type Reports = {
  unit: { id: string; name: string };
  period: { preset: string; start: string; end: string; days: number; hourly: boolean };
  metrics: {
    leadsReceived: number;
    enrollments: number;
    attendancesWithLeads: number;
    withoutAttendance: number;
    enrollmentsWithoutConverter: number;
  };
  trend: TrendPoint[];
  attendances: ClassRow[];
  sources: Group[];
  courses: Group[];
  cities: Group[];
  campaigns: Group[];
  consultants: Consultant[];
  consultantDetail: null | {
    trend: TrendPoint[];
    attendances: Array<{ id: string; name: string; leads: number; enrollments: number }>;
  };
  preview: Array<{
    id: string;
    name: string;
    createdAt: string;
    stage: string;
    attendance: string | null;
    owner: string | null;
  }>;
  updatedAt: string;
};

const fmt = new Intl.NumberFormat("pt-BR");
const colors = ["#3568DE", "#F4B728", "#16006C", "#24A59B", "#A375D6", "#F29065"];
const panels: Array<{ id: Section; name: string; icon: LucideIcon }> = [
  { id: "overview", name: "Visão geral", icon: ChartNoAxesCombined },
  { id: "attendances", name: "Turmas", icon: GraduationCap },
  { id: "leads", name: "Leads", icon: Users },
  { id: "consultants", name: "Consultores", icon: UserRoundCheck },
];

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}
function shortDate(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
}
function shiftDate(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function filledTrend(rows: TrendPoint[], period: Reports["period"]) {
  const lookup = new Map(rows.map((row) => [row.bucket, row]));
  return Array.from({ length: period.hourly ? 24 : period.days }, (_, index) => {
    const bucket = period.hourly ? String(index).padStart(2, "0") : shiftDate(period.start, index);
    return lookup.get(bucket) ?? { bucket, leads: 0, enrollments: 0 };
  });
}
function linkToCrm(period: Reports["period"], attendanceId?: string) {
  const query = new URLSearchParams({ startDate: period.start, endDate: period.end });
  if (attendanceId) query.set("attendanceId", attendanceId);
  return "/crm?" + query.toString();
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent = "#3568DE",
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <Card className="rounded-[20px] border-[#E2E8F2] bg-white p-5 shadow-[0_14px_35px_-30px_rgba(28,44,87,.4)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-[#6D7892]">{label}</span>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: accent + "14", color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-[#18294D]">
        {fmt.format(value)}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#94A0B5]">{detail}</p>
    </Card>
  );
}
function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`min-w-0 rounded-[22px] border-[#E2E8F2] bg-white p-5 shadow-[0_20px_50px_-46px_rgba(28,44,87,.5)] sm:p-6 ${className}`}
    >
      <div className="mb-5">
        <h2 className="text-base font-extrabold tracking-tight text-[#18294D] sm:text-lg">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-[#8793A8]">{description}</p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#DFE6F2] bg-[#F8FAFD] p-4 text-center text-sm text-[#8A96AA]">
      {children}
    </div>
  );
}
function SparkBars({
  items,
  label = "leads",
  maxItems = 8,
}: {
  items: Group[];
  label?: string;
  maxItems?: number;
}) {
  const relevant = items.filter((x) => x.leads > 0).slice(0, maxItems);
  const max = Math.max(1, ...relevant.map((x) => x.leads));
  return relevant.length ? (
    <div className="space-y-4">
      {relevant.map((row, index) => (
        <div key={row.name + index}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-[#4B5A75]" title={row.name}>
              {row.name}
            </span>
            <span className="shrink-0 font-extrabold tabular-nums text-[#18294D]">
              {fmt.format(row.leads)} <span className="font-normal text-[#98A5B9]">{label}</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#EDF1F7]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#3D7AFE] to-[#16006C]"
              style={{ width: `${Math.max(2, (row.leads / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty>Nenhum registro neste período.</Empty>
  );
}
function SourcePie({ items }: { items: Group[] }) {
  const first = items.slice(0, 5);
  const other = items.slice(5).reduce((sum, x) => sum + x.leads, 0);
  const merged = other ? [...first, { name: "Outros", leads: other }] : first;
  const total = merged.reduce((sum, x) => sum + x.leads, 0);
  if (!total) return <Empty>Sem leads recebidos no período.</Empty>;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative mx-auto h-[220px] w-[220px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={merged}
              dataKey="leads"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={63}
              outerRadius={87}
              stroke="none"
              paddingAngle={2}
            >
              {merged.map((row, index) => (
                <Cell key={row.name} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [fmt.format(Number(value ?? 0)), "Leads"]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-[#18294D]">{fmt.format(total)}</span>
          <span className="text-xs text-[#91A0B8]">leads</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {merged.map((row, index) => (
          <div key={row.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="truncate text-[#66738D]">{row.name}</span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-[#18294D]">
              {fmt.format(row.leads)}{" "}
              <span className="font-normal text-[#A0AAB8]">
                ({Math.round((row.leads / total) * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function ActivityChart({ rows, period }: { rows: TrendPoint[]; period: Reports["period"] }) {
  const filled = filledTrend(rows, period);
  const hasValues = filled.some((row) => row.leads || row.enrollments);
  if (!hasValues) return <Empty>Nenhuma entrada ou matrícula neste período.</Empty>;
  return (
    <div className="h-[270px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filled} margin={{ top: 12, left: -22, right: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="reportsLeads" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3568DE" stopOpacity={0.27} />
              <stop offset="100%" stopColor="#3568DE" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#E8EDF5" strokeDasharray="4 4" />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            minTickGap={21}
            tick={{ fill: "#91A0B6", fontSize: 11 }}
            tickFormatter={(value: string) => (period.hourly ? value + "h" : shortDate(value))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={35}
            tick={{ fill: "#91A0B6", fontSize: 11 }}
          />
          <Tooltip
            labelFormatter={(value) =>
              period.hourly ? String(value) + ":00" : dateLabel(String(value))
            }
            formatter={(value, name) => [fmt.format(Number(value ?? 0)), name]}
          />
          <Area
            type="monotone"
            dataKey="leads"
            name="Leads recebidos"
            stroke="#3568DE"
            strokeWidth={2.5}
            fill="url(#reportsLeads)"
          />
          <Area
            type="monotone"
            dataKey="enrollments"
            name="Matrículas realizadas"
            stroke="#E3A515"
            strokeWidth={2.5}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const Route = createFileRoute("/bi")({
  head: () => ({ meta: [{ title: "Relatórios | Star Profissões" }] }),
  component: BI,
});

function BI() {
  const { session, loading: authLoading } = useAuth();
  const unitId = session?.activeUnit?.id ?? "";
  const canSee = session ? canViewGrowth(session.user.role) : false;
  const [tab, setTab] = React.useState<Section>("overview");
  const [period, setPeriod] = React.useState<Period>("today");
  const [customOpen, setCustomOpen] = React.useState(false);
  const [startInput, setStartInput] = React.useState(todayLocal);
  const [endInput, setEndInput] = React.useState(todayLocal);
  const [customDates, setCustomDates] = React.useState({ start: "", end: "" });
  const [attendanceId, setAttendanceId] = React.useState("");
  const [attendanceOptions, setAttendanceOptions] = React.useState<ClassRow[]>([]);
  const [consultantId, setConsultantId] = React.useState("");
  const [refreshCount, setRefreshCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState<Reports | null>(null);
  const [leadSearch, setLeadSearch] = React.useState("");

  React.useEffect(() => {
    setAttendanceId("");
    setConsultantId("");
    setAttendanceOptions([]);
    setReport(null);
  }, [unitId]);

  React.useEffect(() => {
    if (!unitId || !canSee) {
      setLoading(false);
      return;
    }
    if (period === "custom" && (!customDates.start || !customDates.end)) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReport(null);

    const query = new URLSearchParams({ unitId, period });
    if (period === "custom") {
      query.set("startDate", customDates.start);
      query.set("endDate", customDates.end);
    }
    if (attendanceId) query.set("attendanceId", attendanceId);
    if (tab === "consultants" && consultantId) query.set("consultantId", consultantId);

    fetch("/api/bi/reports?" + query, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "Falha ao consultar relatórios.");
        if (!controller.signal.aborted) {
          setReport(result as Reports);
          if (!attendanceId) setAttendanceOptions((result as Reports).attendances);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Falha ao carregar os relatórios.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    unitId,
    canSee,
    tab,
    period,
    customDates.start,
    customDates.end,
    attendanceId,
    consultantId,
    refreshCount,
  ]);

  if (authLoading) return null;
  if (session && !canSee) return <Navigate to="/leads" replace />;

  const applyCustom = () => {
    const days =
      Math.round(
        (Date.parse(endInput + "T12:00:00Z") - Date.parse(startInput + "T12:00:00Z")) / 86400000,
      ) + 1;
    if (
      !startInput ||
      !endInput ||
      startInput > endInput ||
      endInput > todayLocal() ||
      days > 366
    ) {
      setError("Selecione um intervalo válido de até 366 dias, sem datas futuras.");
      return;
    }
    setError("");
    setCustomDates({ start: startInput, end: endInput });
    setPeriod("custom");
    setCustomOpen(false);
  };
  const classRows = report?.attendances.filter((row) => row.leads || row.enrollments) ?? [];
  const selected = report?.consultants.find((item) => item.id === consultantId);
  const reportLink = report ? linkToCrm(report.period, attendanceId || undefined) : "/crm";
  const searchValue = leadSearch.trim().toLocaleLowerCase("pt-BR");
  const preview =
    report?.preview.filter(
      (item) =>
        !searchValue ||
        [item.name, item.stage, item.owner, item.attendance]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(searchValue),
    ) ?? [];

  return (
    <div className="space-y-5 pb-9">
      <header className="rounded-[23px] border border-[#E2E8F2] bg-white p-5 shadow-[0_16px_42px_-40px_rgba(28,44,87,.6)] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.2em] text-[#3468D9]">
              Inteligência comercial
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#18294D] sm:text-3xl">
              Relatórios
            </h1>
            <p className="mt-1 text-sm text-[#8793A8]">
              Captação, turmas e produtividade comercial, sem misturar métricas financeiras.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-[#E1E8F5] bg-[#F4F7FE] px-4 py-2.5 text-xs font-bold text-[#3568DE]">
              {report?.unit.name ?? session?.activeUnit?.name ?? "Unidade ativa"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setRefreshCount((count) => count + 1)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </div>

        <div
          className="mt-6 flex flex-wrap gap-2 border-b border-[#ECF0F7] pb-3"
          role="tablist"
          aria-label="Tipo de relatório"
        >
          {panels.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setLeadSearch("");
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                tab === item.id
                  ? "bg-[#16006C] text-white shadow-sm"
                  : "bg-[#F3F5F9] text-[#6F7B91] hover:bg-[#E9EDF6]"
              }`}
            >
              <item.icon className="h-4 w-4" /> {item.name}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#F3F5F9] p-1">
            {(
              [
                ["today", "Hoje"],
                ["7d", "7 dias"],
                ["30d", "30 dias"],
              ] as const
            ).map(([value, title]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setPeriod(value);
                  setCustomOpen(false);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
                  period === value
                    ? "bg-white text-[#3468D9] shadow-sm"
                    : "text-[#7E899B] hover:text-[#18294D]"
                }`}
              >
                {title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomOpen((open) => !open)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${period === "custom" ? "bg-white text-[#3468D9] shadow-sm" : "text-[#7E899B] hover:text-[#18294D]"}`}
            >
              <CalendarDays className="h-4 w-4" /> Personalizado
            </button>
          </div>
          <Select
            value={attendanceId || "all"}
            onValueChange={(value) => setAttendanceId(value === "all" ? "" : value)}
          >
            <SelectTrigger className="h-11 w-full max-w-[330px] rounded-xl border-[#DFE6F1] bg-white text-sm">
              <SelectValue placeholder="Todas as turmas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as turmas</SelectItem>
              {attendanceOptions.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.course} · {row.city}/{row.state} · {dateLabel(row.classDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {report ? (
            <span className="text-xs font-medium text-[#9AA6B6]">
              {dateLabel(report.period.start)} a {dateLabel(report.period.end)}
            </span>
          ) : null}
        </div>
        {customOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F2] bg-[#F8FAFD] p-3">
            <label className="text-xs font-semibold text-[#6D7892]">
              De
              <input
                className="mt-1 block rounded-lg border border-[#DFE6F1] bg-white px-3 py-2 text-sm"
                type="date"
                max={todayLocal()}
                value={startInput}
                onChange={(event) => setStartInput(event.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-[#6D7892]">
              Até
              <input
                className="mt-1 block rounded-lg border border-[#DFE6F1] bg-white px-3 py-2 text-sm"
                type="date"
                max={todayLocal()}
                value={endInput}
                onChange={(event) => setEndInput(event.target.value)}
              />
            </label>
            <Button
              type="button"
              className="bg-[#16006C] text-white hover:bg-[#16006C]/90"
              onClick={applyCustom}
            >
              Aplicar período
            </Button>
          </div>
        ) : null}
      </header>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}{" "}
          <Button size="sm" variant="outline" onClick={() => setRefreshCount((value) => value + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : null}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-[20px] bg-[#E9EDF5]" />
          ))}
        </div>
      ) : report ? (
        <>
          {tab === "overview" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Leads recebidos"
                  value={report.metrics.leadsReceived}
                  detail="Cadastros criados no período"
                  icon={Users}
                />
                <Metric
                  label="Matrículas"
                  value={report.metrics.enrollments}
                  detail="Efetivadas no período (data da conversão)"
                  icon={GraduationCap}
                  accent="#E2A614"
                />
                <Metric
                  label="Turmas com leads"
                  value={report.metrics.attendancesWithLeads}
                  detail="Turmas que receberam novos cadastros"
                  icon={Layers3}
                  accent="#22A59C"
                />
              </div>
              <Panel
                title="Evolução comercial"
                description="Leads pela data de entrada; matrículas pela data efetiva da conversão. São acontecimentos diferentes."
              >
                <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-medium text-[#6E7B90]">
                  <span>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#3568DE]" />
                    Leads recebidos
                  </span>
                  <span>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#E3A515]" />
                    Matrículas
                  </span>
                </div>
                <ActivityChart rows={report.trend} period={report.period} />
              </Panel>
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel
                  title="Turmas com mais entradas"
                  description="Ranking de leads novos por turma."
                >
                  <SparkBars
                    items={classRows.map((row) => ({
                      name: `${row.course} · ${row.city}/${row.state} · ${dateLabel(row.classDate)}`,
                      leads: row.leads,
                    }))}
                  />
                </Panel>
                <Panel
                  title="Origem dos leads"
                  description="Participação dos canais nos leads recebidos."
                >
                  <SourcePie items={report.sources} />
                </Panel>
              </div>
            </>
          ) : null}

          {tab === "attendances" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Turmas com leads"
                  value={report.metrics.attendancesWithLeads}
                  detail="Receberam ao menos um lead no período"
                  icon={Layers3}
                />
                <Metric
                  label="Matrículas"
                  value={report.metrics.enrollments}
                  detail="Conversões realizadas no período"
                  icon={GraduationCap}
                  accent="#E2A614"
                />
                <Metric
                  label="Leads sem turma"
                  value={report.metrics.withoutAttendance}
                  detail="Registros recebidos sem vínculo de turma"
                  icon={Activity}
                  accent="#E07D5C"
                />
              </div>
              <Panel
                title="Captação por turma"
                description="Turmas com maior quantidade de leads novos."
              >
                <SparkBars
                  maxItems={12}
                  items={classRows.map((row) => ({
                    name: `${row.course} · ${row.city}/${row.state} · ${dateLabel(row.classDate)}`,
                    leads: row.leads,
                  }))}
                />
              </Panel>
              <Panel
                title="Detalhamento das turmas"
                description="Uma linha por turma (curso, local e data). Matrículas usam a data da conversão, não a de entrada do lead."
              >
                {classRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[670px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#E7ECF4] text-xs text-[#8390A6]">
                          <th className="px-3 pb-3 font-semibold">Turma</th>
                          <th className="px-3 pb-3 font-semibold">Data da turma</th>
                          <th className="px-3 pb-3 text-right font-semibold">Leads recebidos</th>
                          <th className="px-3 pb-3 text-right font-semibold">Matrículas</th>
                          <th className="px-3 pb-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {classRows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-[#EEF1F6] last:border-0 hover:bg-[#F9FAFD]"
                          >
                            <td className="px-3 py-3">
                              <span className="block font-bold text-[#263758]">{row.course}</span>
                              <span className="mt-0.5 block text-xs text-[#8A97AB]">
                                {row.city}/{row.state} ·{" "}
                                {row.status === "active" ? "Ativa" : "Inativa"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-[#6A7890]">{dateLabel(row.classDate)}</td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-[#3568DE]">
                              {fmt.format(row.leads)}
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-[#18294D]">
                              {fmt.format(row.enrollments)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <a
                                className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#3568DE] hover:underline"
                                href={linkToCrm(report.period, row.id)}
                              >
                                Ver leads <ArrowRight className="h-3.5 w-3.5" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>Não há turmas com movimentação neste período.</Empty>
                )}
              </Panel>
            </>
          ) : null}

          {tab === "leads" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Leads recebidos"
                  value={report.metrics.leadsReceived}
                  detail="Cadastros únicos no período"
                  icon={Users}
                />
                <Metric
                  label="Com turma vinculada"
                  value={report.metrics.leadsReceived - report.metrics.withoutAttendance}
                  detail="Registros vinculados a uma turma"
                  icon={GraduationCap}
                  accent="#22A59C"
                />
                <Metric
                  label="Sem turma"
                  value={report.metrics.withoutAttendance}
                  detail="Leads sem identificação da turma"
                  icon={Activity}
                  accent="#E07D5C"
                />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Leads por origem" description="Agrupamento pelo canal de aquisição.">
                  <SourcePie items={report.sources} />
                </Panel>
                <Panel title="Leads por curso" description="Cursos com maior entrada no período.">
                  <SparkBars items={report.courses} />
                </Panel>
                <Panel
                  title="Campanhas Meta"
                  description="Leads únicos vinculados a eventos Meta, com a campanha mais recente por lead."
                >
                  <SparkBars items={report.campaigns} />
                </Panel>
                <Panel title="Cidades de origem" description="Cidades registradas nos cadastros.">
                  <SparkBars items={report.cities} />
                </Panel>
              </div>
              <Panel
                title="Últimos leads do período"
                description="Amostra dos 40 cadastros mais recentes do filtro. Para a lista completa, acesse o CRM."
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-w-[220px] items-center gap-2 rounded-xl border border-[#E2E8F2] bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-[#9EACC0]" />
                    <input
                      className="w-full bg-transparent text-sm outline-none placeholder:text-[#A2ADBD]"
                      placeholder="Buscar nesta amostra"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                    />
                  </label>
                  <a className="text-xs font-bold text-[#3468D9] hover:underline" href={reportLink}>
                    Ver todos no CRM
                  </a>
                </div>
                {preview.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#E7ECF4] text-xs text-[#8390A6]">
                          <th className="px-3 pb-3 font-semibold">Lead</th>
                          <th className="px-3 pb-3 font-semibold">Data</th>
                          <th className="px-3 pb-3 font-semibold">Turma</th>
                          <th className="px-3 pb-3 font-semibold">Responsável atual</th>
                          <th className="px-3 pb-3 font-semibold">Etapa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((lead) => (
                          <tr
                            key={lead.id}
                            className="border-b border-[#EEF1F6] last:border-0 hover:bg-[#F9FAFD]"
                          >
                            <td className="px-3 py-3 font-semibold text-[#3568DE]">
                              <Link
                                to="/leads/$id"
                                params={{ id: lead.id }}
                                className="hover:underline"
                              >
                                {lead.name}
                              </Link>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-[#6A7890]">
                              {dateLabel(lead.createdAt)}
                            </td>
                            <td className="px-3 py-3 text-[#6A7890]">
                              {lead.attendance ?? "Sem turma"}
                            </td>
                            <td className="px-3 py-3 text-[#6A7890]">
                              {lead.owner ?? "Não atribuído"}
                            </td>
                            <td className="px-3 py-3 text-[#6A7890]">{lead.stage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>Não há leads nesta amostra para os filtros escolhidos.</Empty>
                )}
              </Panel>
            </>
          ) : null}

          {tab === "consultants" ? (
            <>
              <Panel
                title="Equipe comercial"
                description="Apenas consultores vinculados à unidade ativa. Selecione um nome para ver os resultados individuais."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={consultantId || "all"}
                    onValueChange={(value) => setConsultantId(value === "all" ? "" : value)}
                  >
                    <SelectTrigger className="h-11 w-full max-w-[360px] rounded-xl border-[#DFE6F1] bg-white text-sm">
                      <SelectValue placeholder="Todos os consultores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os consultores</SelectItem>
                      {report.consultants.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                          {item.status === "inactive" ? " · Inativo" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-[#8C99AE]">
                    {fmt.format(report.consultants.length)} consultores vinculados
                  </span>
                </div>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Carteira ativa"
                  value={
                    selected
                      ? selected.portfolio
                      : report.consultants.reduce((sum, row) => sum + row.portfolio, 0)
                  }
                  detail="Leads não matriculados sob responsabilidade atual"
                  icon={Users}
                />
                <Metric
                  label="Leads do período"
                  value={
                    selected
                      ? selected.received
                      : report.consultants.reduce((sum, row) => sum + row.received, 0)
                  }
                  detail="Criados no período, por responsável atual"
                  icon={Layers3}
                  accent="#22A59C"
                />
                <Metric
                  label="Matrículas realizadas"
                  value={
                    selected
                      ? selected.enrollments
                      : report.consultants.reduce((sum, row) => sum + row.enrollments, 0)
                  }
                  detail="Conversões no período por autor registrado"
                  icon={GraduationCap}
                  accent="#E2A614"
                />
              </div>
              {selected && report.consultantDetail ? (
                <>
                  <Panel
                    title={`Evolução de ${selected.name}`}
                    description="Leads atribuídos atualmente e matrículas realizadas pelo consultor em suas respectivas datas."
                  >
                    <ActivityChart rows={report.consultantDetail.trend} period={report.period} />
                  </Panel>
                  <Panel
                    title="Turmas do consultor"
                    description="Distribuição por turma, conforme responsável atual e autoria da matrícula."
                  >
                    {report.consultantDetail.attendances.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[570px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-[#E7ECF4] text-xs text-[#8390A6]">
                              <th className="px-3 pb-3">Turma</th>
                              <th className="px-3 pb-3 text-right">Leads atribuídos</th>
                              <th className="px-3 pb-3 text-right">Matrículas feitas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.consultantDetail.attendances.map((row) => (
                              <tr key={row.id} className="border-b border-[#EEF1F6] last:border-0">
                                <td className="px-3 py-3 font-semibold text-[#273959]">
                                  {row.name}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {fmt.format(row.leads)}
                                </td>
                                <td className="px-3 py-3 text-right font-bold tabular-nums">
                                  {fmt.format(row.enrollments)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty>
                        Nenhuma turma com atividade atribuída a este consultor no período.
                      </Empty>
                    )}
                  </Panel>
                </>
              ) : (
                <>
                  <Panel
                    title="Matrículas por consultor"
                    description="Atribuídas pelo campo de quem efetivou a conversão, não pela carteira atual."
                  >
                    <div className="h-[310px] w-full">
                      {report.consultants.some((item) => item.enrollments) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={report.consultants.slice(0, 10)}
                            layout="vertical"
                            margin={{ left: 10, right: 18 }}
                          >
                            <CartesianGrid horizontal={false} stroke="#E8EDF5" />
                            <XAxis
                              type="number"
                              allowDecimals={false}
                              tick={{ fontSize: 11, fill: "#8C99AE" }}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={150}
                              tick={{ fontSize: 11, fill: "#6D7A90" }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              formatter={(value) => [fmt.format(Number(value ?? 0)), "Matrículas"]}
                            />
                            <Bar
                              dataKey="enrollments"
                              name="Matrículas"
                              fill="#3568DE"
                              radius={[0, 6, 6, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty>Nenhuma matrícula com consultor identificado no período.</Empty>
                      )}
                    </div>
                  </Panel>
                  <Panel
                    title="Comparativo da equipe"
                    description="A carteira é o estoque atual; leads e matrículas pertencem ao período selecionado."
                  >
                    {report.consultants.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[650px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-[#E7ECF4] text-xs text-[#8390A6]">
                              <th className="px-3 pb-3">Consultor</th>
                              <th className="px-3 pb-3 text-right">Carteira ativa</th>
                              <th className="px-3 pb-3 text-right">Leads do período</th>
                              <th className="px-3 pb-3 text-right">Matrículas feitas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.consultants.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-[#EEF1F6] last:border-0 hover:bg-[#F9FAFD]"
                              >
                                <td className="px-3 py-3 font-semibold text-[#3568DE]">
                                  <button
                                    type="button"
                                    className="text-left hover:underline"
                                    onClick={() => setConsultantId(row.id)}
                                  >
                                    {row.name}
                                    {row.status === "inactive" ? " · Inativo" : ""}
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {fmt.format(row.portfolio)}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  {fmt.format(row.received)}
                                </td>
                                <td className="px-3 py-3 text-right font-bold tabular-nums">
                                  {fmt.format(row.enrollments)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty>Nenhum consultor cadastrado nesta unidade.</Empty>
                    )}
                  </Panel>
                </>
              )}
              {report.metrics.enrollmentsWithoutConverter ? (
                <p className="text-xs text-[#9B7080]">
                  {fmt.format(report.metrics.enrollmentsWithoutConverter)} matrícula(s) no período
                  sem autor da conversão identificado. Não foram atribuídas arbitrariamente a
                  consultores.
                </p>
              ) : null}
            </>
          ) : null}
          <p className="text-xs leading-5 text-[#98A3B5]">
            Os números são exclusivos da unidade ativa. Leads usam a data de criação; matrículas
            usam a data da conversão. As informações de consultor consideram responsável atual e
            autoria registrada da matrícula. Nenhuma taxa de conversão é inferida desses períodos
            independentes.
          </p>
        </>
      ) : !error ? (
        <Empty>Nenhum dado disponível para a unidade selecionada.</Empty>
      ) : null}
    </div>
  );
}
