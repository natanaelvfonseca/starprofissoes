import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  HelpCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const Route = createFileRoute("/aluno")({
  head: () => ({ meta: [{ title: "Aluno · Star Profissões" }] }),
  component: StudentArea,
});

function StudentArea() {
  const [reorganizing, setReorganizing] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [amount, setAmount] = React.useState("50");
  const [frequency, setFrequency] = React.useState("semanal");
  const [day, setDay] = React.useState("sexta-feira");
  const total = 1_400;
  const paid = 520;
  const balance = total - paid;
  const progress = 37;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="grid overflow-hidden rounded-[30px] border border-[#16006C]/10 bg-white shadow-[0_30px_80px_-52px_rgba(22,0,108,0.8)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="relative overflow-hidden bg-[#16006C] p-6 text-white md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full border border-white/10" />
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F4B728] text-2xl font-black text-[#07154C]">
              JS
            </div>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-[#F4B728]">
              Portal do aluno
            </p>
            <h1 className="mt-2 text-3xl font-black text-white">João Silva</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Máquinas Agrícolas
              <br />
              Turma de 15 de agosto
            </p>
            <Badge className="mt-6 border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-emerald-100 hover:bg-emerald-400/15">
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Em dia
            </Badge>

            <div className="mt-10 border-t border-white/10 pt-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-white/45">Plano concluído</div>
                  <div className="mt-1 text-4xl font-black text-[#F4B728]">{progress}%</div>
                </div>
                <span className="text-xs text-white/45">9 de 24</span>
              </div>
              <Progress value={progress} className="mt-4 h-2 bg-white/10 [&>div]:bg-[#F4B728]" />
            </div>
          </div>
        </aside>

        <div className="p-5 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#224C99]">
                Próximo compromisso
              </p>
              <h2 className="mt-2 text-2xl font-black text-[#07154C]">
                Seu plano está no caminho certo
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Acompanhe o saldo e escolha a melhor forma de continuar.
              </p>
            </div>
            <div className="rounded-2xl bg-[#F4B728]/15 px-5 py-4 text-right">
              <div className="text-xs text-[#8A6100]">Vence em 02/08/2026</div>
              <strong className="mt-1 block text-2xl text-[#07154C]">R$ 50,00</strong>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <StudentMetric icon={CreditCard} label="Valor do curso" value={money.format(total)} />
            <StudentMetric
              icon={CheckCircle2}
              label="Total pago"
              value={money.format(paid)}
              tone="success"
            />
            <StudentMetric
              icon={ReceiptText}
              label="Saldo em aberto"
              value={money.format(balance)}
            />
          </div>

          <div className="mt-7 flex flex-col gap-3 border-t border-[#16006C]/10 pt-6 sm:flex-row">
            <Button className="h-12 bg-[#F4B728] px-6 font-bold text-[#07154C] hover:bg-[#F4B728]/90">
              <CreditCard /> Pagar agora
            </Button>
            <Button
              variant="outline"
              className="h-12 border-[#16006C]/20 px-6 text-[#16006C]"
              onClick={() => {
                setReorganizing((current) => !current);
                setConfirmed(false);
              }}
            >
              <RefreshCw /> Reorganizar pagamento
            </Button>
          </div>
        </div>
      </section>

      {reorganizing ? (
        <Card className="border-primary/25 shadow-card">
          <CardHeader>
            <CardTitle>Reorganizar pagamento</CardTitle>
            <CardDescription>
              Conte como fica melhor para você. O valor total do curso não muda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="student-amount">Quanto consegue pagar agora?</Label>
                <Input
                  id="student-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="R$ 50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-frequency">Frequência desejada</Label>
                <select
                  id="student-frequency"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-day">Melhor dia para pagar</Label>
                <select
                  id="student-day"
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="sexta-feira">Sexta-feira</option>
                  <option value="segunda-feira">Segunda-feira</option>
                  <option value="dia 5">Dia 5</option>
                  <option value="dia 10">Dia 10</option>
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Proposta de novo plano
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ProposalItem label="Entrada agora" value={money.format(Number(amount) || 50)} />
                <ProposalItem
                  label="Próximos pagamentos"
                  value={`${frequency === "semanal" ? "Semanais" : frequency === "quinzenal" ? "Quinzenais" : "Mensais"} de R$ 50`}
                />
                <ProposalItem label="Melhor dia" value={capitalize(day)} />
                <ProposalItem label="Último pagamento" value="08/11/2026" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Valor total preservado, sem alteração no curso contratado.
              </div>
            </div>

            {confirmed ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                Novo plano confirmado. A escola receberá sua solicitação para acompanhamento.
              </div>
            ) : (
              <Button className="bg-gradient-primary" onClick={() => setConfirmed(true)}>
                <CheckCircle2 />
                Confirmar novo plano
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <PaymentList
          title="Próximos pagamentos"
          description="Seus próximos compromissos agendados"
          icon={Clock3}
          items={[
            ["02/08", "R$ 50", "Próximo"],
            ["09/08", "R$ 50", "Agendado"],
            ["16/08", "R$ 50", "Agendado"],
          ]}
        />
        <PaymentList
          title="Histórico de pagamentos"
          description="Últimas movimentações do seu plano"
          icon={CheckCircle2}
          items={[
            ["31/07", "R$ 50", "Pendente"],
            ["24/07", "R$ 50", "Pago"],
            ["17/07", "R$ 50", "Pago"],
            ["10/07", "R$ 200", "Pago"],
          ]}
        />
      </section>

      <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>
          Não consegue pagar na data combinada? Use{" "}
          <strong className="text-foreground">Reorganizar pagamento</strong> para montar uma
          proposta simples antes do vencimento.
        </p>
      </div>
    </div>
  );
}

function StudentMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="rounded-xl border p-4">
      <Icon className={`h-5 w-5 ${tone === "success" ? "text-emerald-600" : "text-primary"}`} />
      <span className="mt-3 block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-base">{value}</strong>
    </div>
  );
}

function ProposalItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-sm">{value}</strong>
    </div>
  );
}

function PaymentList({
  title,
  description,
  icon: Icon,
  items,
}: {
  title: string;
  description: string;
  icon: typeof Clock3;
  items: Array<Array<string>>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="divide-y">
        {items.map(([date, value, status]) => (
          <div
            key={`${date}-${status}`}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div>
              <strong className="text-sm">{date}</strong>
              <span className="ml-3 text-sm text-muted-foreground">{value}</span>
            </div>
            <Badge
              variant="outline"
              className={
                status === "Pago"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : status === "Pendente"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : ""
              }
            >
              {status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
