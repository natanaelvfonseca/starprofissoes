import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Inbox,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  canAccessSystemFeedback,
  canManageSystemFeedback,
  canSubmitSystemFeedback,
  ROLE_LABELS,
} from "@/lib/auth-types";
import {
  SYSTEM_FEEDBACK_CATEGORIES,
  SYSTEM_FEEDBACK_PRIORITIES,
  SYSTEM_FEEDBACK_STATUSES,
  systemFeedbackCategoryLabels,
  systemFeedbackPriorityLabels,
  systemFeedbackStatusLabels,
  type SystemFeedbackCategory,
  type SystemFeedbackPriority,
  type SystemFeedbackStatus,
  type SystemFeedbackTicket,
} from "@/lib/system-feedback-types";
import { cn } from "@/lib/utils";

type FeedbackResponse = {
  tickets: Array<SystemFeedbackTicket>;
  canSubmit: boolean;
  canManage: boolean;
};

type CreateFeedbackResponse = {
  ticket: SystemFeedbackTicket;
};

type FeedbackFormState = {
  title: string;
  category: SystemFeedbackCategory;
  priority: SystemFeedbackPriority;
  description: string;
};

type TicketDraft = {
  status: SystemFeedbackStatus;
  priority: SystemFeedbackPriority;
  teamNote: string;
};

const initialForm: FeedbackFormState = {
  title: "",
  category: "melhoria",
  priority: "media",
  description: "",
};

const statusTone: Record<SystemFeedbackStatus, string> = {
  novo: "border-primary/20 bg-primary/10 text-primary",
  em_analise: "border-gold/30 bg-gold/15 text-gold-foreground",
  planejado: "border-blue-500/20 bg-blue-500/10 text-blue-700",
  concluido: "border-success/25 bg-success/10 text-success",
  arquivado: "border-muted bg-muted/70 text-muted-foreground",
};

const priorityTone: Record<SystemFeedbackPriority, string> = {
  baixa: "border-muted bg-muted/60 text-muted-foreground",
  media: "border-primary/15 bg-primary/10 text-primary",
  alta: "border-gold/35 bg-gold/15 text-gold-foreground",
  urgente: "border-destructive/30 bg-destructive/10 text-destructive",
};

const categoryIcon: Record<SystemFeedbackCategory, React.ComponentType<{ className?: string }>> = {
  melhoria: Sparkles,
  ajuste: Settings2,
  erro: AlertCircle,
  ideia: Lightbulb,
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível concluir a ação.");
  }

  return data;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const Route = createFileRoute("/feedback")({
  head: () => ({ meta: [{ title: "Feedback do Sistema | Star Profissões" }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const canAccess = session ? canAccessSystemFeedback(session.user.role) : false;
  const canSubmitByRole = session ? canSubmitSystemFeedback(session.user.role) : false;
  const canManageByRole = session ? canManageSystemFeedback(session.user.role) : false;
  const [tickets, setTickets] = React.useState<Array<SystemFeedbackTicket>>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [canSubmit, setCanSubmit] = React.useState(canSubmitByRole);
  const [canManage, setCanManage] = React.useState(canManageByRole);
  const [form, setForm] = React.useState<FeedbackFormState>(initialForm);
  const [drafts, setDrafts] = React.useState<Record<string, TicketDraft>>({});

  const loadFeedback = React.useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!canAccess) {
        setTickets([]);
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const data = await readJson<FeedbackResponse>(
          await fetch("/api/system-feedback", {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );

        setTickets(data.tickets);
        setCanSubmit(data.canSubmit);
        setCanManage(data.canManage);
        setDrafts((current) => {
          const next: Record<string, TicketDraft> = {};

          data.tickets.forEach((ticket) => {
            next[ticket.id] = current[ticket.id] ?? {
              status: ticket.status,
              priority: ticket.priority,
              teamNote: ticket.teamNote,
            };
          });

          return next;
        });
      } catch (error) {
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar feedbacks.");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [canAccess],
  );

  React.useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const summary = React.useMemo(
    () => ({
      total: tickets.length,
      newTickets: tickets.filter((ticket) => ticket.status === "novo").length,
      activeTickets: tickets.filter((ticket) =>
        ["novo", "em_analise", "planejado"].includes(ticket.status),
      ).length,
      doneTickets: tickets.filter((ticket) => ticket.status === "concluido").length,
    }),
    [tickets],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeUnitId) {
      toast.error("Selecione uma unidade ativa.");
      return;
    }

    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Preencha o título e a descrição do feedback.");
      return;
    }

    setSubmitting(true);

    try {
      const data = await readJson<CreateFeedbackResponse>(
        await fetch("/api/system-feedback", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...form, unitId: activeUnitId }),
        }),
      );

      setTickets((current) => [data.ticket, ...current]);
      setForm(initialForm);
      toast.success("Feedback enviado para a equipe Star.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(ticket: SystemFeedbackTicket) {
    const draft = drafts[ticket.id];

    if (!draft) {
      return;
    }

    setUpdatingId(ticket.id);

    try {
      const data = await readJson<CreateFeedbackResponse>(
        await fetch("/api/system-feedback", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ticketId: ticket.id,
            status: draft.status,
            priority: draft.priority,
            teamNote: draft.teamNote,
          }),
        }),
      );

      setTickets((current) =>
        current.map((item) => (item.id === data.ticket.id ? data.ticket : item)),
      );
      setDrafts((current) => ({
        ...current,
        [data.ticket.id]: {
          status: data.ticket.status,
          priority: data.ticket.priority,
          teamNote: data.ticket.teamNote,
        },
      }));
      toast.success("Ticket atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar ticket.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(ticket: SystemFeedbackTicket) {
    if (!window.confirm(`Remover o ticket "${ticket.title}"?`)) {
      return;
    }

    setDeletingId(ticket.id);

    try {
      await readJson<{ ok: true }>(
        await fetch("/api/system-feedback", {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ticketId: ticket.id }),
        }),
      );

      setTickets((current) => current.filter((item) => item.id !== ticket.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[ticket.id];
        return next;
      });
      toast.success("Ticket removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover ticket.");
    } finally {
      setDeletingId(null);
    }
  }

  if (session && !canAccess) {
    return <FeedbackAccessDenied />;
  }

  const isTeamView = canManage;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <PageHeader
        eyebrow="Sistema"
        title="Feedback do Sistema"
        description={
          isTeamView
            ? "Fila de melhorias, ajustes e ideias enviadas pela liderança das unidades."
            : "Envie melhorias, ajustes ou problemas para a equipe Star acompanhar como ticket."
        }
        actions={
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => loadFeedback()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      <section className="relative overflow-hidden rounded-xl bg-[linear-gradient(135deg,#07154C_0%,#16006C_52%,#224C99_100%)] p-5 text-white shadow-[0_28px_90px_-48px_rgba(22,0,108,0.72)] md:p-6">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,rgba(255,255,255,.14)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.1)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="absolute right-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="relative grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_360px] md:items-center">
          <div className="min-w-0">
            <Badge className="border-white/20 bg-white/10 text-white">
              <MessageSquarePlus className="mr-1 h-3.5 w-3.5 text-gold" />
              Tickets internos
            </Badge>
            <h2 className="mt-4 max-w-3xl text-2xl font-black leading-tight md:text-4xl">
              Transforme sugestões da liderança em melhorias rastreáveis.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
              Cada feedback fica registrado com unidade, responsável, prioridade e status para o
              equipe Star decidir o próximo passo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <HeroMetric label="Total" value={summary.total} icon={Inbox} />
            <HeroMetric label="Novos" value={summary.newTickets} icon={Clock3} />
            <HeroMetric label="Em aberto" value={summary.activeTickets} icon={AlertCircle} />
            <HeroMetric label="Concluídos" value={summary.doneTickets} icon={CheckCircle2} />
          </div>
        </div>
      </section>

      <div className={cn("grid min-w-0 gap-6", canSubmit && "xl:grid-cols-[420px_minmax(0,1fr)]")}>
        {canSubmit ? (
          <Card className="min-w-0 overflow-hidden border-primary/15 shadow-elegant">
            <CardHeader className="border-b bg-[linear-gradient(135deg,#16006C_0%,#224C99_100%)] p-5 text-white">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-gold" />
                Novo feedback
              </CardTitle>
              <p className="text-sm text-white/70">
                Descreva o ajuste com contexto para a equipe Star entender a necessidade.
              </p>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback-title">Título</Label>
                  <Input
                    id="feedback-title"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Ex.: Ajustar visualização do ranking no mobile"
                    maxLength={140}
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          category: value as SystemFeedbackCategory,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYSTEM_FEEDBACK_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {systemFeedbackCategoryLabels[category]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select
                      value={form.priority}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          priority: value as SystemFeedbackPriority,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYSTEM_FEEDBACK_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {systemFeedbackPriorityLabels[priority]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feedback-description">Descrição</Label>
                  <Textarea
                    id="feedback-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Explique o que precisa mudar, onde acontece e o impacto para a operação."
                    className="min-h-36"
                    maxLength={2400}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 bg-gradient-primary"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitting ? "Enviando..." : "Enviar feedback"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <section className="min-w-0 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">
                {isTeamView ? "Fila da equipe Star" : "Meus feedbacks"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isTeamView
                  ? "Acompanhe o que foi solicitado pela liderança."
                  : "Veja o status do que você enviou."}
              </p>
            </div>
            <Badge variant="secondary" className="w-fit bg-primary/10 text-primary">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </Badge>
          </div>

          {loading ? (
            <Card className="shadow-card">
              <CardContent className="flex min-h-[260px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : tickets.length ? (
            <div className="grid min-w-0 gap-4">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  draft={drafts[ticket.id]}
                  canManage={canManage}
                  updating={updatingId === ticket.id}
                  deleting={deletingId === ticket.id}
                  onDraftChange={(draft) =>
                    setDrafts((current) => ({
                      ...current,
                      [ticket.id]: {
                        status: draft.status ?? current[ticket.id]?.status ?? ticket.status,
                        priority: draft.priority ?? current[ticket.id]?.priority ?? ticket.priority,
                        teamNote:
                          draft.teamNote ?? current[ticket.id]?.teamNote ?? ticket.teamNote,
                      },
                    }))
                  }
                  onUpdate={() => handleUpdate(ticket)}
                  onDelete={() => handleDelete(ticket)}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed shadow-card">
              <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground" />
                <h3 className="mt-3 text-base font-bold">Nenhum feedback registrado</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Quando a liderança enviar uma melhoria ou ajuste, o ticket aparecerá aqui.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur">
      <div className="flex items-center gap-2 text-white/70">
        <Icon className="h-4 w-4 text-gold" />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function TicketCard({
  ticket,
  draft,
  canManage,
  updating,
  deleting,
  onDraftChange,
  onUpdate,
  onDelete,
}: {
  ticket: SystemFeedbackTicket;
  draft?: TicketDraft;
  canManage: boolean;
  updating: boolean;
  deleting: boolean;
  onDraftChange: (draft: Partial<TicketDraft>) => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const Icon = categoryIcon[ticket.category];
  const effectiveDraft = draft ?? {
    status: ticket.status,
    priority: ticket.priority,
    teamNote: ticket.teamNote,
  };

  return (
    <Card className="min-w-0 overflow-hidden border-primary/10 shadow-card">
      <CardContent className="p-0">
        <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={statusTone[ticket.status]}>
                    {systemFeedbackStatusLabels[ticket.status]}
                  </Badge>
                  <Badge variant="outline" className={priorityTone[ticket.priority]}>
                    {systemFeedbackPriorityLabels[ticket.priority]}
                  </Badge>
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    <Icon className="mr-1 h-3.5 w-3.5" />
                    {systemFeedbackCategoryLabels[ticket.category]}
                  </Badge>
                </div>
                <h3 className="mt-3 break-words text-lg font-black leading-tight text-foreground">
                  {ticket.title}
                </h3>
              </div>
              <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                <div>{formatDate(ticket.createdAt)}</div>
                <div className="mt-1">{ticket.unitName ?? "Sem unidade"}</div>
              </div>
            </div>

            <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
              {ticket.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                {ticket.createdByName ?? "Usuário removido"}
              </Badge>
              {ticket.createdByRole ? (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  {ROLE_LABELS[ticket.createdByRole]}
                </Badge>
              ) : null}
            </div>

            {ticket.teamNote && !canManage ? (
              <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-3">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  Retorno da equipe Star
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {ticket.teamNote}
                </p>
              </div>
            ) : null}
          </div>

          {canManage ? (
            <div className="min-w-0 border-t bg-[linear-gradient(180deg,rgba(255,244,234,.56),rgba(255,255,255,.88))] p-4 lg:border-l lg:border-t-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={effectiveDraft.status}
                    onValueChange={(value) =>
                      onDraftChange({ status: value as SystemFeedbackStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FEEDBACK_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {systemFeedbackStatusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select
                    value={effectiveDraft.priority}
                    onValueChange={(value) =>
                      onDraftChange({ priority: value as SystemFeedbackPriority })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FEEDBACK_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {systemFeedbackPriorityLabels[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <Label>Retorno da equipe Star</Label>
                <Textarea
                  value={effectiveDraft.teamNote}
                  onChange={(event) => onDraftChange({ teamNote: event.target.value })}
                  placeholder="Escreva uma observação interna ou retorno para a liderança."
                  className="min-h-28 bg-white/80"
                  maxLength={1600}
                />
              </div>

              <Button
                type="button"
                onClick={onUpdate}
                disabled={updating || deleting}
                className="mt-3 w-full gap-2 bg-gradient-primary"
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {updating ? "Salvando..." : "Salvar ticket"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onDelete}
                disabled={updating || deleting}
                className="mt-2 w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Removendo..." : "Remover ticket"}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedbackAccessDenied() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Feedback do sistema fica disponível para Dev, CEO, CVO, Diretor, Gerente e Marketing.
        </p>
      </div>
    </div>
  );
}
