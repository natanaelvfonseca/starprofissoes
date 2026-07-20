import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  PhoneCall,
  ReceiptText,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
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
import starLogo from "./assets/star-profissoes-logo.png";
import "./App.css";

type Page = "dashboard" | "turmas" | "alunos" | "cobranca" | "whatsapp" | "score" | "relatorios";
type ClassStatus = "Saudável" | "Atenção" | "Risco" | "Crítico";
type StudentStatus =
  | "Matriculado"
  | "Entrada paga"
  | "Plano ativo"
  | "Em dia"
  | "Atrasado leve"
  | "Atrasado crítico"
  | "Risco de desistência"
  | "Quitado"
  | "Confirmado para turma"
  | "Bloqueado financeiro";

type ClassRecord = {
  id: string;
  course: string;
  city: string;
  date: string;
  students: number;
  expected: number;
  received: number;
  status: ClassStatus;
  consultant: string;
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
  status: StudentStatus;
  risk: number;
  nextAction: string;
  promise: string;
};

const classes: ClassRecord[] = [
  {
    id: "bh-maquinas",
    course: "Operador de Máquinas Pesadas",
    city: "Belo Horizonte/MG",
    date: "2026-08-15",
    students: 31,
    expected: 74200,
    received: 46004,
    status: "Atenção",
    consultant: "Mariana Costa",
  },
  {
    id: "juina-bovinos",
    course: "Inseminação Artificial em Bovinos",
    city: "Juína/MT",
    date: "2026-08-02",
    students: 24,
    expected: 57528,
    received: 50112,
    status: "Saudável",
    consultant: "Rafael Nunes",
  },
  {
    id: "querencia-colheitadeira",
    course: "Operador de Colheitadeira",
    city: "Querência/MT",
    date: "2026-07-25",
    students: 19,
    expected: 45543,
    received: 23682,
    status: "Risco",
    consultant: "Bianca Rocha",
  },
  {
    id: "goiania-nr",
    course: "NR Segurança no Trabalho",
    city: "Goiânia/GO",
    date: "2026-07-18",
    students: 28,
    expected: 39144,
    received: 17615,
    status: "Crítico",
    consultant: "Lucas Almeida",
  },
];

const students: Student[] = [
  {
    id: "ana",
    name: "Ana Paula Ribeiro",
    whatsapp: "(31) 99843-2210",
    course: "Operador de Máquinas Pesadas",
    city: "Belo Horizonte/MG",
    classDate: "2026-08-15",
    total: 2397,
    paid: 1200,
    status: "Plano ativo",
    risk: 34,
    nextAction: "Enviar segunda parcela do plano sugerido",
    promise: "Prometeu pagar R$ 300 amanhã",
  },
  {
    id: "joao",
    name: "João Batista Martins",
    whatsapp: "(62) 99120-0081",
    course: "NR Segurança no Trabalho",
    city: "Goiânia/GO",
    classDate: "2026-07-18",
    total: 1398,
    paid: 200,
    status: "Atrasado crítico",
    risk: 88,
    nextAction: "Ligar agora e renegociar entrada",
    promise: "Promessa quebrada há 2 dias",
  },
  {
    id: "priscila",
    name: "Priscila Moraes",
    whatsapp: "(66) 98441-5542",
    course: "Operador de Colheitadeira",
    city: "Querência/MT",
    classDate: "2026-07-25",
    total: 2397,
    paid: 0,
    status: "Risco de desistência",
    risk: 92,
    nextAction: "Encaminhar para financeiro",
    promise: "Não respondeu WhatsApp",
  },
  {
    id: "carlos",
    name: "Carlos Henrique Lima",
    whatsapp: "(66) 99904-7122",
    course: "Inseminação Artificial em Bovinos",
    city: "Juína/MT",
    classDate: "2026-08-02",
    total: 2397,
    paid: 2397,
    status: "Quitado",
    risk: 8,
    nextAction: "Enviar confirmação pré-turma",
    promise: "Pagamento confirmado",
  },
  {
    id: "marta",
    name: "Marta Fernanda Souza",
    whatsapp: "(31) 98720-1011",
    course: "Operador de Máquinas Pesadas",
    city: "Belo Horizonte/MG",
    classDate: "2026-08-15",
    total: 2397,
    paid: 700,
    status: "Em dia",
    risk: 28,
    nextAction: "Lembrete amigável em 48h",
    promise: "Plano em andamento",
  },
  {
    id: "edson",
    name: "Edson Pereira Alves",
    whatsapp: "(62) 98554-9021",
    course: "NR Segurança no Trabalho",
    city: "Goiânia/GO",
    classDate: "2026-07-18",
    total: 1398,
    paid: 650,
    status: "Atrasado leve",
    risk: 61,
    nextAction: "Enviar vencimento de hoje",
    promise: "Atendeu ligação e pediu retorno",
  },
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

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function percent(received: number, expected: number) {
  return Math.round((received / expected) * 100);
}

function daysUntil(date: string) {
  const now = new Date("2026-07-09T12:00:00");
  return Math.ceil((new Date(`${date}T12:00:00`).getTime() - now.getTime()) / 86400000);
}

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedClass, setSelectedClass] = useState<ClassRecord>(classes[0]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(students[0]);

  const totals = useMemo(() => {
    const expected = classes.reduce((sum, item) => sum + item.expected, 0);
    const received = classes.reduce((sum, item) => sum + item.received, 0);
    const paidStudents = students.filter((student) => student.status === "Quitado").length;
    return {
      expected,
      received,
      open: expected - received,
      anticipated: percent(received, expected),
      paidStudents,
      onTime: students.filter((student) => ["Em dia", "Plano ativo", "Entrada paga"].includes(student.status)).length,
      late: students.filter((student) => student.status.includes("Atrasado")).length,
      risk: students.filter((student) => student.risk >= 70).length,
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src={starLogo} alt="Star Profissões" className="brand-logo" />
        <nav className="menu">
          <MenuButton icon={LayoutDashboard} label="Dashboard" active={page === "dashboard"} onClick={() => setPage("dashboard")} />
          <MenuButton icon={CalendarClock} label="Turmas" active={page === "turmas"} onClick={() => setPage("turmas")} />
          <MenuButton icon={Users} label="Alunos e recebíveis" active={page === "alunos"} onClick={() => setPage("alunos")} />
          <MenuButton icon={PhoneCall} label="Cobrança inteligente" active={page === "cobranca"} onClick={() => setPage("cobranca")} />
          <MenuButton icon={MessageCircle} label="WhatsApp" active={page === "whatsapp"} onClick={() => setPage("whatsapp")} />
          <MenuButton icon={Gauge} label="Score de risco" active={page === "score"} onClick={() => setPage("score")} />
          <MenuButton icon={FileBarChart} label="Relatórios" active={page === "relatorios"} onClick={() => setPage("relatorios")} />
        </nav>
        <div className="side-card">
          <Sparkles size={18} />
          <strong>Star Financeiro</strong>
          <span>Transforme matrículas em caixa antes da turma acontecer.</span>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Sistema mockado de antecipação de recebíveis</p>
            <h1>{titleForPage(page)}</h1>
          </div>
          <div className="top-actions">
            <div className="search"><Search size={17} /> Buscar turma, aluno ou cidade</div>
            <button className="icon-button" aria-label="Notificações"><Bell size={19} /></button>
          </div>
        </header>

        {page === "dashboard" && <Dashboard totals={totals} />}
        {page === "turmas" && <ClassesPage selected={selectedClass} onSelect={setSelectedClass} />}
        {page === "alunos" && <StudentsPage selectedStudent={selectedStudent} onSelectStudent={setSelectedStudent} />}
        {page === "cobranca" && <CollectionPage />}
        {page === "whatsapp" && <WhatsappPage />}
        {page === "score" && <ScorePage />}
        {page === "relatorios" && <ReportsPage />}
      </main>

      {selectedStudent && page === "alunos" ? (
        <StudentDrawer student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      ) : null}
    </div>
  );
}

function MenuButton({ icon: Icon, label, active, onClick }: { icon: typeof LayoutDashboard; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`menu-button ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function Dashboard({ totals }: { totals: ReturnType<typeof AppTotalsPlaceholder> }) {
  const riskClasses = [...classes].sort((a, b) => percent(a.received, a.expected) - percent(b.received, b.expected)).slice(0, 3);
  return (
    <section className="page-grid">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">Estratégia financeira</p>
          <h2>A Star Profissões transforma matrículas em previsibilidade financeira antes da turma acontecer.</h2>
          <p>Monitore cada matrícula, antecipe recebíveis e priorize ações antes que o risco financeiro vire inadimplência.</p>
        </div>
        <div className="hero-kpi">
          <strong>{totals.anticipated}%</strong>
          <span>receita antecipada</span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={WalletCards} label="Receita prevista total" value={money.format(totals.expected)} detail="Turmas itinerantes ativas" />
        <Metric icon={Banknote} label="Receita já recebida" value={money.format(totals.received)} detail="Caixa confirmado" />
        <Metric icon={ReceiptText} label="Saldo em aberto" value={money.format(totals.open)} detail="Potencial para antecipar" />
        <Metric icon={TrendingUp} label="Percentual antecipado" value={`${totals.anticipated}%`} detail="Meta executiva: 70%" />
        <Metric icon={BadgeCheck} label="Alunos quitados" value={`${totals.paidStudents}`} detail="Sem risco financeiro" />
        <Metric icon={CheckCircle2} label="Alunos em dia" value={`${totals.onTime}`} detail="Plano dentro do combinado" />
        <Metric icon={Clock3} label="Alunos atrasados" value={`${totals.late}`} detail="Precisam de ação leve" />
        <Metric icon={ShieldAlert} label="Alunos em risco" value={`${totals.risk}`} detail="Prioridade do financeiro" />
      </div>

      <div className="three-cols">
        <Card title="Previsão de caixa">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={cashFlow}>
              <defs>
                <linearGradient id="orange" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#F4B728" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="#F4B728" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip formatter={(value) => money.format(Number(value))} />
              <Area dataKey="previsto" stroke="#224C99" fill="transparent" strokeWidth={2} />
              <Area dataKey="recebido" stroke="#F4B728" fill="url(#orange)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Evolução até a turma">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={receivingEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => `${value}% recebido`} />
              <Line dataKey="recebido" stroke="#F4B728" strokeWidth={3} dot={{ fill: "#224C99", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Metas de antecipação">
          <Goal label="D-15" value={40} />
          <Goal label="D-7" value={70} />
          <Goal label="D-2" value={90} />
          <div className="insight-box">Fila de ações: priorize alunos com turma próxima, saldo alto e promessa quebrada.</div>
        </Card>
      </div>

      <div className="two-cols">
        <Card title="Turmas com maior risco financeiro">
          {riskClasses.map((item) => <ClassRisk key={item.id} item={item} />)}
        </Card>
        <Card title="Fila de ações prioritárias">
          {students.filter((student) => student.risk >= 60).map((student) => (
            <ActionRow key={student.id} title={student.name} subtitle={`${student.city} · ${money.format(student.total - student.paid)} em aberto`} action={student.nextAction} />
          ))}
        </Card>
      </div>
    </section>
  );
}

function AppTotalsPlaceholder() {
  return { expected: 0, received: 0, open: 0, anticipated: 0, paidStudents: 0, onTime: 0, late: 0, risk: 0 };
}

function ClassesPage({ selected, onSelect }: { selected: ClassRecord; onSelect: (item: ClassRecord) => void }) {
  const classStudents = students.filter((student) => student.city === selected.city || student.course === selected.course);
  return (
    <section className="page-grid">
      <Card title="Turmas itinerantes">
        <div className="table">
          <div className="table-row table-head">
            <span>Curso</span><span>Cidade</span><span>Data</span><span>Alunos</span><span>Previsto</span><span>Recebido</span><span>Antecipado</span><span>Status</span>
          </div>
          {classes.map((item) => (
            <button className="table-row clickable" key={item.id} onClick={() => onSelect(item)}>
              <span><strong>{item.course}</strong></span>
              <span>{item.city}</span>
              <span>{formatDate(item.date)}</span>
              <span>{item.students}</span>
              <span>{money.format(item.expected)}</span>
              <span>{money.format(item.received)}</span>
              <span>{percent(item.received, item.expected)}%</span>
              <span><StatusBadge status={item.status} /></span>
            </button>
          ))}
        </div>
      </Card>

      <div className="detail-panel">
        <Card title={`Detalhe da turma · ${selected.city}`}>
          <div className="class-summary">
            <div><span>Receita prevista</span><strong>{money.format(selected.expected)}</strong></div>
            <div><span>Receita recebida</span><strong>{money.format(selected.received)}</strong></div>
            <div><span>Saldo aberto</span><strong>{money.format(selected.expected - selected.received)}</strong></div>
            <div><span>Dias para turma</span><strong>{daysUntil(selected.date)}</strong></div>
          </div>
          <Progress value={percent(selected.received, selected.expected)} label={`Esta turma já antecipou ${percent(selected.received, selected.expected)}% do faturamento antes da data do curso.`} />
          <h3>Alunos da turma</h3>
          {classStudents.map((student) => (
            <StudentMini key={student.id} student={student} />
          ))}
        </Card>
      </div>
    </section>
  );
}

function StudentsPage({ selectedStudent, onSelectStudent }: { selectedStudent: Student | null; onSelectStudent: (student: Student) => void }) {
  return (
    <section className="page-grid">
      <Card title="Alunos e recebíveis">
        <div className="filters"><span>Todos os status</span><span>Próximos 30 dias</span><span>Saldo em aberto</span></div>
        <div className="table students-table">
          <div className="table-row table-head">
            <span>Nome</span><span>WhatsApp</span><span>Curso</span><span>Cidade</span><span>Turma</span><span>Total</span><span>Pago</span><span>Saldo</span><span>%</span><span>Status</span><span>Score</span>
          </div>
          {students.map((student) => {
            const open = student.total - student.paid;
            return (
              <button className={`table-row clickable ${selectedStudent?.id === student.id ? "selected" : ""}`} key={student.id} onClick={() => onSelectStudent(student)}>
                <span><strong>{student.name}</strong></span>
                <span>{student.whatsapp}</span>
                <span>{student.course}</span>
                <span>{student.city}</span>
                <span>{formatDate(student.classDate)}</span>
                <span>{money.format(student.total)}</span>
                <span>{money.format(student.paid)}</span>
                <span>{money.format(open)}</span>
                <span>{percent(student.paid, student.total)}%</span>
                <span><StudentStatusBadge status={student.status} /></span>
                <span><RiskPill value={student.risk} /></span>
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

function CollectionPage() {
  const columns = [
    "Lembrete automático",
    "Atraso leve",
    "Atraso crítico",
    "Ligar agora",
    "Promessa quebrada",
    "Resolvido",
  ];
  return (
    <section className="kanban">
      {columns.map((column, index) => (
        <div className="kanban-column" key={column}>
          <h3>{column}</h3>
          {students.filter((_, studentIndex) => studentIndex % columns.length === index || (index === 3 && students[studentIndex].risk > 80)).map((student) => (
            <div className="lead-card" key={`${column}-${student.id}`}>
              <strong>{student.name}</strong>
              <span>{student.course}</span>
              <span><MapPin size={14} /> {student.city}</span>
              <div className="lead-card-footer">
                <b>{money.format(student.total - student.paid)}</b>
                <RiskPill value={student.risk} />
              </div>
              <small>{daysUntil(student.classDate)} dias para a turma · {student.nextAction}</small>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function WhatsappPage() {
  const messages = [
    ["Boas-vindas", "Oi, João! Seja bem-vindo à Star Profissões. Sua matrícula foi registrada com sucesso. Vou te ajudar a se organizar para chegar no dia da turma com sua vaga garantida e seu pagamento tranquilo."],
    ["Plano sugerido", "Para facilitar, posso dividir seu saldo em parcelas menores antes da turma. Assim você chega no curso com tudo organizado e sem pressão no final de semana."],
    ["Vencimento hoje", "Passando para lembrar que hoje é o melhor dia para avançar no seu plano Star Financeiro. Posso te enviar o link de pagamento agora?"],
    ["Pré-turma", "Sua turma está chegando. Vamos deixar sua confirmação financeira pronta para você aproveitar o curso com tranquilidade."],
  ];
  return (
    <section className="page-grid">
      <Card title="Régua automática de WhatsApp">
        <div className="message-grid">
          {["Boas-vindas", "Plano sugerido", "Lembrete leve", "Vencimento hoje", "Atraso leve", "Atraso crítico", "Pré-turma", "Confirmação de pagamento", "Encaminhamento humano"].map((item, index) => (
            <div className="message-step" key={item}><span>{index + 1}</span>{item}</div>
          ))}
        </div>
      </Card>
      <Card title="Exemplos de mensagens">
        {messages.map(([title, text]) => (
          <div className="whatsapp-bubble" key={title}>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        ))}
      </Card>
    </section>
  );
}

function ScorePage() {
  const rules = [
    ["Não pagou entrada", "+30"],
    ["Não respondeu WhatsApp", "+20"],
    ["Atrasou parcela", "+20"],
    ["Turma em menos de 7 dias", "+30"],
    ["Saldo acima de 50% em aberto", "+25"],
    ["Quebrou promessa", "+35"],
    ["Pagou parte do valor", "-20"],
    ["Confirmou presença", "-10"],
  ];
  return (
    <section className="two-cols">
      <Card title="Como o score de risco é calculado">
        {rules.map(([label, points]) => (
          <div className="score-rule" key={label}><span>{label}</span><strong>{points}</strong></div>
        ))}
      </Card>
      <Card title="Classificação visual">
        <div className="risk-level low">Baixo risco · 0 a 30</div>
        <div className="risk-level medium">Médio risco · 31 a 60</div>
        <div className="risk-level high">Alto risco · 61 a 80</div>
        <div className="risk-level critical">Crítico · 81 a 100</div>
        <div className="insight-box">O score combina comportamento do aluno, proximidade da turma e saldo em aberto para ordenar a cobrança inteligente.</div>
      </Card>
    </section>
  );
}

function ReportsPage() {
  const byCity = classes.map((item) => ({ city: item.city.split("/")[0], recebido: item.received, aberto: item.expected - item.received }));
  const pie = [
    { name: "Recebido", value: 137413, color: "#F4B728" },
    { name: "Em aberto", value: 79002, color: "#224C99" },
  ];
  return (
    <section className="page-grid">
      <div className="two-cols">
        <Card title="Recebimento por cidade">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byCity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3" />
              <XAxis dataKey="city" tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip formatter={(value) => money.format(Number(value))} />
              <Bar dataKey="recebido" fill="#F4B728" radius={[8, 8, 0, 0]} />
              <Bar dataKey="aberto" fill="#224C99" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Previsão de caixa">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pie} dataKey="value" innerRadius={70} outerRadius={100} paddingAngle={4}>
                {pie.map((item) => <Cell key={item.name} fill={item.color} />)}
              </Pie>
              <Tooltip formatter={(value) => money.format(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="report-grid">
        {["Recebimento por curso", "Recebimento por consultor", "Turmas com maior antecipação", "Turmas com maior risco", "Inadimplência por período"].map((item) => (
          <div className="report-card" key={item}>
            <FileBarChart size={20} />
            <strong>{item}</strong>
            <span>Relatório executivo mockado pronto para apresentação.</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudentDrawer({ student, onClose }: { student: Student; onClose: () => void }) {
  const open = student.total - student.paid;
  return (
    <aside className="drawer">
      <button className="close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      <p className="eyebrow">Plano Automático de Antecipação</p>
      <h2>{student.name}</h2>
      <p>{student.course} · {student.city}</p>
      <div className="drawer-grid">
        <div><span>Valor do curso</span><strong>{money.format(student.total)}</strong></div>
        <div><span>Valor já pago</span><strong>{money.format(student.paid)}</strong></div>
        <div><span>Saldo restante</span><strong>{money.format(open)}</strong></div>
        <div><span>Dias restantes</span><strong>{daysUntil(student.classDate)}</strong></div>
      </div>
      <Progress value={80} label="Meta: chegar com 80% pago antes da turma." />
      <div className="plan-box">
        <strong>Plano sugerido</strong>
        {[0, 7, 14, 25].map((days, index) => (
          <span key={days}>R$ {Math.ceil(open / 4).toLocaleString("pt-BR")} {index === 0 ? "hoje" : `em ${days} dias`}</span>
        ))}
      </div>
      <div className="button-grid">
        <button><Send size={16} /> Enviar link</button>
        <button><CreditCard size={16} /> Registrar pagamento</button>
        <button><ReceiptText size={16} /> Registrar promessa</button>
        <button><MessageCircle size={16} /> Enviar WhatsApp</button>
        <button><PhoneCall size={16} /> Ligar agora</button>
        <button><ArrowUpRight size={16} /> Financeiro</button>
      </div>
      <Card title="Histórico">
        <ActionRow title="Pagamento recebido" subtitle={money.format(student.paid)} action="há 4 dias" />
        <ActionRow title="Mensagem enviada" subtitle={student.promise} action="ontem" />
      </Card>
    </aside>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof WalletCards; label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <div className="metric-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

function Progress({ value, label }: { value: number; label: string }) {
  return <div className="progress-block"><div className="progress"><span style={{ width: `${value}%` }} /></div><p>{label}</p></div>;
}

function Goal({ label, value }: { label: string; value: number }) {
  return <div className="goal"><strong>{label}: {value}% recebido</strong><Progress value={value} label="" /></div>;
}

function ClassRisk({ item }: { item: ClassRecord }) {
  return <div className="class-risk"><div><strong>{item.course}</strong><span>{item.city}</span></div><StatusBadge status={item.status} /><b>{percent(item.received, item.expected)}%</b></div>;
}

function ActionRow({ title, subtitle, action }: { title: string; subtitle: string; action: string }) {
  return <div className="action-row"><div><strong>{title}</strong><span>{subtitle}</span></div><small>{action}</small></div>;
}

function StudentMini({ student }: { student: Student }) {
  return <div className="student-mini"><div><strong>{student.name}</strong><span>{percent(student.paid, student.total)}% pago · {money.format(student.total - student.paid)} em aberto</span></div><span>{student.nextAction}</span></div>;
}

function StatusBadge({ status }: { status: ClassStatus }) {
  return <span className={`status ${status.toLowerCase().replace("á", "a").replace("í", "i")}`}>{status}</span>;
}

function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return <span className="student-status">{status}</span>;
}

function RiskPill({ value }: { value: number }) {
  const level = value >= 81 ? "critical" : value >= 61 ? "high" : value >= 31 ? "medium" : "low";
  return <span className={`risk-pill ${level}`}>{value}</span>;
}

function titleForPage(page: Page) {
  const titles = {
    dashboard: "Dashboard Executivo",
    turmas: "Turmas",
    alunos: "Alunos e Recebíveis",
    cobranca: "Cobrança Inteligente",
    whatsapp: "Mensageria WhatsApp",
    score: "Score de Risco",
    relatorios: "Relatórios",
  };
  return titles[page];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export default App;
