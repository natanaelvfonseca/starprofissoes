import { useMemo, useState } from "react";
import {
  BarChart3, Bell, Bot, CalendarCheck, Check, ChevronRight, CircleDollarSign, Gauge,
  GraduationCap, MapPin, Megaphone, MessageCircle, MessageSquareText, Phone, Play,
  Search, Send, Sparkles, Target, TrendingUp, UserCheck, Users, WandSparkles,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import starLogo from "./assets/star-profissoes-logo.png";

type Page = "dashboard" | "pipeline" | "conversas" | "alunos" | "ia" | "relatorios" | "campanhas";
type Stage = "Novo lead" | "Em contato" | "Qualificado" | "Proposta";
type Lead = { id: number; name: string; phone: string; city: string; course: string; owner: string; stage: Stage; age: string };

const initialLeads: Lead[] = [
  { id: 1, name: "Camila Ferreira", phone: "(31) 99842-1180", city: "Belo Horizonte/MG", course: "Gestão de Projetos", owner: "Mariana Costa", stage: "Novo lead", age: "há 8 min" },
  { id: 2, name: "Rafael Moreira", phone: "(11) 99104-3382", city: "São Paulo/SP", course: "Liderança Estratégica", owner: "Lucas Almeida", stage: "Novo lead", age: "há 21 min" },
  { id: 3, name: "Ana Luiza Campos", phone: "(62) 98551-0092", city: "Goiânia/GO", course: "Vendas Consultivas", owner: "Bianca Rocha", stage: "Em contato", age: "há 1h" },
  { id: 4, name: "Daniel Ribeiro", phone: "(41) 99772-6051", city: "Curitiba/PR", course: "Gestão Financeira", owner: "Mariana Costa", stage: "Em contato", age: "há 2h" },
  { id: 5, name: "Juliana Nascimento", phone: "(21) 99220-7744", city: "Rio de Janeiro/RJ", course: "Liderança Estratégica", owner: "Lucas Almeida", stage: "Qualificado", age: "há 4h" },
  { id: 6, name: "Bruno Henrique", phone: "(19) 98410-3211", city: "Campinas/SP", course: "Vendas Consultivas", owner: "Bianca Rocha", stage: "Proposta", age: "há 6h" },
  { id: 7, name: "Patrícia Gomes", phone: "(31) 98872-8801", city: "Belo Horizonte/MG", course: "Gestão de Projetos", owner: "Mariana Costa", stage: "Proposta", age: "há 1d" },
];
const stages: Stage[] = ["Novo lead", "Em contato", "Qualificado", "Proposta"];
const evolution = [
  { day: "Seg", leads: 18, matriculas: 4 }, { day: "Ter", leads: 27, matriculas: 7 },
  { day: "Qua", leads: 22, matriculas: 6 }, { day: "Qui", leads: 35, matriculas: 11 },
  { day: "Sex", leads: 31, matriculas: 9 }, { day: "Sáb", leads: 16, matriculas: 5 },
];
const conversations = [
  { name: "Camila Ferreira", preview: "Qual o valor da próxima turma?", time: "10:42", unread: 2, status: "online" },
  { name: "Rafael Moreira", preview: "Pode me enviar as formas de pagamento?", time: "10:18", unread: 0, status: "online" },
  { name: "Ana Luiza Campos", preview: "Vou confirmar ainda hoje.", time: "09:57", unread: 1, status: "offline" },
  { name: "Daniel Ribeiro", preview: "Obrigado pelo atendimento!", time: "Ontem", unread: 0, status: "offline" },
];
const reportCourses = [
  { name: "Gestão de Projetos", leads: 42, sales: 11 }, { name: "Liderança", leads: 35, sales: 9 },
  { name: "Vendas", leads: 28, sales: 7 }, { name: "Financeiro", leads: 21, sales: 4 },
];
const campaignData = [
  { name: "Liderança | SP", channel: "Meta Ads", spend: 4280, leads: 214, cpl: 20, quality: 82, status: "Escalar" },
  { name: "Projetos | BH", channel: "Meta Ads", spend: 3650, leads: 152, cpl: 24, quality: 76, status: "Manter" },
  { name: "Vendas | Goiânia", channel: "Google Ads", spend: 2890, leads: 89, cpl: 32, quality: 61, status: "Otimizar" },
  { name: "Financeiro | Curitiba", channel: "Meta Ads", spend: 1980, leads: 48, cpl: 41, quality: 49, status: "Revisar" },
];
const students = [
  { name: "Fernanda Alves", course: "Gestão de Projetos", city: "Belo Horizonte/MG", date: "24/08/2026", payment: "Confirmado", confirmation: "Confirmado" },
  { name: "Carlos Eduardo", course: "Gestão de Projetos", city: "Belo Horizonte/MG", date: "24/08/2026", payment: "Confirmado", confirmation: "Aguardando" },
  { name: "Marina Souza", course: "Liderança Estratégica", city: "São Paulo/SP", date: "30/08/2026", payment: "Pendente", confirmation: "Aguardando" },
  { name: "João Victor Lima", course: "Vendas Consultivas", city: "Goiânia/GO", date: "06/09/2026", payment: "Confirmado", confirmation: "Confirmado" },
];

const pageInfo: Record<Page, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "Visão executiva", title: "Dashboard comercial", description: "Indicadores de aquisição, atendimento e conversão." },
  pipeline: { eyebrow: "Gestão comercial", title: "Pipeline de leads", description: "Visão completa dos leads, responsáveis e oportunidades." },
  conversas: { eyebrow: "Atendimento", title: "Conversas", description: "Central demonstrativa de atendimento por WhatsApp." },
  alunos: { eyebrow: "Operação acadêmica", title: "Alunos e confirmação", description: "Controle de presença e confirmação das próximas turmas." },
  ia: { eyebrow: "Inteligência comercial", title: "IA Comercial", description: "Análises, scripts e oportunidades identificadas pela IA." },
  relatorios: { eyebrow: "Business Intelligence", title: "Relatórios", description: "Leitura consolidada da operação comercial." },
  campanhas: { eyebrow: "Marketing e aquisição", title: "Analisador de campanhas", description: "Performance, qualidade e recomendações para seus anúncios." },
};

export default function CrmApp() {
  const [page, setPage] = useState<Page>("pipeline");
  const [leads, setLeads] = useState(initialLeads);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [activeConversation, setActiveConversation] = useState(conversations[0]);
  const [confirmed, setConfirmed] = useState(() => new Set(students.filter((item) => item.confirmation === "Confirmado").map((item) => item.name)));
  const visible = useMemo(() => leads.filter((lead) => Object.values(lead).join(" ").toLowerCase().includes(search.toLowerCase())), [leads, search]);
  const info = pageInfo[page];

  function advance(lead: Lead) {
    const index = stages.indexOf(lead.stage);
    if (index >= stages.length - 1) return;
    const next = stages[index + 1];
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage: next } : item));
    setSelected((current) => current?.id === lead.id ? { ...current, stage: next } : current);
  }

  return <div className="crm-shell">
    <aside className="crm-sidebar">
      <img src={starLogo} alt="Star Profissões" className="brand-logo" /><div className="crm-product">COMERCIAL</div>
      <nav className="menu">
        <Nav icon={Gauge} label="Dashboard" active={page === "dashboard"} onClick={() => setPage("dashboard")} />
        <Nav icon={Users} label="Pipeline de leads" active={page === "pipeline"} onClick={() => setPage("pipeline")} />
        <Nav icon={MessageSquareText} label="Conversas" active={page === "conversas"} onClick={() => setPage("conversas")} />
        <Nav icon={GraduationCap} label="Alunos e turmas" active={page === "alunos"} onClick={() => setPage("alunos")} />
        <Nav icon={WandSparkles} label="IA Comercial" active={page === "ia"} onClick={() => setPage("ia")} />
        <Nav icon={BarChart3} label="Relatórios" active={page === "relatorios"} onClick={() => setPage("relatorios")} />
        <Nav icon={Megaphone} label="Campanhas" active={page === "campanhas"} onClick={() => setPage("campanhas")} />
      </nav>
      <div className="side-card"><Sparkles size={18}/><strong>Ambiente demonstrativo</strong><span>Dados fictícios preparados para apresentação.</span></div>
    </aside>
    <main className="crm-content">
      <header className="crm-topbar"><div><p className="eyebrow">{info.eyebrow}</p><h1>{info.title}</h1><p>{info.description}</p></div><div className="top-actions"><label className="search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." /></label><button className="icon-button"><Bell size={18}/></button></div></header>
      {page === "dashboard" && <Dashboard onOpenPipeline={() => setPage("pipeline")} />}
      {page === "pipeline" && <Pipeline leads={visible} onSelect={setSelected} />}
      {page === "conversas" && <Conversations active={activeConversation} onSelect={setActiveConversation} />}
      {page === "alunos" && <Students confirmed={confirmed} onToggle={(name) => setConfirmed((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; })} />}
      {page === "ia" && <CommercialAi />}
      {page === "relatorios" && <Reports />}
      {page === "campanhas" && <Campaigns />}
    </main>
    {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)} onAdvance={() => advance(selected)} />}
  </div>;
}

function Nav({ icon: Icon, label, active, onClick }: { icon: typeof Users; label: string; active: boolean; onClick: () => void }) {
  return <button className={`menu-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={18}/>{label}</button>;
}

function Dashboard({ onOpenPipeline }: { onOpenPipeline: () => void }) {
  return <div className="demo-page"><section className="crm-metrics"><CrmMetric icon={Users} label="Leads no período" value="149" detail="+18% vs. período anterior"/><CrmMetric icon={UserCheck} label="Qualificados" value="58" detail="38,9% dos leads"/><CrmMetric icon={CircleDollarSign} label="Pipeline estimado" value="R$ 184 mil" detail="42 oportunidades ativas"/><CrmMetric icon={Target} label="Conversão" value="16,8%" detail="Meta mensal: 18%"/></section><section className="crm-insights"><ChartPanel/><div className="ai-card"><Sparkles/><span>Insight da IA</span><strong>11 leads precisam de contato hoje</strong><p>Priorize propostas abertas há mais de 24 horas. Potencial estimado de R$ 28.400.</p><button onClick={onOpenPipeline}>Ver prioridades</button></div></section><section className="demo-grid three"><MiniPanel title="Origem dos leads" value="Meta Ads · 62%" detail="Google Ads · 24% | Orgânico · 14%"/><MiniPanel title="Tempo médio de resposta" value="8 min" detail="Meta da operação: até 10 min"/><MiniPanel title="Melhor consultor" value="Mariana Costa" detail="21,4% de conversão no período"/></section></div>;
}

function Pipeline({ leads, onSelect }: { leads: Lead[]; onSelect: (lead: Lead) => void }) {
  return <><section className="crm-metrics"><CrmMetric icon={Users} label="Leads no período" value="149" detail="+18% vs. período anterior"/><CrmMetric icon={UserCheck} label="Qualificados" value="58" detail="38,9% dos leads"/><CrmMetric icon={CircleDollarSign} label="Pipeline estimado" value="R$ 184 mil" detail="42 oportunidades ativas"/><CrmMetric icon={Target} label="Conversão" value="16,8%" detail="Meta mensal: 18%"/></section><section className="kanban">{stages.map((stage) => <div className="kanban-column" key={stage}><div className="kanban-title"><span>{stage}</span><b>{leads.filter((lead) => lead.stage === stage).length}</b></div><div className="lead-stack">{leads.filter((lead) => lead.stage === stage).map((lead) => <button className="lead-card" key={lead.id} onClick={() => onSelect(lead)}><div className="lead-card-head"><strong>{lead.name}</strong><small>{lead.age}</small></div><span><Phone size={14}/>{lead.phone}</span><span><MapPin size={14}/>{lead.city}</span><em>{lead.course}</em><footer><UserCheck size={14}/>{lead.owner}</footer></button>)}</div></div>)}</section></>;
}

function Conversations({ active, onSelect }: { active: typeof conversations[number]; onSelect: (item: typeof active) => void }) {
  return <section className="conversation-layout"><div className="conversation-list"><div className="panel-heading"><strong>Atendimentos</strong><span>4 conversas ativas</span></div>{conversations.map((item) => <button className={active.name === item.name ? "active" : ""} onClick={() => onSelect(item)} key={item.name}><Avatar name={item.name}/><div><strong>{item.name}</strong><span>{item.preview}</span></div><small>{item.time}</small>{item.unread ? <b>{item.unread}</b> : null}</button>)}</div><div className="chat-panel"><header><Avatar name={active.name}/><div><strong>{active.name}</strong><span><i className={active.status}/>{active.status === "online" ? "Online agora" : "Visto recentemente"}</span></div><button><Phone size={18}/></button></header><div className="chat-messages"><div className="message incoming">Olá! Gostaria de saber mais sobre a próxima turma.</div><div className="message outgoing">Oi, {active.name.split(" ")[0]}! Sou a assistente comercial da Star Profissões. Posso te ajudar com valores, datas e formas de pagamento.</div><div className="message incoming">{active.preview}</div><div className="message outgoing">Claro! A próxima turma tem vagas disponíveis e condições especiais até sexta-feira.</div></div><footer><input placeholder="Digite uma mensagem..."/><button><Send size={17}/></button></footer></div><aside className="contact-panel"><Avatar name={active.name}/><h3>{active.name}</h3><span>Lead em atendimento</span><div><small>Curso de interesse</small><strong>Gestão de Projetos</strong></div><div><small>Responsável</small><strong>Mariana Costa</strong></div><div><small>Etapa</small><strong>Em contato</strong></div><button>Ver lead no comercial</button></aside></section>;
}

function Students({ confirmed, onToggle }: { confirmed: Set<string>; onToggle: (name: string) => void }) {
  return <div className="demo-page"><section className="crm-metrics"><CrmMetric icon={GraduationCap} label="Alunos ativos" value="86" detail="4 próximas turmas"/><CrmMetric icon={CalendarCheck} label="Confirmados" value={`${confirmed.size}`} detail="Nesta demonstração"/><CrmMetric icon={MessageCircle} label="Aguardando retorno" value={`${students.length - confirmed.size}`} detail="Confirmação via WhatsApp"/><CrmMetric icon={CircleDollarSign} label="Pagamento confirmado" value="78%" detail="67 alunos em dia"/></section><section className="demo-panel"><div className="panel-heading row"><div><strong>Confirmação das próximas turmas</strong><span>Selecione o status para simular a confirmação do aluno</span></div><button className="soft-button"><Send size={15}/>Enviar lembrete em massa</button></div><div className="demo-table student-table"><div className="demo-row head"><span>Aluno</span><span>Curso / Cidade</span><span>Data da turma</span><span>Financeiro</span><span>Confirmação</span><span>Ação</span></div>{students.map((student) => { const isConfirmed = confirmed.has(student.name); return <div className="demo-row" key={student.name}><span><strong>{student.name}</strong></span><span><strong>{student.course}</strong><small>{student.city}</small></span><span>{student.date}</span><span><Status text={student.payment}/></span><span><Status text={isConfirmed ? "Confirmado" : "Aguardando"}/></span><span><button className={isConfirmed ? "confirm-button confirmed" : "confirm-button"} onClick={() => onToggle(student.name)}>{isConfirmed ? <><Check size={14}/>Confirmado</> : "Confirmar turma"}</button></span></div>})}</div></section></div>;
}

function CommercialAi() {
  return <div className="demo-page"><section className="ai-hero"><div><span><WandSparkles size={17}/>Copiloto comercial</span><h2>Transforme conversas em decisões de venda.</h2><p>A IA analisa atendimentos, identifica objeções e recomenda a próxima melhor ação para cada consultor.</p><button><Play size={16}/>Gerar análise demonstrativa</button></div><div className="ai-score"><small>Score comercial</small><strong>84</strong><span>Operação saudável</span></div></section><section className="demo-grid three"><MiniPanel title="Conversas analisadas" value="328" detail="Últimos 30 dias"/><MiniPanel title="Oportunidades detectadas" value="47" detail="R$ 112 mil em potencial"/><MiniPanel title="Objeção mais frequente" value="Preço" detail="31% das conversas"/></section><section className="ai-workspace"><div className="demo-panel"><div className="panel-heading"><strong>Ranking de conversas</strong><span>Qualidade de atendimento por consultor</span></div>{[["Mariana Costa",92,"Excelente condução e follow-up"],["Lucas Almeida",86,"Boa descoberta de necessidade"],["Bianca Rocha",78,"Pode reforçar fechamento"]].map(([name, score, detail]) => <div className="score-row" key={String(name)}><Avatar name={String(name)}/><div><strong>{name}</strong><span>{detail}</span></div><b>{score}</b></div>)}</div><div className="demo-panel"><div className="panel-heading"><strong>Scripts recomendados</strong><span>Sugestões geradas para o time</span></div><Script title="Contorno de objeção de preço" tag="Fechamento"/><Script title="Retomada de lead sem resposta" tag="Follow-up"/><Script title="Confirmação de interesse e urgência" tag="Qualificação"/></div></section><section className="demo-panel"><div className="panel-heading"><strong>Análise de atendimento</strong><span>Exemplo visual de uma conversa analisada pela IA</span></div><div className="analysis-card"><div><Avatar name="Camila Ferreira"/><strong>Camila Ferreira</strong><span>Atendimento por Mariana Costa</span></div><div><small>Sentimento</small><Status text="Positivo"/></div><div><small>Intenção de compra</small><strong>Alta · 87%</strong></div><div><small>Próxima ação</small><strong>Enviar condição de pagamento hoje</strong></div><button>Ver análise completa<ChevronRight size={15}/></button></div></section></div>;
}

function Reports() {
  const pie = [{ name: "Meta Ads", value: 62 }, { name: "Google", value: 24 }, { name: "Orgânico", value: 14 }];
  return <div className="demo-page"><section className="crm-metrics"><CrmMetric icon={Users} label="Leads" value="149" detail="No período selecionado"/><CrmMetric icon={TrendingUp} label="Crescimento" value="+18%" detail="Comparado ao período anterior"/><CrmMetric icon={CircleDollarSign} label="Receita convertida" value="R$ 96 mil" detail="31 novas matrículas"/><CrmMetric icon={Target} label="CAC médio" value="R$ 184" detail="-7% no período"/></section><section className="report-grid"><div className="demo-panel"><div className="panel-heading"><strong>Leads e matrículas</strong><span>Evolução semanal</span></div><ResponsiveContainer width="100%" height={260}><AreaChart data={evolution}><CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis hide/><Tooltip/><Area dataKey="leads" stroke="#F4B728" fill="#E7ECF3" strokeWidth={3}/><Area dataKey="matriculas" stroke="#377DFE" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></div><div className="demo-panel"><div className="panel-heading"><strong>Origem dos leads</strong><span>Distribuição por canal</span></div><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={pie} dataKey="value" innerRadius={55} outerRadius={82}>{pie.map((_, index) => <Cell key={index} fill={["#F4B728","#377DFE","#07154C"][index]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="legend">{pie.map((item, index) => <span key={item.name}><i style={{background:["#F4B728","#377DFE","#07154C"][index]}}/>{item.name} · {item.value}%</span>)}</div></div></section><section className="demo-panel"><div className="panel-heading"><strong>Conversão por curso</strong><span>Volume de leads e matrículas</span></div><ResponsiveContainer width="100%" height={250}><BarChart data={reportCourses} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3"/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="leads" fill="#ffd3ca" radius={5}/><Bar dataKey="sales" fill="#F4B728" radius={5}/></BarChart></ResponsiveContainer></section></div>;
}

function Campaigns() {
  return <div className="demo-page"><section className="crm-metrics"><CrmMetric icon={Megaphone} label="Investimento" value="R$ 12,8 mil" detail="4 campanhas ativas"/><CrmMetric icon={Users} label="Leads gerados" value="503" detail="CPL médio de R$ 25,45"/><CrmMetric icon={Target} label="Leads qualificados" value="71%" detail="+9 pontos no período"/><CrmMetric icon={TrendingUp} label="ROAS estimado" value="4,7x" detail="Receita atribuída: R$ 60 mil"/></section><section className="campaign-layout"><div className="demo-panel"><div className="panel-heading row"><div><strong>Análise de campanhas</strong><span>Recomendações fictícias baseadas em performance</span></div><button className="soft-button"><Sparkles size={15}/>Analisar campanhas</button></div><div className="campaign-list">{campaignData.map((campaign) => <div className="campaign-row" key={campaign.name}><div><strong>{campaign.name}</strong><span>{campaign.channel}</span></div><MetricPair label="Investimento" value={`R$ ${campaign.spend.toLocaleString("pt-BR")}`}/><MetricPair label="Leads" value={String(campaign.leads)}/><MetricPair label="CPL" value={`R$ ${campaign.cpl}`}/><MetricPair label="Qualidade" value={`${campaign.quality}%`}/><Status text={campaign.status}/></div>)}</div></div><aside className="campaign-chat"><header><div><Bot size={20}/></div><span><strong>Analista de Campanhas</strong><small>Chat demonstrativo</small></span></header><div className="campaign-chat-body"><div className="bot-message">Olá! Posso analisar suas campanhas e sugerir onde aumentar ou reduzir o orçamento.</div><div className="user-message">Qual campanha tem melhor potencial para escalar?</div><div className="bot-message"><strong>Liderança | SP</strong> apresenta o melhor equilíbrio entre CPL e qualidade. Minha sugestão seria aumentar o orçamento em 20% e acompanhar por 3 dias.</div><div className="chat-suggestions"><button>Onde reduzir investimento?</button><button>Compare Meta e Google</button><button>Mostre leads de qualidade</button></div></div><footer><input placeholder="Pergunte sobre suas campanhas..." disabled/><button disabled><Send size={16}/></button></footer><small className="demo-notice">Recurso visual — respostas pré-configuradas</small></aside></section></div>;
}

function ChartPanel() { return <div className="crm-chart"><div className="section-title"><div><span>Evolução comercial</span><small>Leads e matrículas da semana</small></div></div><ResponsiveContainer width="100%" height={190}><AreaChart data={evolution}><CartesianGrid strokeDasharray="3 3" stroke="#E7ECF3"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis hide/><Tooltip/><Area dataKey="leads" stroke="#F4B728" strokeWidth={3} fill="#E7ECF3"/><Area dataKey="matriculas" stroke="#377DFE" strokeWidth={2} fill="transparent"/></AreaChart></ResponsiveContainer></div>; }
function CrmMetric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) { return <div className="crm-metric"><div className="metric-icon"><Icon size={19}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function MiniPanel({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="mini-panel"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>; }
function Avatar({ name }: { name: string }) { return <div className="demo-avatar">{name.split(" ").slice(0,2).map((item) => item[0]).join("")}</div>; }
function Status({ text }: { text: string }) { return <span className={`demo-status ${text.toLowerCase().replaceAll(" ", "-")}`}>{text}</span>; }
function MetricPair({ label, value }: { label: string; value: string }) { return <div className="metric-pair"><small>{label}</small><strong>{value}</strong></div>; }
function Script({ title, tag }: { title: string; tag: string }) { return <button className="script-row"><div><strong>{title}</strong><span>{tag} · Gerado pela IA</span></div><ChevronRight size={17}/></button>; }
function LeadDrawer({ lead, onClose, onAdvance }: { lead: Lead; onClose: () => void; onAdvance: () => void }) { return <div className="crm-drawer-backdrop" onClick={onClose}><aside className="crm-drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={onClose}>×</button><p className="eyebrow">Detalhes do lead</p><h2>{lead.name}</h2><div className="drawer-data"><span>Telefone<strong>{lead.phone}</strong></span><span>Cidade<strong>{lead.city}</strong></span><span>Curso<strong>{lead.course}</strong></span><span>Responsável<strong>{lead.owner}</strong></span><span>Etapa<strong>{lead.stage}</strong></span></div><div className="drawer-note"><Sparkles size={17}/><div><strong>Próxima melhor ação</strong><p>Enviar mensagem personalizada e confirmar disponibilidade para a próxima turma.</p></div></div><button className="primary-action" onClick={onAdvance}>Avançar etapa</button></aside></div>; }
