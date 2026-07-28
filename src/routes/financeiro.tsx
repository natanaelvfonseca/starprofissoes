import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageCircle,
  PhoneCall,
  ReceiptText,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/layout/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type FinancialPage =
  | "dashboard"
  | "central"
  | "turmas"
  | "alunos"
  | "cobranca"
  | "whatsapp"
  | "score"
  | "relatorios";
type ClassStatus = "Saudável" | "Atenção" | "Risco" | "Crítico";

type ClassRecord = {
  id: string;
  course: string;
  city: string;
  date: string;
  students: number;
  expected: number;
  received: number;
  status: ClassStatus;
};

type Student = {
  id: string;
  name: string;
  whatsapp: string;
  course: string;
  city: string;
  classDate: string;
  total: number;
  paid: number;
  status: string;
  risk: number;
  nextAction: string;
  promise: string;
};

const classes: Array<ClassRecord> = [
  { id: "bh-maquinas", course: "Operador de Máquinas Pesadas", city: "Belo Horizonte/MG", date: "2026-08-15", students: 31, expected: 74200, received: 46004, status: "Atenção" },
  { id: "juina-bovinos", course: "Inseminação Artificial em Bovinos", city: "Juína/MT", date: "2026-08-02", students: 24, expected: 57528, received: 50112, status: "Saudável" },
  { id: "querencia-colheitadeira", course: "Operador de Colheitadeira", city: "Querência/MT", date: "2026-07-25", students: 19, expected: 45543, received: 23682, status: "Risco" },
  { id: "goiania-nr", course: "NR Segurança no Trabalho", city: "Goiânia/GO", date: "2026-07-18", students: 28, expected: 39144, received: 17615, status: "Crítico" },
];

const students: Array<Student> = [
  { id: "ana", name: "Ana Paula Ribeiro", whatsapp: "(31) 99843-2210", course: "Operador de Máquinas Pesadas", city: "Belo Horizonte/MG", classDate: "2026-08-15", total: 2397, paid: 1200, status: "Plano ativo", risk: 34, nextAction: "Enviar segunda parcela do plano sugerido", promise: "Prometeu pagar R$ 300 amanhã" },
  { id: "joao", name: "João Batista Martins", whatsapp: "(62) 99120-0081", course: "NR Segurança no Trabalho", city: "Goiânia/GO", classDate: "2026-07-18", total: 1398, paid: 200, status: "Atrasado crítico", risk: 88, nextAction: "Ligar agora e renegociar entrada", promise: "Promessa quebrada há 2 dias" },
  { id: "priscila", name: "Priscila Moraes", whatsapp: "(66) 98441-5542", course: "Operador de Colheitadeira", city: "Querência/MT", classDate: "2026-07-25", total: 2397, paid: 0, status: "Risco de desistência", risk: 92, nextAction: "Encaminhar para financeiro", promise: "Não respondeu WhatsApp" },
  { id: "carlos", name: "Carlos Henrique Lima", whatsapp: "(66) 99904-7122", course: "Inseminação Artificial em Bovinos", city: "Juína/MT", classDate: "2026-08-02", total: 2397, paid: 2397, status: "Quitado", risk: 8, nextAction: "Enviar confirmação pré-turma", promise: "Pagamento confirmado" },
  { id: "marta", name: "Marta Fernanda Souza", whatsapp: "(31) 98720-1011", course: "Operador de Máquinas Pesadas", city: "Belo Horizonte/MG", classDate: "2026-08-15", total: 2397, paid: 700, status: "Em dia", risk: 28, nextAction: "Lembrete amigável em 48h", promise: "Plano em andamento" },
  { id: "edson", name: "Edson Pereira Alves", whatsapp: "(62) 98554-9021", course: "NR Segurança no Trabalho", city: "Goiânia/GO", classDate: "2026-07-18", total: 1398, paid: 650, status: "Atrasado leve", risk: 61, nextAction: "Enviar vencimento de hoje", promise: "Atendeu ligação e pediu retorno" },
];

const cashFlow = [
  { label: "Hoje", recebido: 18400, previsto: 27000 },
  { label: "D+3", recebido: 24700, previsto: 38000 },
  { label: "D+7", recebido: 41100, previsto: 62000 },
  { label: "D+15", recebido: 68300, previsto: 101000 },
  { label: "D+30", recebido: 96000, previsto: 167000 },
];

const receivingEvolution = [
  { day: "D-30", recebido: 18 },
  { day: "D-21", recebido: 29 },
  { day: "D-15", recebido: 43 },
  { day: "D-10", recebido: 58 },
  { day: "D-7", recebido: 71 },
  { day: "D-2", recebido: 90 },
];

const tabs: Array<{ id: FinancialPage; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "central", label: "Central do dia", icon: ListChecks },
  { id: "turmas", label: "Turmas", icon: CalendarClock },
  { id: "alunos", label: "Alunos e recebíveis", icon: Users },
  { id: "cobranca", label: "Cobrança", icon: PhoneCall },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "score", label: "Score", icon: Gauge },
  { id: "relatorios", label: "Relatórios", icon: FileBarChart },
];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = (received: number, expected: number) => Math.round((received / expected) * 100);
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T12:00:00`));
const financialTotals = {
  expected: 572_415,
  received: 216_982,
  open: 572_415 - 216_982,
  inGoodStanding: 87,
  risk: 75,
};

export const Route = createFileRoute("/financeiro")({
  head: () => ({ meta: [{ title: "Star Financeiro · Star Profissões" }] }),
  component: FinancialPageRoute,
});

function FinancialPageRoute() {
  const [page, setPage] = React.useState<FinancialPage>("dashboard");
  const [selectedClass, setSelectedClass] = React.useState(classes[0]);
  const [selectedStudent, setSelectedStudent] = React.useState<Student | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Star Financeiro"
        title="Plataforma de Cobrança Inteligente"
      />

      <div className="overflow-x-auto rounded-xl border bg-card p-1.5 shadow-card">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                type="button"
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

      {page === "dashboard" ? <Dashboard totals={financialTotals} /> : null}
      {page === "central" ? <DailyCollectionPage /> : null}
      {page === "turmas" ? (
        <ClassesPage selected={selectedClass} onSelect={setSelectedClass} />
      ) : null}
      {page === "alunos" ? <StudentsPage onSelect={setSelectedStudent} /> : null}
      {page === "cobranca" ? <CollectionPage /> : null}
      {page === "whatsapp" ? <WhatsappPage /> : null}
      {page === "score" ? <ScorePage /> : null}
      {page === "relatorios" ? <ReportsPage /> : null}

      {selectedStudent ? (
        <StudentDrawer student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      ) : null}
    </div>
  );
}

function Dashboard({ totals }: { totals: typeof financialTotals }) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#16006C_0%,#07154C_100%)] p-6 text-white shadow-card md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Estratégia financeira</p>
            <h2 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">
              Saúde financeira da operação
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Monitore matrículas, priorize cobranças e reduza o risco financeiro da operação.
            </p>
          </div>
          <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full border border-emerald-300/50 bg-emerald-500/20 text-center shadow-[0_0_40px_rgba(52,211,153,0.18)]">
            <div><strong className="block text-4xl text-emerald-300">{totals.inGoodStanding}%</strong><span className="block max-w-24 text-xs font-semibold leading-4 text-emerald-100">dos alunos em dia</span></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receita prevista" value={money.format(totals.expected)} icon={WalletCards} hint="Turmas ativas" />
        <StatCard label="Receita recebida" value={money.format(totals.received)} icon={Banknote} accent="success" hint="Caixa confirmado" />
        <StatCard label="Saldo em aberto" value={money.format(totals.open)} icon={ReceiptText} accent="gold" hint="Valor ainda a receber" />
        <StatCard label="Alunos em risco" value={totals.risk} icon={AlertTriangle} accent="warning" hint="Prioridade de cobrança" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Previsão de caixa" description="Recebido e previsto para os próximos 30 dias">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={cashFlow}>
              <defs>
                <linearGradient id="finance-gold" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#F4B728" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F4B728" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(value) => money.format(Number(value))} />
              <Area dataKey="previsto" stroke="#224C99" fill="transparent" strokeWidth={2} />
              <Area dataKey="recebido" stroke="#F4B728" fill="url(#finance-gold)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Evolução até a turma" description="Percentual médio recebido antes da realização">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={receivingEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => `${value}% recebido`} />
              <Line dataKey="recebido" stroke="#F4B728" strokeWidth={3} dot={{ fill: "#224C99" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Metas de antecipação</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {[["D-15", 40], ["D-7", 70], ["D-2", 90]].map(([label, value]) => (
              <div key={label}>
                <div className="mb-2 flex justify-between text-sm font-semibold"><span>{label}</span><span>{value}% recebido</span></div>
                <Progress value={Number(value)} className="h-2.5" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Fila de ações prioritárias</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {students.filter((student) => student.risk >= 60).map((student) => (
              <div key={student.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div><div className="text-sm font-semibold">{student.name}</div><p className="mt-1 text-xs text-muted-foreground">{student.nextAction}</p></div>
                <RiskBadge value={student.risk} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const dailyCollectionRows = [
  {
    id: "joao-silva",
    student: "João Silva",
    className: "Máquinas Agrícolas",
    situation: "Parcela atrasada",
    value: 300,
    commitment: "Sem acordo",
    action: "Iniciar negociação",
    tone: "critical",
  },
  {
    id: "maria-souza",
    student: "Maria Souza",
    className: "Bombeiro Civil",
    situation: "Promessa vence hoje",
    value: 150,
    commitment: "Pagar até 17h",
    action: "Enviar lembrete",
    tone: "attention",
  },
  {
    id: "carlos-lima",
    student: "Carlos Lima",
    className: "Inseminação Artificial",
    situation: "Acordo quebrado",
    value: 200,
    commitment: "R$ 50 semanal",
    action: "Reorganizar plano",
    tone: "critical",
  },
  {
    id: "ana-santos",
    student: "Ana Santos",
    className: "Máquinas Pesadas",
    situation: "Aguardando Pix",
    value: 250,
    commitment: "Pagar hoje",
    action: "Confirmar recebimento",
    tone: "waiting",
  },
] as const;

function DailyCollectionPage() {
  const indicators = [
    { value: "R$ 8.750", label: "prometidos para hoje", icon: CircleDollarSign, tone: "text-primary bg-primary/10" },
    { value: "R$ 3.200", label: "recebidos hoje", icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
    { value: "18", label: "compromissos vencendo", icon: Clock3, tone: "text-amber-700 bg-amber-50" },
    { value: "7", label: "promessas quebradas", icon: AlertTriangle, tone: "text-red-700 bg-red-50" },
    { value: "12", label: "negociações aguardando resposta", icon: MessageCircle, tone: "text-violet-700 bg-violet-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          Central de cobrança do dia
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Prioridades de cobrança</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Tudo o que a equipe precisa acompanhar hoje para recuperar pagamentos e cumprir
          promessas.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {indicators.map((indicator) => {
          const Icon = indicator.icon;
          return (
            <Card key={indicator.label} className="overflow-hidden">
              <CardContent className="p-5">
                <div className={cn("grid h-10 w-10 place-items-center rounded-xl", indicator.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <strong className="mt-4 block text-2xl tracking-tight">{indicator.value}</strong>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {indicator.label}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Fila operacional de hoje</CardTitle>
              <CardDescription className="mt-1">
                Ordenada por urgência, compromisso e risco de recebimento.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit bg-background">
              4 ações prioritárias
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Aluno", "Turma", "Situação", "Valor", "Compromisso", "Próxima ação"].map(
                  (heading) => (
                    <th key={heading} className="px-5 py-3 font-semibold">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {dailyCollectionRows.map((row) => (
                <tr key={row.id} className="transition hover:bg-muted/30">
                  <td className="px-5 py-4">
                    <Link
                      to="/financeiro/aluno/$studentId"
                      params={{ studentId: row.id }}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {row.student}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{row.className}</td>
                  <td className="px-5 py-4">
                    <Badge
                      variant="outline"
                      className={cn(
                        row.tone === "critical" && "border-red-200 bg-red-50 text-red-800",
                        row.tone === "attention" && "border-amber-200 bg-amber-50 text-amber-800",
                        row.tone === "waiting" && "border-blue-200 bg-blue-50 text-blue-800",
                      )}
                    >
                      {row.situation}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 font-bold">{money.format(row.value)}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.commitment}</td>
                  <td className="px-5 py-4">
                    <Button asChild size="sm" variant="outline" className="justify-between">
                      <Link to="/financeiro/aluno/$studentId" params={{ studentId: row.id }}>
                        {row.action}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ClassesPage({ selected, onSelect }: { selected: ClassRecord; onSelect: (item: ClassRecord) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Turmas itinerantes</CardTitle><CardDescription>Selecione uma turma para consultar a antecipação.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-y bg-muted/45 text-left text-xs uppercase text-muted-foreground"><tr>{["Curso", "Cidade", "Data", "Alunos", "Previsto", "Recebido", "Antecipado", "Status"].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
            <tbody className="divide-y">
              {classes.map((item) => (
                <tr key={item.id} className={cn("cursor-pointer transition hover:bg-muted/40", selected.id === item.id && "bg-accent/45")} onClick={() => onSelect(item)}>
                  <td className="px-4 py-4 font-semibold">{item.course}</td><td className="px-4 py-4">{item.city}</td><td className="px-4 py-4">{formatDate(item.date)}</td><td className="px-4 py-4">{item.students}</td><td className="px-4 py-4">{money.format(item.expected)}</td><td className="px-4 py-4">{money.format(item.received)}</td><td className="px-4 py-4 font-bold">{percent(item.received, item.expected)}%</td><td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{selected.city}</CardTitle><CardDescription>{selected.course}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <Summary label="Receita prevista" value={money.format(selected.expected)} />
          <Summary label="Receita recebida" value={money.format(selected.received)} />
          <Summary label="Saldo aberto" value={money.format(selected.expected - selected.received)} />
          <div><div className="mb-2 flex justify-between text-sm font-semibold"><span>Antecipação</span><span>{percent(selected.received, selected.expected)}%</span></div><Progress value={percent(selected.received, selected.expected)} /></div>
        </CardContent>
      </Card>
    </div>
  );
}

function StudentsPage({ onSelect }: { onSelect: (student: Student) => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Alunos e recebíveis</CardTitle><CardDescription>Clique em um aluno para abrir o plano automático de antecipação.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="border-y bg-muted/45 text-left text-xs uppercase text-muted-foreground"><tr>{["Aluno", "Curso / cidade", "Turma", "Total", "Pago", "Saldo", "%", "Status", "Score"].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
          <tbody className="divide-y">
            {students.map((student) => (
              <tr key={student.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => onSelect(student)}>
                <td className="px-4 py-4"><div className="font-semibold">{student.name}</div><div className="text-xs text-muted-foreground">{student.whatsapp}</div></td><td className="px-4 py-4"><div>{student.course}</div><div className="text-xs text-muted-foreground">{student.city}</div></td><td className="px-4 py-4">{formatDate(student.classDate)}</td><td className="px-4 py-4">{money.format(student.total)}</td><td className="px-4 py-4 text-emerald-700">{money.format(student.paid)}</td><td className="px-4 py-4 font-semibold">{money.format(student.total - student.paid)}</td><td className="px-4 py-4">{percent(student.paid, student.total)}%</td><td className="px-4 py-4"><Badge variant="outline">{student.status}</Badge></td><td className="px-4 py-4"><RiskBadge value={student.risk} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CollectionPage() {
  const columns = ["Lembrete automático", "Atraso leve", "Atraso crítico", "Ligar agora", "Promessa quebrada", "Resolvido"];
  return (
    <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))` }}>
      {columns.map((column, index) => (
        <Card key={column} className="bg-muted/30 shadow-none">
          <CardHeader className="p-4"><CardTitle className="text-sm">{column}</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-3 pt-0">
            {students.filter((_, studentIndex) => studentIndex % columns.length === index || (index === 3 && students[studentIndex].risk > 80)).map((student) => (
              <div key={`${column}-${student.id}`} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2"><strong className="text-sm">{student.name}</strong><RiskBadge value={student.risk} /></div>
                <p className="mt-2 text-xs text-muted-foreground">{student.course}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{student.city}</div>
                <div className="mt-3 border-t pt-3 text-sm font-bold">{money.format(student.total - student.paid)} em aberto</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WhatsappPage() {
  const messages = [
    ["Boas-vindas", "Sua matrícula foi registrada. Vamos organizar seu pagamento até a data da turma."],
    ["Plano sugerido", "Posso dividir o saldo em parcelas menores antes da turma para facilitar sua organização."],
    ["Vencimento hoje", "Hoje é o melhor dia para avançar no seu plano Star Financeiro. Posso enviar o link?"],
    ["Pré-turma", "Sua turma está chegando. Vamos deixar sua confirmação financeira pronta."],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle>Régua automática</CardTitle><CardDescription>Sequência sugerida de contatos.</CardDescription></CardHeader><CardContent className="space-y-2">{["Boas-vindas", "Plano sugerido", "Lembrete leve", "Vencimento hoje", "Atraso leve", "Atraso crítico", "Pré-turma", "Confirmação", "Atendimento humano"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-lg border p-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span><span className="text-sm font-semibold">{item}</span></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Exemplos de mensagens</CardTitle></CardHeader><CardContent className="space-y-3">{messages.map(([title, text]) => <div key={title} className="max-w-[90%] rounded-2xl rounded-tl-sm bg-emerald-50 p-4"><strong className="text-sm text-emerald-900">{title}</strong><p className="mt-1 text-sm leading-6 text-emerald-900/75">{text}</p></div>)}</CardContent></Card>
    </div>
  );
}

function ScorePage() {
  const rules = [["Não pagou entrada", "+30"], ["Não respondeu WhatsApp", "+20"], ["Atrasou parcela", "+20"], ["Turma em menos de 7 dias", "+30"], ["Saldo acima de 50% em aberto", "+25"], ["Quebrou promessa", "+35"], ["Pagou parte do valor", "-20"], ["Confirmou presença", "-10"]];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Como o score é calculado</CardTitle></CardHeader><CardContent className="divide-y">{rules.map(([label, points]) => <div key={label} className="flex justify-between py-3 text-sm"><span>{label}</span><strong className={points.startsWith("+") ? "text-destructive" : "text-emerald-700"}>{points}</strong></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Classificação de risco</CardTitle></CardHeader><CardContent className="space-y-3"><RiskLevel label="Baixo risco" range="0 a 30" className="bg-emerald-50 text-emerald-800" /><RiskLevel label="Médio risco" range="31 a 60" className="bg-amber-50 text-amber-800" /><RiskLevel label="Alto risco" range="61 a 80" className="bg-orange-50 text-orange-800" /><RiskLevel label="Crítico" range="81 a 100" className="bg-red-50 text-red-800" /><p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">O score combina comportamento, proximidade da turma e saldo em aberto para ordenar a cobrança.</p></CardContent></Card>
    </div>
  );
}

function ReportsPage() {
  const byCity = classes.map((item) => ({ city: item.city.split("/")[0], recebido: item.received, aberto: item.expected - item.received }));
  const pie = [{ name: "Recebido", value: 137413, color: "#F4B728" }, { name: "Em aberto", value: 79002, color: "#224C99" }];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Recebimento por cidade"><ResponsiveContainer width="100%" height={280}><BarChart data={byCity}><CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" /><XAxis dataKey="city" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="recebido" fill="#F4B728" radius={[8, 8, 0, 0]} /><Bar dataKey="aberto" fill="#224C99" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Previsão de caixa"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={pie} dataKey="value" innerRadius={70} outerRadius={105} paddingAngle={4}>{pie.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer></ChartCard>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{["Recebimento por curso", "Recebimento por consultor", "Maior antecipação", "Turmas em risco", "Inadimplência"].map((item) => <Card key={item}><CardContent className="p-5"><FileBarChart className="h-5 w-5 text-primary" /><strong className="mt-4 block text-sm">{item}</strong><p className="mt-2 text-xs text-muted-foreground">Relatório executivo demonstrativo.</p></CardContent></Card>)}</div>
    </div>
  );
}

function StudentDrawer({ student, onClose }: { student: Student; onClose: () => void }) {
  const open = student.total - student.paid;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-background p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Plano automático de antecipação</p><h2 className="mt-2 text-2xl font-bold">{student.name}</h2><p className="mt-1 text-sm text-muted-foreground">{student.course} · {student.city}</p></div><Button type="button" variant="ghost" size="icon" onClick={onClose}><X /></Button></div>
        <div className="mt-6 grid grid-cols-2 gap-3"><SummaryBox label="Valor do curso" value={money.format(student.total)} icon={CircleDollarSign} /><SummaryBox label="Valor pago" value={money.format(student.paid)} icon={CheckCircle2} /><SummaryBox label="Saldo restante" value={money.format(open)} icon={ReceiptText} /><SummaryBox label="Score de risco" value={String(student.risk)} icon={Gauge} /></div>
        <div className="mt-6 rounded-xl border p-4"><div className="mb-3 flex justify-between text-sm font-semibold"><span>Progresso do pagamento</span><span>{percent(student.paid, student.total)}%</span></div><Progress value={percent(student.paid, student.total)} /></div>
        <Card className="mt-6"><CardHeader><CardTitle className="text-base">Plano sugerido</CardTitle><CardDescription>{student.promise}</CardDescription></CardHeader><CardContent className="space-y-2">{[0, 7, 14, 25].map((days, index) => <div key={days} className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm"><span>Parcela {index + 1}</span><strong>{money.format(Math.ceil(open / 4))} {index === 0 ? "hoje" : `em ${days} dias`}</strong></div>)}</CardContent></Card>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button asChild className="col-span-2 bg-gradient-primary">
            <Link to="/financeiro/aluno/$studentId" params={{ studentId: student.id }}>
              Abrir perfil financeiro completo
              <ArrowRight />
            </Link>
          </Button>
          <Button><Send />Enviar link</Button>
          <Button variant="outline"><Banknote />Registrar pagamento</Button>
          <Button variant="outline"><ReceiptText />Registrar promessa</Button>
          <Button variant="outline"><MessageCircle />WhatsApp</Button>
        </div>
      </aside>
    </div>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</CardHeader><CardContent>{children}</CardContent></Card>;
}

function StatusBadge({ status }: { status: ClassStatus }) {
  const classesByStatus: Record<ClassStatus, string> = { "Saudável": "bg-emerald-50 text-emerald-800 border-emerald-200", "Atenção": "bg-amber-50 text-amber-800 border-amber-200", "Risco": "bg-orange-50 text-orange-800 border-orange-200", "Crítico": "bg-red-50 text-red-800 border-red-200" };
  return <Badge variant="outline" className={classesByStatus[status]}>{status}</Badge>;
}

function RiskBadge({ value }: { value: number }) {
  return <Badge variant="outline" className={cn(value >= 81 ? "border-red-200 bg-red-50 text-red-800" : value >= 61 ? "border-orange-200 bg-orange-50 text-orange-800" : value >= 31 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{value}</Badge>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b pb-3 text-sm last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}

function SummaryBox({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Banknote }) {
  return <div className="rounded-xl border p-4"><Icon className="h-5 w-5 text-primary" /><span className="mt-3 block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block">{value}</strong></div>;
}

function RiskLevel({ label, range, className }: { label: string; range: string; className: string }) {
  return <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold", className)}><span>{label}</span><span>{range}</span></div>;
}
