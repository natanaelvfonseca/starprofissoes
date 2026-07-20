import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CircleDollarSign, GraduationCap, Target, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { LeadRecord } from "@/lib/commercial-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/layout/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LeadsResponse = { leads: Array<LeadRecord>; error?: string };

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Star Profissões" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const [leads, setLeads] = React.useState<Array<LeadRecord>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!activeUnitId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/crm/leads?unitId=${encodeURIComponent(activeUnitId)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as LeadsResponse;
        if (!response.ok) throw new Error(data.error ?? "Falha ao carregar o dashboard.");
        setLeads(data.leads);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLeads([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [activeUnitId]);

  const matriculated = leads.filter((lead) => lead.stage === "Matriculado");
  const qualified = leads.filter((lead) =>
    ["Qualificado", "Proposta", "Pagamento pendente", "Confirmado", "Matriculado"].includes(
      lead.stage,
    ),
  );
  const pipelineValue = leads.reduce((sum, lead) => sum + (lead.courseValue ?? 0), 0);
  const conversion = leads.length ? Math.round((matriculated.length / leads.length) * 100) : 0;
  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visão geral"
        title={`Bem-vindo à Star Profissões${session?.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}`}
        description={`Indicadores reais da unidade ${session?.activeUnit?.name ?? "ativa"}.`}
        actions={
          <Button asChild className="bg-gradient-primary">
            <Link to="/crm">
              Abrir CRM <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads" value={loading ? "..." : leads.length} icon={Users} hint="Na unidade ativa" />
        <StatCard label="Qualificados" value={loading ? "..." : qualified.length} icon={Target} accent="gold" hint="Em avanço comercial" />
        <StatCard label="Alunos" value={loading ? "..." : matriculated.length} icon={GraduationCap} accent="success" hint="Matrículas concluídas" />
        <StatCard label="Conversão" value={loading ? "..." : `${conversion}%`} icon={CircleDollarSign} accent="warning" hint={`Pipeline: ${pipelineValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`} />
      </section>

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Leads recentes</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/crm">Ver kanban <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentLeads.length ? (
            <div className="divide-y">
              {recentLeads.map((lead) => (
                <div key={lead.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{lead.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[lead.courseName, lead.city, lead.createdByName].filter(Boolean).join(" · ") || lead.phone}
                    </div>
                  </div>
                  <Badge variant="secondary" className="w-fit">{lead.stage}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {loading ? "Carregando dados..." : "Nenhum lead cadastrado nesta unidade."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
