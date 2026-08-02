import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { LeadRecord } from "@/lib/commercial-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LeadsResponse = { leads: Array<LeadRecord>; error?: string };

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Star Profissões" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const [leads, setLeads] = React.useState<Array<LeadRecord>>([]);
  const [students, setStudents] = React.useState<Array<LeadRecord>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!activeUnitId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetch(`/api/crm/leads?unitId=${encodeURIComponent(activeUnitId)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }),
      fetch(`/api/crm/leads?unitId=${encodeURIComponent(activeUnitId)}&view=students`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }),
    ])
      .then(async ([leadResponse, studentResponse]) => {
        const leadData = (await leadResponse.json().catch(() => ({}))) as LeadsResponse;
        const studentData = (await studentResponse.json().catch(() => ({}))) as LeadsResponse;
        if (!leadResponse.ok) throw new Error(leadData.error ?? "Falha ao carregar o dashboard.");
        setLeads(leadData.leads);
        setStudents(studentResponse.ok ? studentData.leads : []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLeads([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [activeUnitId]);

  const qualified = leads.filter((lead) =>
    ["Qualificado", "Proposta", "Pagamento pendente", "Confirmado", "Matriculado"].includes(
      lead.stage,
    ),
  );
  const pipelineValue = leads.reduce((sum, lead) => sum + (lead.courseValue ?? 0), 0);
  const totalOpportunities = leads.length + students.length;
  const conversion = totalOpportunities
    ? Math.round((students.length / totalOpportunities) * 100)
    : 0;
  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const stageCounts = [
    "Novo lead",
    "Em contato",
    "Qualificado",
    "Proposta",
    "Pagamento pendente",
    "Recuperação",
  ].map((stage) => ({ stage, count: leads.filter((lead) => lead.stage === stage).length }));
  const maxStageCount = Math.max(1, ...stageCounts.map((item) => item.count));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[30px] bg-[#16006C] p-6 text-white shadow-[0_30px_80px_-48px_rgba(22,0,108,0.9)] md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute right-8 top-8 h-40 w-40 rounded-full bg-[#377DFE]/20 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F4B728]">
              <Sparkles className="h-4 w-4" /> Pulso da operação
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-5xl">
              Olá, {session?.user.name?.split(" ")[0] ?? "time Star"}.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
              Uma leitura rápida da unidade {session?.activeUnit?.name ?? "ativa"}, das
              oportunidades abertas e das matrículas conquistadas.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                asChild
                className="h-11 bg-[#F4B728] font-bold text-[#07154C] hover:bg-[#F4B728]/90"
              >
                <Link to="/crm">
                  Abrir operação <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Badge className="h-11 border-white/15 bg-white/10 px-4 text-white hover:bg-white/10">
                <Activity className="mr-2 h-4 w-4 text-emerald-300" /> Dados em tempo real
              </Badge>
            </div>
          </div>
          <div className="rounded-3xl border border-white/12 bg-white/[0.07] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                  Conversão
                </div>
                <div className="mt-2 text-5xl font-black text-[#F4B728]">
                  {loading ? "—" : `${conversion}%`}
                </div>
              </div>
              <ArrowUpRight className="h-9 w-9 text-[#F4B728]/60" />
            </div>
            <p className="mt-3 text-xs leading-5 text-white/50">
              Relação entre oportunidades recebidas e alunos matriculados.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Oportunidades abertas",
            value: leads.length,
            icon: Users,
            color: "bg-[#377DFE]",
          },
          {
            label: "Em avanço comercial",
            value: qualified.length,
            icon: Target,
            color: "bg-[#16006C]",
          },
          {
            label: "Alunos matriculados",
            value: students.length,
            icon: GraduationCap,
            color: "bg-emerald-500",
          },
          {
            label: "Potencial do pipeline",
            value: pipelineValue.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            }),
            icon: CircleDollarSign,
            color: "bg-[#F4B728]",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="overflow-hidden border-[#16006C]/10 shadow-card">
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-2xl font-black text-[#07154C]">
                  {loading ? "—" : value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <Card className="overflow-hidden border-[#16006C]/10 shadow-card">
          <div className="flex items-center justify-between border-b border-[#16006C]/10 p-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#224C99]">
                Distribuição
              </div>
              <h2 className="mt-1 text-xl font-black text-[#07154C]">Temperatura do funil</h2>
            </div>
            <Badge variant="secondary">{leads.length} leads</Badge>
          </div>
          <CardContent className="space-y-4 p-5">
            {stageCounts.map((item, index) => (
              <div
                key={item.stage}
                className="grid grid-cols-[130px_minmax(0,1fr)_32px] items-center gap-3"
              >
                <span className="truncate text-xs font-semibold text-[#07154C]">{item.stage}</span>
                <div className="h-3 overflow-hidden rounded-full bg-[#F1F3F8]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#16006C] to-[#377DFE]"
                    style={{
                      width: `${Math.max(item.count ? 8 : 0, (item.count / maxStageCount) * 100)}%`,
                      opacity: 1 - index * 0.08,
                    }}
                  />
                </div>
                <strong className="text-right text-xs text-[#16006C]">{item.count}</strong>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-[#16006C]/10 shadow-card">
          <div className="flex items-center justify-between border-b border-[#16006C]/10 p-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#224C99]">
                Agora
              </div>
              <h2 className="mt-1 text-xl font-black text-[#07154C]">Últimas oportunidades</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/crm">
                Ver todas <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <CardContent className="p-3">
            {recentLeads.length ? (
              recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-[#F7F8FC]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#16006C] text-xs font-black text-white">
                    {lead.fullName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#07154C]">{lead.fullName}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {lead.courseName ?? lead.phone}
                    </div>
                  </div>
                  <Badge variant="secondary" className="max-w-28 truncate">
                    {lead.stage}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {loading ? "Carregando dados..." : "Nenhuma oportunidade nesta unidade."}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
