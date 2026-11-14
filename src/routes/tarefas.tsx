import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock3,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  Repeat2,
  RotateCw,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TeamTask = {
  id: string;
  title: string;
  description: string;
  scope: string;
  recurrence: string;
  status: string;
  due_at: string;
  next_due_at: string | null;
  creator_name: string | null;
  assigned_count: number;
  done_count: number;
  run_count: number;
};
type Assignment = {
  id: string;
  user_id: string;
  recipient_name: string;
  status: "pending" | "done";
  title: string;
  description: string;
  scope: string;
  creator_name: string | null;
  due_at: string;
  task_id: string;
  recurrence: string;
  completed_at: string | null;
};
type TeamUser = { id: string; name: string; status: string };
type Attendance = { id: string; name: string; people: number };
type Data = {
  tasks: TeamTask[];
  assignments: Assignment[];
  team: Array<{ id: string; name: string; total: number; done: number; overdue: number }>;
  legacy: Array<{
    id: string;
    title: string;
    description: string;
    due_at: string;
    status: string;
    lead_name: string;
    lead_id: string;
  }>;
  options: { users: TeamUser[]; attendances: Attendance[] };
  myContact: { phone: string | null; opt_in: boolean; consent_at: string | null };
  canManage: boolean;
};

type Scope = "individual" | "attendance" | "all";
type View = "mine" | "team" | "repeat";
type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";
const fmt = new Intl.NumberFormat("pt-BR");
function futureInput() {
  const date = new Date(Date.now() + 3600_000);
  date.setMinutes(0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:00`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
const repeatLabel: Record<string, string> = {
  none: "Pontual",
  daily: "Diariamente",
  weekdays: "Dias úteis",
  weekly: "Semanalmente",
  monthly: "Mensalmente",
};
const scopedLabel: Record<string, string> = {
  individual: "Consultores selecionados",
  attendance: "Consultores da turma",
  all: "Todos os consultores",
};
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir.");
  return payload as T;
}
export const Route = createFileRoute("/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas | Star Profissões" }] }),
  component: TasksPage,
});
function TasksPage() {
  const { session } = useAuth();
  const unitId = session?.activeUnit?.id ?? "";
  const userId = session?.user.id ?? "";
  const [data, setData] = React.useState<Data | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const [view, setView] = React.useState<View>("mine");
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scope, setScope] = React.useState<Scope>("individual");
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [attendance, setAttendance] = React.useState("");
  const [dueAt, setDueAt] = React.useState(futureInput);
  const [recurrence, setRecurrence] = React.useState<Recurrence>("none");
  const [repeatUntil, setRepeatUntil] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [optIn, setOptIn] = React.useState(false);
  const [contactEdited, setContactEdited] = React.useState(false);

  const load = React.useCallback(
    async (silent = false) => {
      if (!unitId) {
        setData(null);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const result = await requestJson<Data>("/api/team/tasks");
        setData(result);
        if (!contactEdited) {
          setPhone(result.myContact.phone ?? "");
          setOptIn(Boolean(result.myContact.opt_in));
        }
      } catch (error) {
        if (!silent)
          toast.error(error instanceof Error ? error.message : "Erro ao carregar tarefas.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [unitId, contactEdited],
  );
  React.useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const action = async (body: Record<string, unknown>, success: string) => {
    setWorking(true);
    try {
      await requestJson("/api/team/tasks", { method: "PATCH", body: JSON.stringify(body) });
      toast.success(success);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar.");
    } finally {
      setWorking(false);
    }
  };
  const create = async () => {
    if (!title.trim() || !dueAt) {
      toast.error("Informe título e horário.");
      return;
    }
    if (scope === "individual" && !userIds.length) {
      toast.error("Selecione pelo menos um consultor.");
      return;
    }
    if (scope === "attendance" && !attendance) {
      toast.error("Selecione uma turma.");
      return;
    }
    const iso = new Date(dueAt).toISOString();
    setWorking(true);
    try {
      const created = await requestJson<{ recipientCount: number }>("/api/team/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          scope,
          userIds,
          attendanceId: scope === "attendance" ? attendance : null,
          dueAt: iso,
          recurrence,
          repeatUntil: recurrence === "none" ? null : repeatUntil || null,
        }),
      });
      toast.success(
        created.recipientCount
          ? `Tarefa criada para ${created.recipientCount} consultor(es).`
          : "Tarefa criada, mas não há consultores com leads elegíveis neste momento.",
      );
      setTitle("");
      setDescription("");
      setUserIds([]);
      setScope("individual");
      setAttendance("");
      setRecurrence("none");
      setRepeatUntil("");
      setDueAt(futureInput());
      setShowForm(false);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar tarefa.");
    } finally {
      setWorking(false);
    }
  };
  const savePhone = async () => {
    setWorking(true);
    try {
      await requestJson("/api/team/contact", {
        method: "POST",
        body: JSON.stringify({ phone, optIn }),
      });
      toast.success(
        optIn ? "Preferência de WhatsApp salva." : "Mensagens do WhatsApp desativadas para você.",
      );
      setContactEdited(false);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar telefone.");
    } finally {
      setWorking(false);
    }
  };

  const own = data?.assignments.filter((row) => row.user_id === userId) ?? [];
  const pending = own.filter((row) => row.status === "pending");
  const done = own.filter((row) => row.status === "done");
  const overdue = pending.filter((row) => new Date(row.due_at).getTime() < Date.now());
  const managerOverdue =
    data?.assignments.filter(
      (row) => row.status === "pending" && new Date(row.due_at).getTime() < Date.now(),
    ).length ?? 0;
  return (
    <div className="space-y-5 pb-10">
      <header className="rounded-[24px] border border-[#E3E8F1] bg-white p-5 shadow-[0_20px_50px_-44px_rgba(22,0,108,.4)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#386FDB]">
              Organização comercial
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#18294D] sm:text-3xl">
              Central de Tarefas
            </h1>
            <p className="mt-1 text-sm text-[#8390A6]">
              Responsabilidades, prazos e acompanhamento da sua unidade.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={loading} onClick={() => void load()}>
              <RotateCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            {data?.canManage ? (
              <Button
                className="bg-[#16006C] text-white hover:bg-[#16006C]/90"
                onClick={() => setShowForm((v) => !v)}
              >
                <Plus className="mr-2 h-4 w-4" /> Nova tarefa
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { name: "Minhas pendentes", value: pending.length, icon: Clock3, color: "#386FDB" },
          { name: "Minhas atrasadas", value: overdue.length, icon: AlarmClock, color: "#E47855" },
          { name: "Minhas concluídas", value: done.length, icon: CheckCircle2, color: "#20A896" },
          {
            name: data?.canManage ? "Atrasadas da equipe" : "Pendências de leads",
            value: data?.canManage
              ? managerOverdue
              : (data?.legacy.filter((x) => x.status === "pending").length ?? 0),
            icon: UsersRound,
            color: "#A17DCE",
          },
        ].map((card) => (
          <Card key={card.name} className="rounded-[21px] border-[#E3E8F1] bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#77839C]">{card.name}</span>
              <card.icon className="h-5 w-5" style={{ color: card.color }} />
            </div>
            <div className="mt-3 text-3xl font-extrabold text-[#18294D]">
              {fmt.format(card.value)}
            </div>
          </Card>
        ))}
      </div>

      {showForm && data?.canManage ? (
        <Card className="space-y-5 rounded-[22px] border-[#CBD8F3] bg-white p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-extrabold text-[#18294D]">Distribuir nova tarefa</h2>
            <p className="mt-1 text-xs text-[#8996AB]">
              Cada consultor terá uma confirmação independente.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-[#66748E]">
              Título
              <input
                value={title}
                maxLength={140}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Atualizar contatos do dia"
                className="block h-11 w-full rounded-xl border border-[#DAE2F0] px-3 text-sm text-[#18294D] outline-none focus:ring-2 focus:ring-[#386FDB]/20"
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#66748E]">
              Destinatários
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="h-11 rounded-xl border-[#DAE2F0] bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Consultores específicos</SelectItem>
                  <SelectItem value="attendance">Consultores com leads de uma turma</SelectItem>
                  <SelectItem value="all">Todos os consultores da unidade</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#66748E]">
              Prazo
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="block h-11 w-full rounded-xl border border-[#DAE2F0] px-3 text-sm text-[#18294D]"
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#66748E]">
              Repetição
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                <SelectTrigger className="h-11 rounded-xl border-[#DAE2F0] bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(repeatLabel).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {recurrence !== "none" ? (
              <label className="space-y-1.5 text-xs font-semibold text-[#66748E]">
                Repetir até (opcional)
                <input
                  type="date"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  className="block h-11 w-full rounded-xl border border-[#DAE2F0] px-3 text-sm"
                />
              </label>
            ) : null}
          </div>
          {scope === "individual" ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#66748E]">Selecione os consultores</p>
              <div className="grid max-h-40 gap-2 overflow-auto rounded-xl border border-[#E2E8F2] p-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.options.users
                  .filter((user) => user.status === "active")
                  .map((user) => (
                    <label
                      key={user.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#56627A] hover:bg-[#F5F7FB]"
                    >
                      <input
                        type="checkbox"
                        checked={userIds.includes(user.id)}
                        onChange={(e) =>
                          setUserIds((ids) =>
                            e.target.checked
                              ? [...ids, user.id]
                              : ids.filter((id) => id !== user.id),
                          )
                        }
                      />
                      {user.name}
                    </label>
                  ))}
              </div>
            </div>
          ) : null}
          {scope === "attendance" ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#66748E]">Turma</p>
              <Select value={attendance} onValueChange={setAttendance}>
                <SelectTrigger className="h-11 w-full rounded-xl border-[#DAE2F0] bg-white text-sm">
                  <SelectValue placeholder="Selecionar turma" />
                </SelectTrigger>
                <SelectContent>
                  {data.options.attendances.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.people} consultor(es) com leads
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#95A1B2]">
                Os destinatários são recalculados a cada ocorrência recorrente, conforme leads
                ativos da turma.
              </p>
            </div>
          ) : null}
          <label className="block space-y-1.5 text-xs font-semibold text-[#66748E]">
            Instruções (opcional)
            <textarea
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o resultado esperado."
              className="block w-full rounded-xl border border-[#DAE2F0] p-3 text-sm text-[#18294D]"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              disabled={working}
              className="bg-[#16006C] text-white hover:bg-[#16006C]/90"
              onClick={() => void create()}
            >
              Criar e notificar
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["mine", "Minhas tarefas", UserRound],
            ...(data?.canManage
              ? [["team", "Equipe", Users] as const, ["repeat", "Recorrentes", Repeat2] as const]
              : []),
          ] as Array<[View, string, typeof UserRound]>
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              view === key
                ? "bg-[#16006C] text-white"
                : "bg-white text-[#7D8AA0] hover:bg-[#EDF2FA]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <Card className="p-7 text-sm text-[#8793A8]">Carregando tarefas da unidade...</Card>
      ) : null}
      {view === "mine" && data ? (
        <div className="space-y-4">
          <Card className="rounded-[22px] border-[#E3E8F1] bg-white p-5">
            <h2 className="mb-4 text-lg font-extrabold text-[#18294D]">Tarefas atribuídas a mim</h2>
            {own.length ? (
              <div className="space-y-2">
                {[...own]
                  .sort(
                    (a, b) =>
                      (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1) ||
                      new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
                  )
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-[#E6EBF4] p-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-[#233457]">{item.title}</p>
                        <p className="mt-1 text-xs text-[#8C99AE]">
                          {item.creator_name ? "Por " + item.creator_name + " · " : ""}
                          {scopedLabel[item.scope] ?? "Tarefa"}
                        </p>
                        {item.description ? (
                          <p className="mt-1 whitespace-pre-line text-sm text-[#6B7891]">
                            {item.description}
                          </p>
                        ) : null}
                        <p
                          className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${item.status === "pending" && new Date(item.due_at) < new Date() ? "text-rose-600" : "text-[#7D8AA0]"}`}
                        >
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDate(item.due_at)} · {repeatLabel[item.recurrence]}
                        </p>
                      </div>
                      <Button
                        disabled={working || item.status === "done"}
                        variant={item.status === "done" ? "outline" : "default"}
                        className={
                          item.status === "pending"
                            ? "shrink-0 bg-[#16006C] text-white hover:bg-[#16006C]/90"
                            : "shrink-0"
                        }
                        onClick={() =>
                          void action(
                            { action: "complete", assignmentId: item.id, note: "" },
                            "Tarefa concluída.",
                          )
                        }
                      >
                        {item.status === "done" ? (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Concluída
                          </>
                        ) : (
                          <>
                            <Circle className="mr-2 h-4 w-4" />
                            Concluir
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="rounded-xl bg-[#F7F9FC] px-4 py-8 text-center text-sm text-[#93A0B3]">
                Você não tem tarefas atribuídas.
              </div>
            )}
          </Card>
          <Card className="rounded-[22px] border-[#E3E8F1] bg-white p-5">
            <h2 className="mb-3 text-lg font-extrabold text-[#18294D]">Lembretes dos meus leads</h2>
            <p className="mb-4 text-xs text-[#8793A8]">
              Tarefas do CRM antigo, preservadas e acessíveis no registro de cada lead.
            </p>
            {data.legacy.length ? (
              <div className="space-y-2">
                {data.legacy.map((item) => (
                  <Link
                    to="/crm"
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-[#E6EBF4] px-4 py-3 text-sm hover:bg-[#F8FAFD]"
                  >
                    <span>
                      <span className="font-semibold text-[#28395A]">{item.title}</span>
                      <span className="ml-2 text-[#8390A6]">· {item.lead_name}</span>
                    </span>
                    <span className="text-xs text-[#8C99AE]">{formatDate(item.due_at)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[#99A4B6]">Nenhum lembrete vinculado a leads.</div>
            )}
          </Card>
          <Card className="rounded-[22px] border-[#E3E8F1] bg-white p-5">
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-1 h-5 w-5 text-[#1CAA87]" />
              <div>
                <h2 className="font-extrabold text-[#18294D]">Meu WhatsApp de avisos</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#8896AA]">
                  Opcional: autorize um resumo de avisos da Star no seu número pessoal. Sem
                  autorização, você continuará recebendo avisos pelo CRM.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="space-y-1.5 text-xs font-semibold text-[#697892]">
                Telefone com DDI e DDD
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setOptIn(false);
                    setContactEdited(true);
                  }}
                  placeholder="5511999999999"
                  className="block h-10 w-[220px] rounded-lg border border-[#DAE2F0] px-3 text-sm"
                />
              </label>
              <label className="flex max-w-lg cursor-pointer items-start gap-2 text-xs leading-5 text-[#6F7B91]">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={optIn}
                  onChange={(e) => {
                    setOptIn(e.target.checked);
                    setContactEdited(true);
                  }}
                />
                Autorizo receber resumos relacionados ao meu trabalho pelo WhatsApp. Posso desativar
                aqui quando quiser.
              </label>
              <Button variant="outline" disabled={working} onClick={() => void savePhone()}>
                Salvar preferência
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {view === "team" && data?.canManage ? (
        <div className="space-y-4">
          <Card className="rounded-[22px] border-[#E3E8F1] bg-white p-5">
            <h2 className="mb-4 text-lg font-extrabold text-[#18294D]">
              Acompanhamento por consultor
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-[#8C99AE]">
                    <th className="pb-3">Consultor</th>
                    <th className="pb-3 text-right">Tarefas</th>
                    <th className="pb-3 text-right">Concluídas</th>
                    <th className="pb-3 text-right">Atrasadas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-3 font-semibold text-[#28395A]">{row.name}</td>
                      <td className="py-3 text-right">{row.total}</td>
                      <td className="py-3 text-right text-emerald-700">{row.done}</td>
                      <td className="py-3 text-right font-semibold text-rose-600">{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="rounded-[22px] border-[#E3E8F1] bg-white p-5">
            <h2 className="mb-4 text-lg font-extrabold text-[#18294D]">
              Execução individual da equipe
            </h2>
            <div className="space-y-2">
              {data.assignments.slice(0, 200).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E6EBF4] p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#28395A]">{row.title}</p>
                    <p className="mt-1 text-xs text-[#8C99AE]">
                      {row.recipient_name} · {formatDate(row.due_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      row.status === "done"
                        ? "bg-emerald-50 text-emerald-700"
                        : new Date(row.due_at) < new Date()
                          ? "bg-rose-50 text-rose-600"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {row.status === "done"
                      ? "Concluída"
                      : new Date(row.due_at) < new Date()
                        ? "Atrasada"
                        : "Pendente"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {view === "repeat" && data?.canManage ? (
        <Card className="rounded-[22px] border-[#E3E8F1] bg-white p-5">
          <h2 className="mb-4 text-lg font-extrabold text-[#18294D]">
            Tarefas criadas pela gestão
          </h2>
          <div className="space-y-3">
            {data.tasks.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E6EBF4] p-4"
              >
                <div className="max-w-2xl">
                  <p className="font-bold text-[#28395A]">{item.title}</p>
                  <p className="mt-1 text-xs text-[#8C99AE]">
                    {scopedLabel[item.scope]} · {repeatLabel[item.recurrence]} ·{" "}
                    {item.assigned_count} atribuições · {item.done_count} concluídas
                  </p>
                  {item.description ? (
                    <p className="mt-2 text-xs text-[#687690]">{item.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-[#8C99AE]">
                    Status: {item.status === "active" ? "Ativa" : "Pausada"} · Próxima:{" "}
                    {item.next_due_at ? formatDate(item.next_due_at) : "Sem próximas ocorrências"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() =>
                      void action(
                        {
                          action: "task_status",
                          taskId: item.id,
                          status: item.status === "active" ? "paused" : "active",
                        },
                        item.status === "active" ? "Tarefa pausada." : "Tarefa reativada.",
                      )
                    }
                  >
                    {item.status === "active" ? (
                      <PauseCircle className="mr-1.5 h-4 w-4" />
                    ) : (
                      <PlayCircle className="mr-1.5 h-4 w-4" />
                    )}
                    {item.status === "active" ? "Pausar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    className="text-rose-600"
                    onClick={() => {
                      if (window.confirm("Arquivar esta série e ocultar suas tarefas?"))
                        void action(
                          { action: "task_status", taskId: item.id, status: "archived" },
                          "Tarefa arquivada.",
                        );
                    }}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Arquivar
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {!data.tasks.length ? (
            <p className="text-sm text-[#91A0B7]">Nenhuma tarefa criada ainda.</p>
          ) : null}
        </Card>
      ) : null}
      {data?.canManage ? (
        <Link
          to="/gestao/comunicacao"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#3568DE] hover:underline"
        >
          <ShieldCheck className="h-4 w-4" /> Configurar alertas e WhatsApp da gestão
        </Link>
      ) : null}
    </div>
  );
}
