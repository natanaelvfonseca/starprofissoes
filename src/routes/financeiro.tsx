import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/layout/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { formatFinancialDate } from "@/lib/financial-date";
import { cn } from "@/lib/utils";

type FinancialPage = "dashboard" | "central" | "students" | "settings";
type DashboardData = {
  total_students: number;
  total_enrollments: number;
  installments_count: number;
  total_open_amount: number;
  overdue_amount: number;
  overdue_count: number;
  due_today_amount: number;
  due_today_count: number;
  upcoming_amount: number;
  upcoming_count: number;
  students_overdue: number;
  promises_today: number;
  broken_promises: number;
  not_found_financial_count: number;
  not_returned_count: number;
  aging: Array<{ bucket: string; count: number; amount: number }>;
};
type CollectionRow = {
  installment_id: string;
  student_id: string;
  full_name: string;
  phone: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  course_name: string | null;
  class_name: string | null;
  due_date: string;
  days_overdue: number;
  original_amount: number;
  penalty_amount: number;
  interest_amount: number;
  total_amount: number;
  status: string;
  last_contact_at: string | null;
  promised_date: string | null;
  promised_amount: number | null;
  score: number;
};
type StudentRow = {
  id: string;
  full_name: string;
  phone: string | null;
  course_name: string | null;
  class_name: string | null;
  external_enrollment_id: string | null;
  financial_lookup_status: string | null;
  overdue_amount: number;
  overdue_count: number;
  max_overdue_days: number;
};
type StudentsData = {
  students: Array<StudentRow>;
  total: number;
  page: number;
  pageSize: number;
  filters: { courses: Array<string>; classes: Array<string> };
};
type IntegrationState = {
  configured: boolean;
  active: boolean;
  syncPastDays: number;
  syncFutureDays: number;
  lastSyncAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastError?: string | null;
  studentsCount: number;
  installmentsCount: number;
};
type SyncRun = {
  id: string;
  status: string;
  created_at: string;
  classes_processed: number;
  students_processed: number;
  installments_found: number;
  errors_count: number;
};
type FinanceSearch = {
  start_date?: string;
  end_date?: string;
  status?: string;
  course?: string;
  class?: string;
  search?: string;
  sort?: string;
  direction?: string;
};
type FilterOptions = { courses: Array<string>; classes: Array<string> };

const tabs = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "central" as const, label: "Central de Cobrança", icon: ListChecks },
  { id: "students" as const, label: "Alunos", icon: Users },
  { id: "settings" as const, label: "Configurações", icon: Settings },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
async function readJson<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na requisição.");
  return data;
}

export const Route = createFileRoute("/financeiro")({
  validateSearch: (search: Record<string, unknown>): FinanceSearch => {
    const value = (key: keyof FinanceSearch) =>
      typeof search[key] === "string" && search[key] ? String(search[key]) : undefined;
    return {
      start_date: value("start_date"),
      end_date: value("end_date"),
      status: value("status"),
      course: value("course"),
      class: value("class"),
      search: value("search"),
      sort: value("sort"),
      direction: value("direction"),
    };
  },
  head: () => ({ meta: [{ title: "Star Financeiro · Star Profissões" }] }),
  component: FinancialPageRoute,
});

function FinancialPageRoute() {
  const { session } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const unitId = session?.activeUnit?.id ?? "";
  const [page, setPage] = React.useState<FinancialPage>("dashboard");
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [collections, setCollections] = React.useState<Array<CollectionRow>>([]);
  const [filterOptions, setFilterOptions] = React.useState<FilterOptions>({
    courses: [],
    classes: [],
  });
  const [loading, setLoading] = React.useState(false);
  const filterQuery = React.useMemo(() => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) if (value) query.set(key, value);
    return query.toString();
  }, [search]);
  const load = React.useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams(filterQuery);
      q.set("unit_id", unitId);
      q.set("pageSize", "10");
      const [d, c, students] = await Promise.all([
        readJson<{ dashboard: DashboardData }>(
          await fetch(`/api/financeiro/dashboard?${q}`, { credentials: "same-origin" }),
        ),
        readJson<{ collections: Array<CollectionRow> }>(
          await fetch(`/api/financeiro/collections/today?${q}`, { credentials: "same-origin" }),
        ),
        readJson<StudentsData>(
          await fetch(`/api/financeiro/students?${q}`, { credentials: "same-origin" }),
        ),
      ]);
      setDashboard(d.dashboard);
      setCollections(c.collections);
      setFilterOptions(students.filters);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar o Financeiro.");
    } finally {
      setLoading(false);
    }
  }, [filterQuery, unitId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Star Financeiro"
        title="Gestão financeira"
        description={`Cobranças e recebíveis · Unidade: ${session?.activeUnit?.name ?? "não selecionada"}`}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}Atualizar
          </Button>
        }
      />
      <FinancialFilterBar
        value={search}
        options={filterOptions}
        onApply={(next) => void navigate({ search: next })}
        onSort={(sort) =>
          void navigate({
            search: {
              ...search,
              sort,
              direction: search.sort === sort && search.direction !== "asc" ? "asc" : "desc",
            },
          })
        }
      />
      <div className="overflow-x-auto rounded-xl border bg-card p-1.5 shadow-card">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                size="sm"
                variant={page === tab.id ? "default" : "ghost"}
                className={cn("rounded-lg", page === tab.id && "bg-gradient-primary")}
                onClick={() => setPage(tab.id)}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>
      </div>
      {page === "dashboard" ? <Dashboard data={dashboard} collections={collections} /> : null}
      {page === "central" ? (
        <DailyCollection
          rows={collections}
          search={search}
          onSort={(sort) => {
            void navigate({
              search: {
                ...search,
                sort,
                direction: search.sort === sort && search.direction !== "asc" ? "asc" : "desc",
              },
            });
          }}
        />
      ) : null}
      {page === "students" ? <Students unitId={unitId} filterQuery={filterQuery} /> : null}
      {page === "settings" ? <IntegrationSettings unitId={unitId} onSync={load} /> : null}
    </div>
  );
}

function localDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(value);
}

function moveDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function monthRange(value: string, offset: number) {
  const current = new Date(`${value}T12:00:00`);
  const start = new Date(current.getFullYear(), current.getMonth() + offset, 1, 12);
  const end = new Date(current.getFullYear(), current.getMonth() + offset + 1, 0, 12);
  return [localDate(start), localDate(end)] as const;
}

function FinancialFilterBar({
  value,
  options,
  onApply,
  onSort,
}: {
  value: FinanceSearch;
  options: FilterOptions;
  onApply: (value: FinanceSearch) => void;
  onSort: (sort: string) => void;
}) {
  const [draft, setDraft] = React.useState<FinanceSearch>(value);
  React.useEffect(() => setDraft(value), [value]);
  const update = (key: keyof FinanceSearch, next?: string) =>
    setDraft((current) => ({ ...current, [key]: next || undefined }));
  const apply = (next = draft) => {
    if (next.start_date && next.end_date && next.start_date > next.end_date) {
      toast.error("A data inicial não pode ser posterior à data final.");
      return;
    }
    onApply(next);
  };
  const setPeriod = (start?: string, end?: string) => {
    const next = { ...draft, start_date: start, end_date: end };
    setDraft(next);
    apply(next);
  };
  const today = localDate();
  const [thisMonthStart, thisMonthEnd] = monthRange(today, 0);
  const [lastMonthStart, lastMonthEnd] = monthRange(today, -1);
  const statusLabels: Record<string, string> = {
    overdue: "Em atraso",
    due_today: "Vence hoje",
    upcoming: "A vencer",
    not_found: "Dados não localizados",
    not_returned: "Não retornado",
  };
  const active = Object.values(value).some(Boolean);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="financial-start">De</Label>
              <Input
                id="financial-start"
                type="date"
                value={draft.start_date ?? ""}
                onChange={(event) => update("start_date", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="financial-end">Até</Label>
              <Input
                id="financial-end"
                type="date"
                value={draft.end_date ?? ""}
                onChange={(event) => update("end_date", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Filter
                value={draft.status ?? "all"}
                onChange={(next) => update("status", next === "all" ? undefined : next)}
                placeholder="Todas"
                items={[["all", "Todas"], ...Object.entries(statusLabels)]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Curso</Label>
              <Filter
                value={draft.course ?? "all"}
                onChange={(next) => update("course", next === "all" ? undefined : next)}
                placeholder="Todos"
                items={[["all", "Todos"], ...options.courses.map((item) => [item, item])]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Turma</Label>
              <Filter
                value={draft.class ?? "all"}
                onChange={(next) => update("class", next === "all" ? undefined : next)}
                placeholder="Todas"
                items={[["all", "Todas"], ...options.classes.map((item) => [item, item])]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="financial-search">Busca</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="financial-search"
                  className="pl-9"
                  placeholder="Nome, CPF, telefone, matrícula..."
                  value={draft.search ?? ""}
                  onChange={(event) => update("search", event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && apply()}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => apply()}>Aplicar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft({});
                onApply({});
              }}
            >
              <X /> Limpar
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPeriod(today, today)}>
            Hoje
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPeriod(moveDate(today, 1), moveDate(today, 1))}
          >
            Amanhã
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPeriod(today, moveDate(today, 6))}>
            Próximos 7 dias
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPeriod(moveDate(today, -6), today)}>
            Últimos 7 dias
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPeriod(moveDate(today, -29), today)}>
            Últimos 30 dias
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPeriod(thisMonthStart, thisMonthEnd)}>
            Este mês
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPeriod(lastMonthStart, lastMonthEnd)}>
            Mês passado
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPeriod()}>
            Todos
          </Button>
          <span className="mx-1 hidden h-7 border-l sm:block" />
          <Button size="sm" variant="ghost" onClick={() => onSort("due_date")}>
            <ArrowUpDown /> Vencimento
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onSort("days_overdue")}>
            <ArrowUpDown /> Atraso
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onSort("amount")}>
            <ArrowUpDown /> Valor
          </Button>
        </div>
        {active ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            {value.start_date || value.end_date ? (
              <Badge variant="outline">
                Período: {formatFinancialDate(value.start_date)} –{" "}
                {formatFinancialDate(value.end_date)}
              </Badge>
            ) : null}
            {value.status ? (
              <Badge variant="outline">{statusLabels[value.status] ?? value.status}</Badge>
            ) : null}
            {value.course ? <Badge variant="outline">{value.course}</Badge> : null}
            {value.class ? <Badge variant="outline">{value.class}</Badge> : null}
            {value.search ? <Badge variant="outline">Busca: {value.search}</Badge> : null}
            <button
              className="font-semibold text-primary hover:underline"
              onClick={() => {
                setDraft({});
                onApply({});
              }}
            >
              Limpar filtros
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
function Dashboard({
  data,
  collections,
}: {
  data: DashboardData | null;
  collections: Array<CollectionRow>;
}) {
  if (!data) return <Empty>Os dados financeiros ainda não estão disponíveis.</Empty>;
  const order = ["1-7", "8-15", "16-30", "31-60", "61-90", "90+"];
  const aging = order.map((bucket) => ({
    bucket,
    amount: data.aging.find((i) => i.bucket === bucket)?.amount ?? 0,
  }));
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#16006C_0%,#07154C_100%)] p-6 text-white shadow-card md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Visão financeira</p>
        <h2 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">
          Saúde financeira da operação
        </h2>
        <p className="mt-3 text-sm text-white/70">
          {data.installments_count} parcelas · {data.total_students} alunos com movimentação no
          período.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Valor no período"
          value={money.format(data.total_open_amount)}
          icon={WalletCards}
          hint={`${data.installments_count} parcelas encontradas`}
        />
        <StatCard
          label="Valor vencido"
          value={money.format(data.overdue_amount)}
          icon={AlertTriangle}
          accent="warning"
          hint={`${data.overdue_count} parcelas`}
        />
        <StatCard
          label="Vence hoje"
          value={money.format(data.due_today_amount)}
          icon={Clock3}
          accent="gold"
          hint={`${data.due_today_count} parcelas`}
        />
        <StatCard
          label="Valor futuro"
          value={money.format(data.upcoming_amount)}
          icon={CalendarClock}
          accent="success"
          hint={`${data.upcoming_count} parcelas`}
        />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aging da inadimplência</CardTitle>
            <CardDescription>Valores vencidos por faixa de atraso</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" />
                <XAxis dataKey="bucket" />
                <YAxis hide />
                <Tooltip formatter={(value) => money.format(Number(value))} />
                <Bar dataKey="amount" fill="#F4B728" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas operacionais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Indicator label="Alunos inadimplentes" value={data.students_overdue} />
            <Indicator label="Promessas para hoje" value={data.promises_today} />
            <Indicator label="Promessas quebradas" value={data.broken_promises} danger />
            <Indicator
              label="Dados financeiros não localizados"
              value={data.not_found_financial_count}
            />
            <Indicator label="Parcelas não retornadas" value={data.not_returned_count} />
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Maiores prioridades agora</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {collections.slice(0, 5).map((row) => (
            <div key={row.installment_id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <Link
                  to="/financeiro/aluno/$studentId"
                  params={{ studentId: row.student_id }}
                  className="font-semibold hover:text-primary"
                >
                  {row.full_name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {row.days_overdue > 0 ? `${row.days_overdue} dias de atraso` : "Vence hoje"} ·{" "}
                  {money.format(row.total_amount)}
                </p>
              </div>
              <Badge variant="outline">Score {row.score}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
function Indicator({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <strong className={danger && value ? "text-destructive" : ""}>{value}</strong>
    </div>
  );
}
const installmentStatusLabel: Record<string, string> = {
  overdue: "Em atraso",
  due_today: "Vence hoje",
  upcoming: "A vencer",
  not_returned: "Não retornado",
};

function DailyCollection({
  rows,
  search,
  onSort,
}: {
  rows: Array<CollectionRow>;
  search: FinanceSearch;
  onSort: (sort: string) => void;
}) {
  const sortHeader = (label: string, sort: string) => (
    <button
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => onSort(sort)}
    >
      {label} <ArrowUpDown className="h-3.5 w-3.5" />
    </button>
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          Central de Cobrança
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          {search.start_date || search.end_date ? "Recebíveis do período" : "Prioridades do dia"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Score determinístico por promessa, atraso, valor e suspensão.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ações prioritárias" value={rows.length} icon={ListChecks} />
        <StatCard
          label="Promessas quebradas"
          value={
            rows.filter(
              (r) => r.promised_date && r.promised_date < new Date().toISOString().slice(0, 10),
            ).length
          }
          icon={AlertTriangle}
          accent="warning"
        />
        <StatCard
          label="Valor na fila"
          value={money.format(rows.reduce((sum, r) => sum + r.total_amount, 0))}
          icon={CircleDollarSign}
          accent="gold"
        />
      </section>
      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto p-0">
          {rows.length ? (
            <table className="w-full min-w-[1650px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Aluno</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Turma</th>
                  <th className="px-4 py-3">{sortHeader("Vencimento", "due_date")}</th>
                  <th className="px-4 py-3">{sortHeader("Dias de atraso", "days_overdue")}</th>
                  <th className="px-4 py-3">Valor original</th>
                  <th className="px-4 py-3">Juros/Multa</th>
                  <th className="px-4 py-3">{sortHeader("Valor atual", "amount")}</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Último contato</th>
                  <th className="px-4 py-3">Promessa</th>
                  <th className="px-4 py-3">Prioridade</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.installment_id} className="hover:bg-muted/30">
                    <td className="px-4 py-4">
                      <div className="font-semibold">{row.full_name}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div>{row.responsible_name || "Próprio aluno"}</div>
                    </td>
                    <td className="px-4 py-4">{row.responsible_phone || row.phone || "—"}</td>
                    <td className="px-4 py-4">{row.course_name || "—"}</td>
                    <td className="px-4 py-4">{row.class_name || "—"}</td>
                    <td className="px-4 py-4">{formatFinancialDate(row.due_date)}</td>
                    <td className="px-4 py-4 font-semibold text-destructive">
                      {row.days_overdue > 0 ? row.days_overdue : "—"}
                    </td>
                    <td className="px-4 py-4">{money.format(row.original_amount)}</td>
                    <td className="px-4 py-4">
                      {money.format(row.penalty_amount + row.interest_amount)}
                    </td>
                    <td className="px-4 py-4 font-bold">{money.format(row.total_amount)}</td>
                    <td className="px-4 py-4">
                      <Badge variant="outline">
                        {installmentStatusLabel[row.status] ?? row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">{formatFinancialDate(row.last_contact_at)}</td>
                    <td className="px-4 py-4">
                      {row.promised_date
                        ? `${formatFinancialDate(row.promised_date)} · ${money.format(row.promised_amount ?? 0)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="outline">{row.score}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/financeiro/aluno/$studentId"
                          params={{ studentId: row.student_id }}
                        >
                          Abrir perfil
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Nenhuma parcela encontrada para os filtros selecionados.</Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function Filter({
  value,
  onChange,
  placeholder,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  items: Array<Array<string>>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function LookupBadge({ status }: { status: string | null }) {
  const labels: Record<string, string> = {
    FOUND: "Encontrado",
    NOT_FOUND: "Dados não localizados",
    NO_DOCUMENT: "Sem documento",
    ERROR: "Erro",
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "FOUND" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        status === "ERROR" && "border-red-200 bg-red-50 text-red-800",
      )}
    >
      {labels[status ?? ""] ?? "Pendente"}
    </Badge>
  );
}
function Students({ unitId, filterQuery }: { unitId: string; filterQuery: string }) {
  const [data, setData] = React.useState<StudentsData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [filterQuery]);
  const load = React.useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams(filterQuery);
      q.set("unit_id", unitId);
      q.set("page", String(page));
      q.set("pageSize", "25");
      setData(
        await readJson<StudentsData>(
          await fetch(`/api/financeiro/students?${q}`, { credentials: "same-origin" }),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao listar alunos.");
    } finally {
      setLoading(false);
    }
  }, [filterQuery, unitId, page]);
  React.useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Alunos e situação financeira</CardTitle>
          <CardDescription>
            Visão consolidada conforme os filtros aplicados no topo.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto p-0">
          {loading && !data ? (
            <Empty>Carregando...</Empty>
          ) : data?.students.length ? (
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {[
                    "Aluno",
                    "Curso",
                    "Turma",
                    "Matrícula",
                    "Vencido",
                    "Parcelas",
                    "Maior atraso",
                    "Status",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.students.map((s) => (
                  <tr key={`${s.id}-${s.external_enrollment_id}`}>
                    <td className="px-4 py-4">
                      <div className="font-semibold">{s.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.phone || "Sem telefone"}
                      </div>
                    </td>
                    <td className="px-4 py-4">{s.course_name || "—"}</td>
                    <td className="px-4 py-4">{s.class_name || "—"}</td>
                    <td className="px-4 py-4">{s.external_enrollment_id || "—"}</td>
                    <td className="px-4 py-4 font-bold">{money.format(s.overdue_amount)}</td>
                    <td className="px-4 py-4">{s.overdue_count}</td>
                    <td className="px-4 py-4">{s.max_overdue_days} dias</td>
                    <td className="px-4 py-4">
                      <LookupBadge status={s.financial_lookup_status} />
                    </td>
                    <td className="px-4 py-4">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/financeiro/aluno/$studentId" params={{ studentId: s.id }}>
                          Abrir
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Nenhum aluno encontrado para os filtros selecionados.</Empty>
          )}
        </CardContent>
      </Card>
      {data ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} registros</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Badge variant="outline">Página {page}</Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function IntegrationSettings({ unitId, onSync }: { unitId: string; onSync: () => Promise<void> }) {
  const [state, setState] = React.useState<IntegrationState | null>(null);
  const [runs, setRuns] = React.useState<Array<SyncRun>>([]);
  const [token, setToken] = React.useState("");
  const [past, setPast] = React.useState(730);
  const [future, setFuture] = React.useState(365);
  const [active, setActive] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const load = React.useCallback(async () => {
    if (!unitId) return;
    const q = `unit_id=${encodeURIComponent(unitId)}`;
    const [i, r] = await Promise.all([
      readJson<{ integration: IntegrationState }>(
        await fetch(`/api/financeiro/integration?${q}`, { credentials: "same-origin" }),
      ),
      readJson<{ runs: Array<SyncRun> }>(
        await fetch(`/api/financeiro/sync?${q}`, { credentials: "same-origin" }),
      ),
    ]);
    setState(i.integration);
    setPast(i.integration.syncPastDays);
    setFuture(i.integration.syncFutureDays);
    setActive(i.integration.active);
    setRuns(r.runs);
  }, [unitId]);
  React.useEffect(() => {
    void load().catch((e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao carregar integração."),
    );
  }, [load]);
  const hasActiveRun = runs.some((run) => run.status === "queued" || run.status === "running");
  React.useEffect(() => {
    if (!hasActiveRun) return;
    const timer = window.setInterval(() => {
      void load().catch((e) =>
        toast.error(e instanceof Error ? e.message : "Falha ao atualizar sincronização."),
      );
      void onSync();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun, load, onSync]);
  async function action(kind: "save" | "test" | "sync") {
    setBusy(kind);
    try {
      if (kind === "save") {
        const result = await readJson<{ integration: IntegrationState }>(
          await fetch("/api/financeiro/integration", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unit_id: unitId,
              token,
              syncPastDays: past,
              syncFutureDays: future,
              active,
            }),
          }),
        );
        setState(result.integration);
        setToken("");
        toast.success("Integração CAEZ salva com segurança.");
      } else if (kind === "test") {
        const result = await readJson<{ result: { classesCount: number } }>(
          await fetch("/api/financeiro/integration", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unit_id: unitId, token: token || undefined }),
          }),
        );
        toast.success(`Conexão válida: ${result.result.classesCount} turmas retornadas.`);
      } else {
        const result = await readJson<{ run?: SyncRun }>(
          await fetch("/api/financeiro/sync", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unit_id: unitId }),
          }),
        );
        if (!result.run) throw new Error("Não foi possível identificar a sincronização iniciada.");
        setRuns((current) => [result.run!, ...current.filter((run) => run.id !== result.run!.id)]);
        toast.success("Sincronização iniciada.");
        await onSync();
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação CAEZ.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-primary" />
            <div>
              <CardTitle>Integração CAEZ</CardTitle>
              <CardDescription>Token criptografado e específico desta unidade.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <strong className="text-sm">Integração ativa</strong>
              <p className="text-xs text-muted-foreground">
                {state?.configured ? "Token armazenado" : "Token ainda não configurado"}
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caez-token">Token integração</Label>
            <Input
              id="caez-token"
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                state?.configured ? "Deixe vazio para manter o token salvo" : "Cole o token do CAEZ"
              }
            />
            <p className="text-xs text-muted-foreground">
              O token salvo nunca retorna ao navegador.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Dias retroativos</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={past}
                onChange={(e) => setPast(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Dias futuros</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={future}
                onChange={(e) => setFuture(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={() => void action("save")} disabled={!!busy}>
              {busy === "save" ? <Loader2 className="animate-spin" /> : null}Salvar
            </Button>
            <Button variant="outline" onClick={() => void action("test")} disabled={!!busy}>
              Testar conexão
            </Button>
            <Button
              variant="outline"
              onClick={() => void action("sync")}
              disabled={!!busy || !state?.configured}
            >
              Sincronizar agora
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Status operacional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Alunos" value={state?.studentsCount ?? 0} />
            <Mini label="Parcelas" value={state?.installmentsCount ?? 0} />
            <Mini label="Última tentativa" value={formatFinancialDate(state?.lastSyncAt)} />
            <Mini label="Último sucesso" value={formatFinancialDate(state?.lastSuccessfulSyncAt)} />
          </div>
          {state?.lastError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {state.lastError}
            </div>
          ) : null}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Execuções recentes</h3>
            {runs.length ? (
              <div className="divide-y rounded-xl border">
                {runs.map((run) => (
                  <div key={run.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <Badge variant="outline">{run.status}</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {run.classes_processed} turmas · {run.students_processed} alunos ·{" "}
                        {run.installments_found} parcelas
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatFinancialDate(run.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nenhuma sincronização executada.</Empty>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-sm">{value}</strong>
    </div>
  );
}
