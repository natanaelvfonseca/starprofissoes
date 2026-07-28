import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  History,
  RefreshCw,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
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

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const profiles: Record<string, { name: string; course: string }> = {
  "joao-silva": { name: "João Silva", course: "Máquinas Agrícolas" },
  "maria-souza": { name: "Maria Souza", course: "Bombeiro Civil" },
  "carlos-lima": { name: "Carlos Lima", course: "Inseminação Artificial" },
  "ana-santos": { name: "Ana Santos", course: "Máquinas Pesadas" },
  joao: { name: "João Batista Martins", course: "NR Segurança no Trabalho" },
  ana: { name: "Ana Paula Ribeiro", course: "Operador de Máquinas Pesadas" },
  priscila: { name: "Priscila Moraes", course: "Operador de Colheitadeira" },
  carlos: { name: "Carlos Henrique Lima", course: "Inseminação Artificial em Bovinos" },
  marta: { name: "Marta Fernanda Souza", course: "Operador de Máquinas Pesadas" },
  edson: { name: "Edson Pereira Alves", course: "NR Segurança no Trabalho" },
};

const timeline = [
  { date: "02/07", title: "Matrícula realizada", detail: "Contrato financeiro criado", kind: "neutral" },
  { date: "02/07", title: "Entrada de R$ 200 recebida", detail: "Pagamento confirmado via Pix", kind: "success" },
  { date: "10/07", title: "Parcela de R$ 300 vencida", detail: "Compromisso não identificado", kind: "danger" },
  { date: "12/07", title: "Aluno informou dificuldade financeira", detail: "Atendimento registrado pela equipe", kind: "attention" },
  { date: "12/07", title: "Novo plano criado: R$ 75 por semana", detail: "Renegociação aceita pelo aluno", kind: "neutral" },
  { date: "19/07", title: "Primeiro pagamento recebido", detail: "R$ 75 confirmado", kind: "success" },
  { date: "26/07", title: "Segundo pagamento recebido", detail: "R$ 75 confirmado", kind: "success" },
  { date: "02/08", title: "Próximo compromisso", detail: "R$ 75 aguardando pagamento", kind: "upcoming" },
] as const;

export const Route = createFileRoute("/financeiro/aluno/$studentId")({
  head: () => ({ meta: [{ title: "Perfil financeiro do aluno · Star Profissões" }] }),
  component: StudentFinancialProfile,
});

function StudentFinancialProfile() {
  const { studentId } = Route.useParams();
  const profile = profiles[studentId] ?? profiles["joao-silva"];
  const total = 1_400;
  const received = 350;
  const balance = total - received;
  const progress = Math.round((received / total) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Perfil financeiro do aluno"
        title={profile.name}
        description="Histórico completo do compromisso, recebimentos e negociações."
        actions={
          <Button asChild variant="outline">
            <Link to="/financeiro">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Financeiro
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Resumo do compromisso</CardTitle>
                <CardDescription className="mt-1">
                  {profile.course} · Turma de 15/08/2026
                </CardDescription>
              </div>
              <Badge className="w-fit border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
                Plano renegociado
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2">
            <DataPoint label="Curso e turma" value={`${profile.course} · 15/08/2026`} />
            <DataPoint label="Valor total contratado" value={money.format(total)} />
            <DataPoint label="Valor já recebido" value={money.format(received)} valueClass="text-emerald-700" />
            <DataPoint label="Saldo restante" value={money.format(balance)} />
            <DataPoint label="Plano original" value="Entrada de R$ 200 + 4x de R$ 300" />
            <DataPoint label="Próxima parcela" value="R$ 75 em 02/08" />
            <DataPoint label="Dias de atraso" value="18 dias" valueClass="text-destructive" />
            <DataPoint label="Realização da turma" value="15 de agosto de 2026" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-[linear-gradient(135deg,#16006C_0%,#07154C_100%)] text-white">
            <CardTitle className="text-white">Situação atual</CardTitle>
            <CardDescription className="text-white/65">
              Leitura rápida da saúde financeira
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>Plano concluído</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>
            <StatusLine icon={ReceiptText} label="Saldo em aberto" value={money.format(balance)} />
            <StatusLine icon={Clock3} label="Próximo compromisso" value="02/08 · R$ 75" />
            <StatusLine icon={RefreshCw} label="Plano atual" value="Semanal" />
            <StatusLine icon={CalendarDays} label="Turma" value="Em 18 dias" />
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong className="block">Acompanhamento necessário</strong>
              <span className="mt-1 block text-xs leading-5 text-amber-800">
                Confirmar o próximo compromisso antes das 17h de 02/08.
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Linha do tempo financeira</CardTitle>
              <CardDescription className="mt-1">
                Tudo o que aconteceu desde a matrícula.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="relative">
            <div className="absolute bottom-4 left-[51px] top-4 w-px bg-border" />
            <div className="space-y-1">
              {timeline.map((event) => (
                <div key={`${event.date}-${event.title}`} className="relative grid grid-cols-[74px_1fr] gap-4 py-3">
                  <div className="text-xs font-bold text-muted-foreground">{event.date}</div>
                  <div className="relative rounded-xl border bg-card p-4 shadow-sm">
                    <span
                      className={`absolute -left-[29px] top-5 h-3 w-3 rounded-full border-2 border-background ${
                        event.kind === "success"
                          ? "bg-emerald-500"
                          : event.kind === "danger"
                            ? "bg-red-500"
                            : event.kind === "attention"
                              ? "bg-amber-500"
                              : event.kind === "upcoming"
                                ? "bg-primary"
                                : "bg-muted-foreground"
                      }`}
                    />
                    <div className="text-sm font-semibold">{event.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-3">
        <Button className="h-11 bg-gradient-primary">
          <CreditCard />
          Registrar pagamento
        </Button>
        <Button variant="outline" className="h-11">
          <RefreshCw />
          Reorganizar plano
        </Button>
        <Button variant="outline" className="h-11">
          <UserRound />
          Registrar contato
        </Button>
      </section>
    </div>
  );
}

function DataPoint({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border-b pb-4">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className={`mt-1 block text-sm ${valueClass ?? ""}`}>{value}</strong>
    </div>
  );
}

function StatusLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="block truncate text-sm">{value}</strong>
      </div>
    </div>
  );
}
