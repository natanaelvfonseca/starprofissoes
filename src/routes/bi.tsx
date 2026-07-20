import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Clock3,
  DollarSign,
  GraduationCap,
  LineChart as LineChartIcon,
  Megaphone,
  MousePointer2,
  Phone,
  RadioTower,
  Signal,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
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
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/layout/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatPercent,
  GrowthDataBar,
  GrowthEmptyPanel,
  GrowthLoading,
  GrowthPeriodSelect,
  GrowthScopeSelect,
  metricValue,
} from "@/components/growth/GrowthDashboardPrimitives";
import { useAuth } from "@/lib/auth";
import { canViewNetworkGrowth } from "@/lib/auth-types";
import { useGrowthData } from "@/lib/use-growth-data";

const chartColors = ["#F4B728", "#377DFE", "#224C99", "#D99A10", "#16006C", "#EF4444", "#06B6D4", "#8B5CF6"];

const emptyMetrics = {
  leadsReceived: 0,
  qualifiedLeads: 0,
  enrollments: 0,
  conversionRate: 0,
  followUpRate: 0,
  averageTicket: 0,
  leadsWithSource: 0,
  sourceConversionRate: 0,
  activeChannels: 0,
  paidChannels: 0,
  revenue: 0,
  metaLeads: 0,
  campaignCount: 0,
  averageFirstContactHours: 0,
};

function formatDay(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export const Route = createFileRoute("/bi")({
  head: () => ({ meta: [{ title: "Relatórios | Star Profissões" }] }),
  component: BI,
});

function BI() {
  const { session, loading: authLoading } = useAuth();
  const [scopeValue, setScopeValue] = React.useState("");
  const [periodDays, setPeriodDays] = React.useState(30);
  const canViewNetwork = session ? canViewNetworkGrowth(session.user.role) : false;  const activeUnitId = session?.activeUnit?.id ?? "";

  React.useEffect(() => {
    if (!session) return;
    setScopeValue((current) => {
      if (!canViewNetwork) return activeUnitId;
      return current === "all" || session.units.some((unit) => unit.id === current) ? current : "all";
    });
  }, [activeUnitId, canViewNetwork, session]);

  const { data, loading } = useGrowthData(scopeValue, Boolean(session && scopeValue), periodDays);
  const isLoading = authLoading || loading;
  const metrics = data?.metrics ?? emptyMetrics;
  const courseMax = Math.max(...(data?.courses.map((item) => item.leads) ?? [0]), 0);
  const cityMax = Math.max(...(data?.cities.map((item) => item.leads) ?? [0]), 0);
  const campaignMax = Math.max(...(data?.campaigns.map((item) => item.leads) ?? [0]), 0);
  const sourceMax = Math.max(...(data?.sources.map((item) => item.leads) ?? [0]), 1);
  const sourcePie = data?.sources.map((item) => ({ name: item.source, value: item.leads })) ?? [];
  const funnelData = data?.funnel.filter((item) => item.leads > 0) ?? [];

  return (
    <div className="space-y-6">      <PageHeader
        eyebrow="Crescimento"
        title="Relatórios"
        description="Performance comercial, canais de aquisição, campanhas, conversão, receita e produtividade da equipe."
        actions={
          session ? (
            <div className="flex flex-wrap gap-2">
              <GrowthPeriodSelect value={periodDays} onValueChange={setPeriodDays} />
              <GrowthScopeSelect session={session} value={scopeValue} onValueChange={setScopeValue} />
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Leads" value={metricValue(isLoading, metrics.leadsReceived)} icon={Users} />
        <StatCard label="Qualificados" value={metricValue(isLoading, metrics.qualifiedLeads)} icon={UserCheck} />
        <StatCard label="Matrículas" value={metricValue(isLoading, metrics.enrollments)} icon={GraduationCap} accent="gold" />
        <StatCard label="Conversão" value={metricValue(isLoading, formatPercent(metrics.conversionRate))} icon={LineChartIcon} accent="success" />
        <StatCard label="Follow-up" value={metricValue(isLoading, formatPercent(metrics.followUpRate))} icon={Phone} />
        <StatCard label="1º contato" value={metricValue(isLoading, `${metrics.averageFirstContactHours.toFixed(1)}h`)} icon={Clock3} accent="warning" />
        <StatCard label="Ticket médio" value={metricValue(isLoading, formatCurrency(metrics.averageTicket))} icon={Target} />
        <StatCard label="Receita" value={metricValue(isLoading, formatCurrency(metrics.revenue))} icon={DollarSign} accent="gold" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
        <ChartCard title="Evolução comercial">
          {isLoading ? <GrowthLoading /> : data?.trend.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="commercialLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F4B728" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#F4B728" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={false} minTickGap={25} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                  <Tooltip labelFormatter={(value) => formatDay(String(value))} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="#F4B728" fill="url(#commercialLeads)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="enrollments" name="Matrículas" stroke="#377DFE" fill="transparent" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <GrowthEmptyPanel icon={Activity} title="Sem evolução no período" description="A série será preenchida com a entrada de novos leads." />}
        </ChartCard>

        <ChartCard title="Funil por etapa">
          {isLoading ? <GrowthLoading /> : funnelData.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ left: 6 }}>
                  <CartesianGrid horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="stage" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="leads" name="Leads" radius={[0, 5, 5, 0]}>
                    {funnelData.map((item) => <Cell key={item.stage} fill={item.stage === "Matriculado" ? "#377DFE" : "#F4B728"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <GrowthEmptyPanel icon={Activity} title="Funil vazio" description="Não há leads no período selecionado." />}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Performance por curso">
          {isLoading ? <GrowthLoading /> : data?.courses.length ? (
            <div className="space-y-4">
              {data.courses.map((course) => (
                <GrowthDataBar key={course.course} label={course.course} value={course.leads} max={courseMax} detail={`${course.enrollments} matrículas · ${formatPercent(course.conversionRate)}`} accent={course.enrollments ? "success" : "primary"} />
              ))}
            </div>
          ) : <GrowthEmptyPanel icon={GraduationCap} title="Sem cursos no período" description="Os cursos aparecerão conforme os leads forem roteados." />}
        </ChartCard>

        <ChartCard title="Conversão por cidade">
          {isLoading ? <GrowthLoading /> : data?.cities.length ? (
            <div className="space-y-4">
              {data.cities.map((city) => (
                <GrowthDataBar key={city.city} label={city.city} value={city.leads} max={cityMax} detail={`${city.enrollments} matrículas · ${formatPercent(city.conversionRate)}`} accent="success" />
              ))}
            </div>
          ) : <GrowthEmptyPanel icon={Target} title="Sem cidades no período" description="A análise geográfica depende da cidade registrada no lead." />}
        </ChartCard>
      </div>

      <ChartCard title={data?.scope.mode === "individual" ? "Minha produtividade" : "Performance dos consultores"}>
        {isLoading ? <GrowthLoading /> : data?.consultants.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[720px] space-y-2">
              <div className="grid grid-cols-[minmax(180px,1fr)_repeat(5,100px)] gap-3 border-b px-3 pb-2 text-xs font-semibold text-muted-foreground">
                <span>Consultor</span><span>Leads</span><span>Qualificados</span><span>Matrículas</span><span>Conversão</span><span>Follow-up</span>
              </div>
              {data.consultants.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(180px,1fr)_repeat(5,100px)] gap-3 rounded-md bg-muted/25 px-3 py-3 text-sm">
                  <span className="font-semibold">{item.name}</span>
                  <span>{item.leads}</span>
                  <span>{item.qualifiedLeads}</span>
                  <span>{item.enrollments}</span>
                  <span>{formatPercent(item.conversionRate)}</span>
                  <span>{formatPercent(item.followUpRate)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <GrowthEmptyPanel icon={Users} title="Sem produtividade calculada" description="Os consultores aparecerão quando receberem leads." />}
      </ChartCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Leads totais" value={metricValue(isLoading, metrics.leadsReceived)} icon={Users} />
        <StatCard label="Leads Meta" value={metricValue(isLoading, metrics.metaLeads)} icon={RadioTower} accent="primary" />
        <StatCard label="Campanhas" value={metricValue(isLoading, metrics.campaignCount)} icon={Megaphone} accent="gold" />
        <StatCard label="Com origem" value={metricValue(isLoading, metrics.leadsWithSource)} icon={MousePointer2} />
        <StatCard label="Conversão origem" value={metricValue(isLoading, formatPercent(metrics.sourceConversionRate))} icon={Signal} accent="success" />
        <StatCard label="Canais ativos" value={metricValue(isLoading, metrics.activeChannels)} icon={Target} />
        <StatCard label="Canais pagos" value={metricValue(isLoading, metrics.paidChannels)} icon={BarChart3} accent="gold" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]">
        <ChartCard title="Aquisição ao longo do tempo">
          {isLoading ? <GrowthLoading /> : data?.trend.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="marketingLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F4B728" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F4B728" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={false} minTickGap={25} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                  <Tooltip labelFormatter={(value) => formatDay(String(value))} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="#F4B728" fill="url(#marketingLeads)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="enrollments" name="Matrículas" stroke="#377DFE" fill="transparent" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <GrowthEmptyPanel icon={Signal} title="Sem aquisição no período" description="A curva será preenchida conforme os leads entrarem." />}
        </ChartCard>

        <ChartCard title="Participação por origem">
          {isLoading ? <GrowthLoading /> : sourcePie.length ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourcePie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={105} paddingAngle={3}>
                    {sourcePie.map((item, index) => <Cell key={item.name} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} leads`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <GrowthEmptyPanel icon={Megaphone} title="Sem origens identificadas" description="Cadastre ou mapeie os canais de aquisição." />}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Campanhas Meta por volume">
          {isLoading ? <GrowthLoading /> : data?.campaigns.length ? (
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.campaigns.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="campaign" width={190} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="leads" name="Leads" fill="#F4B728" radius={[0, 5, 5, 0]} />
                  <Bar dataKey="enrollments" name="Matrículas" fill="#377DFE" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <GrowthEmptyPanel icon={RadioTower} title="Sem campanhas Meta" description="As campanhas aparecerão quando eventos Meta estiverem ligados aos leads." />}
        </ChartCard>

        <ChartCard title="Eficiência das campanhas">
          {isLoading ? <GrowthLoading /> : data?.campaigns.length ? (
            <div className="space-y-4">
              {data.campaigns.map((campaign) => (
                <GrowthDataBar key={campaign.campaign} label={campaign.campaign} value={campaign.leads} max={campaignMax} detail={`${campaign.enrollments} matrículas · ${formatPercent(campaign.conversionRate)}`} accent={campaign.enrollments ? "success" : "primary"} />
              ))}
            </div>
          ) : <GrowthEmptyPanel icon={GraduationCap} title="Sem conversão por campanha" description="A conversão será calculada quando os leads avançarem para matrícula." />}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Origens e qualidade">
          {isLoading ? <GrowthLoading /> : data?.sources.length ? (
            <div className="space-y-4">
              {data.sources.map((source) => (
                <GrowthDataBar key={source.source} label={source.source} value={source.leads} max={sourceMax} detail={`${source.enrollments} matrículas · ${formatPercent(source.conversionRate)}`} accent={source.enrollments ? "gold" : "primary"} />
              ))}
            </div>
          ) : <GrowthEmptyPanel icon={Megaphone} title="Sem origens" description="Os canais aparecerão conforme forem gravados nos leads." />}
        </ChartCard>

        <ChartCard title="Praças com maior demanda">
          {isLoading ? <GrowthLoading /> : data?.cities.length ? (
            <div className="space-y-4">
              {data.cities.map((city) => (
                <GrowthDataBar key={city.city} label={city.city} value={city.leads} max={cityMax} detail={`${city.enrollments} matrículas · ${formatPercent(city.conversionRate)}`} accent="success" />
              ))}
            </div>
          ) : <GrowthEmptyPanel icon={Target} title="Sem praças identificadas" description="A análise regional depende da cidade roteada para o lead." />}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
