import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  MessageCircle,
  PhoneCall,
  ReceiptText,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";

type Profile = {
  student: {
    id: string;
    full_name: string;
    phone: string | null;
    phone2: string | null;
    email: string | null;
    enrollment_id: string | null;
    external_enrollment_id: string | null;
    course_name: string | null;
    class_name: string | null;
    enrollment_date: string | null;
    start_date: string | null;
    end_date: string | null;
    financial_lookup_status: string | null;
    overdue_amount: number;
    upcoming_amount: number;
    overdue_count: number;
    max_overdue_days: number;
    responsible_name: string | null;
    responsible_phone: string | null;
    responsible_email: string | null;
  };
  installments: Array<{
    id: string;
    due_date: string;
    original_amount: number;
    penalty_amount: number;
    interest_amount: number;
    total_amount: number;
    days_overdue: number;
    status: string;
    boleto_url: string | null;
    course_suspended: boolean;
    restriction_type: string | null;
  }>;
  actions: Array<{
    id: string;
    type: string;
    status: string;
    notes: string | null;
    performed_at: string;
    performed_by_name: string | null;
  }>;
  promises: Array<{
    id: string;
    installment_id: string | null;
    promised_date: string;
    promised_amount: number;
    status: string;
    notes: string | null;
    created_at: string;
  }>;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        ...(value.includes("T") ? { timeStyle: "short" as const } : {}),
      }).format(new Date(value.includes("T") ? value : `${value}T12:00:00`))
    : "—";
async function readJson<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na requisição.");
  return data;
}

export const Route = createFileRoute("/financeiro/aluno/$studentId")({
  head: () => ({ meta: [{ title: "Perfil financeiro do aluno · Star Profissões" }] }),
  component: StudentFinancialProfile,
});

function StudentFinancialProfile() {
  const { studentId } = Route.useParams();
  const { session } = useAuth();
  const unitId = session?.activeUnit?.id ?? "";
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<"contact" | "promise" | null>(null);
  const load = React.useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      setProfile(
        await readJson<Profile>(
          await fetch(
            `/api/financeiro/students/${encodeURIComponent(studentId)}?unit_id=${encodeURIComponent(unitId)}`,
            { credentials: "same-origin" },
          ),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar o aluno.");
    } finally {
      setLoading(false);
    }
  }, [studentId, unitId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  if (loading && !profile)
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  if (!profile)
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Financeiro" title="Aluno não encontrado" />
        <Button asChild variant="outline">
          <Link to="/financeiro">
            <ArrowLeft />
            Voltar
          </Link>
        </Button>
      </div>
    );
  const s = profile.student;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Perfil financeiro do aluno"
        title={s.full_name}
        description="Dados financeiros sincronizados do CAEZ e histórico operacional da Star."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw />
              Atualizar
            </Button>
            <Button asChild variant="outline">
              <Link to="/financeiro">
                <ArrowLeft />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />
      <section className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Aluno e matrícula</CardTitle>
            <CardDescription>
              {s.course_name || "Curso não informado"} · {s.class_name || "Turma não informada"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2">
            <Data label="Matrícula CAEZ" value={s.external_enrollment_id || "—"} />
            <Data label="Status da consulta" value={s.financial_lookup_status || "—"} />
            <Data label="Telefone" value={s.phone || "—"} />
            <Data label="E-mail" value={s.email || "—"} />
            <Data
              label="Responsável financeiro"
              value={s.responsible_name || "Próprio aluno / não informado"}
            />
            <Data
              label="Contato do responsável"
              value={s.responsible_phone || s.responsible_email || "—"}
            />
            <Data label="Data da matrícula" value={date(s.enrollment_date)} />
            <Data label="Período da turma" value={`${date(s.start_date)} a ${date(s.end_date)}`} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="bg-[linear-gradient(135deg,#16006C_0%,#07154C_100%)] text-white">
            <CardTitle className="text-white">Resumo da carteira</CardTitle>
            <CardDescription className="text-white/65">
              Somente títulos retornados pelo CAEZ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <StatusLine
              icon={ReceiptText}
              label="Valor vencido"
              value={money.format(s.overdue_amount)}
            />
            <StatusLine
              icon={CalendarDays}
              label="Valor futuro"
              value={money.format(s.upcoming_amount)}
            />
            <StatusLine icon={Clock3} label="Parcelas vencidas" value={String(s.overdue_count)} />
            <StatusLine
              icon={RefreshCw}
              label="Maior atraso"
              value={`${s.max_overdue_days} dias`}
            />
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Parcelas CAEZ</CardTitle>
          <CardDescription>Nenhuma baixa ou alteração é enviada ao ERP.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {profile.installments.length ? (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {[
                    "Vencimento",
                    "Original",
                    "Multa",
                    "Juros",
                    "Atualizado",
                    "Atraso",
                    "Status",
                    "Boleto",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {profile.installments.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-4">{date(i.due_date)}</td>
                    <td className="px-4 py-4">{money.format(i.original_amount)}</td>
                    <td className="px-4 py-4">{money.format(i.penalty_amount)}</td>
                    <td className="px-4 py-4">{money.format(i.interest_amount)}</td>
                    <td className="px-4 py-4 font-bold">{money.format(i.total_amount)}</td>
                    <td className="px-4 py-4">{i.days_overdue} dias</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-4 py-4">
                      {i.boleto_url ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={i.boleto_url} target="_blank" rel="noreferrer">
                            Abrir boleto
                          </a>
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma parcela retornada pelo CAEZ.
            </div>
          )}
        </CardContent>
      </Card>
      <section className="grid gap-3 sm:grid-cols-2">
        <Button className="h-11 bg-gradient-primary" onClick={() => setMode("contact")}>
          <UserRound />
          Registrar contato
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setMode("promise")}>
          <ReceiptText />
          Registrar promessa
        </Button>
      </section>
      {mode === "contact" ? (
        <ContactForm
          unitId={unitId}
          studentId={studentId}
          enrollmentId={s.enrollment_id}
          onDone={async () => {
            setMode(null);
            await load();
          }}
          onCancel={() => setMode(null)}
        />
      ) : null}
      {mode === "promise" ? (
        <PromiseForm
          unitId={unitId}
          studentId={studentId}
          installments={profile.installments}
          onDone={async () => {
            setMode(null);
            await load();
          }}
          onCancel={() => setMode(null)}
        />
      ) : null}
      <section className="grid gap-4 xl:grid-cols-2">
        <Timeline title="Contatos de cobrança" icon={History}>
          {profile.actions.length ? (
            profile.actions.map((a) => (
              <Event
                key={a.id}
                dateValue={a.performed_at}
                title={`${actionLabel(a.type)} · ${resultLabel(a.status)}`}
                detail={
                  [a.notes, a.performed_by_name].filter(Boolean).join(" · ") || "Sem observações"
                }
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p>
          )}
        </Timeline>
        <Timeline title="Promessas de pagamento" icon={CheckCircle2}>
          {profile.promises.length ? (
            profile.promises.map((p) => (
              <Event
                key={p.id}
                dateValue={p.created_at}
                title={`${money.format(p.promised_amount)} para ${date(p.promised_date)}`}
                detail={`${promiseLabel(p.status)}${p.notes ? ` · ${p.notes}` : ""}`}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma promessa registrada.</p>
          )}
        </Timeline>
      </section>
    </div>
  );
}

function ContactForm({
  unitId,
  studentId,
  enrollmentId,
  onDone,
  onCancel,
}: {
  unitId: string;
  studentId: string;
  enrollmentId: string | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = React.useState("manual_contact");
  const [status, setStatus] = React.useState("attempted");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try {
      await readJson(
        await fetch("/api/financeiro/collection-actions", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unit_id: unitId, studentId, enrollmentId, type, status, notes }),
        }),
      );
      toast.success("Contato registrado.");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar contato.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Editor title="Registrar contato" onCancel={onCancel}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Choice
            value={type}
            onChange={setType}
            items={[
              ["whatsapp", "WhatsApp"],
              ["call", "Ligação"],
              ["manual_contact", "Contato manual"],
              ["note", "Observação"],
            ]}
          />
        </Field>
        <Field label="Resultado">
          <Choice
            value={status}
            onChange={setStatus}
            items={[
              ["attempted", "Tentativa"],
              ["answered", "Atendeu"],
              ["no_answer", "Não respondeu"],
              ["negotiating", "Negociando"],
              ["resolved", "Resolvido"],
            ]}
          />
        </Field>
      </div>
      <Field label="Observações">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Registre apenas informações necessárias para a cobrança."
        />
      </Field>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : null}Salvar contato
      </Button>
    </Editor>
  );
}
function PromiseForm({
  unitId,
  studentId,
  installments,
  onDone,
  onCancel,
}: {
  unitId: string;
  studentId: string;
  installments: Profile["installments"];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [installmentId, setInstallmentId] = React.useState("none");
  const [promisedDate, setPromisedDate] = React.useState("");
  const [promisedAmount, setPromisedAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try {
      await readJson(
        await fetch("/api/financeiro/promises", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unit_id: unitId,
            studentId,
            installmentId: installmentId === "none" ? null : installmentId,
            promisedDate,
            promisedAmount: Number(promisedAmount),
            notes,
          }),
        }),
      );
      toast.success("Promessa registrada.");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar promessa.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Editor title="Registrar promessa" onCancel={onCancel}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Parcela">
          <Choice
            value={installmentId}
            onChange={setInstallmentId}
            items={[
              ["none", "Sem parcela específica"],
              ...installments.map((i) => [
                i.id,
                `${date(i.due_date)} · ${money.format(i.total_amount)}`,
              ]),
            ]}
          />
        </Field>
        <Field label="Data prometida">
          <Input
            type="date"
            value={promisedDate}
            onChange={(e) => setPromisedDate(e.target.value)}
          />
        </Field>
        <Field label="Valor">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={promisedAmount}
            onChange={(e) => setPromisedAmount(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : null}Salvar promessa
      </Button>
    </Editor>
  );
}
function Editor({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Choice({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<Array<string>>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
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
function Data({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-4">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-sm">{value}</strong>
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
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="text-sm">{value}</strong>
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    upcoming: "Futura",
    due_today: "Vence hoje",
    overdue: "Vencida",
    not_returned: "Não retornada",
  };
  return (
    <Badge
      variant="outline"
      className={status === "overdue" ? "border-red-200 bg-red-50 text-red-800" : ""}
    >
      {labels[status] ?? status}
    </Badge>
  );
}
function Timeline({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof History;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Icon className="text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
function Event({ dateValue, title, detail }: { dateValue: string; title: string; detail: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex justify-between gap-3">
        <strong className="text-sm">{title}</strong>
        <span className="text-xs text-muted-foreground">{date(dateValue)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
function actionLabel(value: string) {
  return (
    (
      {
        whatsapp: "WhatsApp",
        call: "Ligação",
        manual_contact: "Contato manual",
        note: "Observação",
      } as Record<string, string>
    )[value] ?? value
  );
}
function resultLabel(value: string) {
  return (
    (
      {
        attempted: "Tentativa",
        answered: "Atendeu",
        no_answer: "Não respondeu",
        negotiating: "Negociando",
        resolved: "Resolvido",
      } as Record<string, string>
    )[value] ?? value
  );
}
function promiseLabel(value: string) {
  return (
    (
      {
        open: "Aberta",
        fulfilled: "Cumprida",
        broken: "Quebrada",
        cancelled: "Cancelada",
      } as Record<string, string>
    )[value] ?? value
  );
}
