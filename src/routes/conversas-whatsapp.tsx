import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth";
import { getInitials, ROLE_LABELS, type UserRole } from "@/lib/auth-types";
import type { WhatsappDeliveryStatus } from "@/lib/whatsapp-message-status";
import type {
  WhatsappInterventionNotification,
  WhatsappSupervisionConsultant,
  WhatsappSupervisionConversation,
  WhatsappSupervisionMessage,
} from "@/lib/whatsapp-supervision-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conversas-whatsapp")({
  component: WhatsappConversationsPage,
});

const LIVE_REFRESH_MS = 5_000;
const CONSULTANTS_REFRESH_MS = 30_000;

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok && response.status !== 202) {
    throw new Error(data.error || "Falha na requisição.");
  }
  return data;
}

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function listTime(value: string | null) {
  const date = validDate(value);
  if (!date) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function messageTime(value: string) {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date)
    : "";
}

function dayLabel(value: string) {
  const date = validDate(value);
  if (!date) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function dayKey(value: string) {
  const date = validDate(value);
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : value;
}

function formatPhone(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return value || "Número ainda não identificado";
}

function mediaLabel(type: WhatsappSupervisionMessage["type"]) {
  if (type === "audio") return "Áudio";
  if (type === "image") return "Imagem";
  if (type === "video") return "Vídeo";
  if (type === "document") return "Documento";
  return "Mensagem";
}

function genericMediaCaption(content: string, type: WhatsappSupervisionMessage["type"]) {
  const normalized = content.trim().toLocaleLowerCase("pt-BR");
  return [
    `[${type}]`,
    `[${mediaLabel(type).toLocaleLowerCase("pt-BR")}]`,
    mediaLabel(type).toLocaleLowerCase("pt-BR"),
  ].includes(normalized);
}

function conversationPreview(conversation: WhatsappSupervisionConversation) {
  if (conversation.messageType === "audio") return "🎙️ Áudio";
  if (conversation.messageType === "image") return "📷 Imagem";
  if (conversation.messageType === "video") return "🎥 Vídeo";
  if (conversation.messageType === "document") return "📄 Documento";
  return conversation.lastMessage;
}

function WhatsappConversationsPage() {
  const { session } = useAuth();
  if (session?.user.role === "CONSULTOR") return <ConsultantInterventions />;
  if (!session?.features.whatsappSupervision) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center text-center">
        <div>
          <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">Função ainda não liberada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A supervisão do WhatsApp está em liberação gradual.
          </p>
        </div>
      </div>
    );
  }
  return <LeadershipInbox />;
}

function LeadershipInbox() {
  const { session } = useAuth();
  const [consultants, setConsultants] = React.useState<Array<WhatsappSupervisionConsultant>>([]);
  const [conversations, setConversations] = React.useState<Array<WhatsappSupervisionConversation>>(
    [],
  );
  const [messages, setMessages] = React.useState<Array<WhatsappSupervisionMessage>>([]);
  const [consultantId, setConsultantId] = React.useState("");
  const [conversationId, setConversationId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadingConversations, setLoadingConversations] = React.useState(false);
  const [loadingConversation, setLoadingConversation] = React.useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = React.useState(false);
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [analysisOpen, setAnalysisOpen] = React.useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const [newMessagesBelow, setNewMessagesBelow] = React.useState(false);
  const [status, setStatus] = React.useState<{
    pendingJobs: number;
    failedJobs: number;
    pendingSends: number;
    lastSyncAt: string | null;
  } | null>(null);
  const [roles, setRoles] = React.useState<Array<{ role: UserRole; enabled: boolean }>>([]);
  const [selectedUnitId, setSelectedUnitId] = React.useState(session?.activeUnit?.id || "");
  const messagesRequestRef = React.useRef(0);
  const conversationsRequestRef = React.useRef(0);
  const chatViewportRef = React.useRef<HTMLDivElement>(null);
  const stickToBottomRef = React.useRef(true);
  const previousConversationRef = React.useRef("");

  const selectedConversation = conversations.find((item) => item.id === conversationId) ?? null;
  const selectedConsultant = consultants.find(
    (item) => item.id === consultantId && (!selectedUnitId || item.unitId === selectedUnitId),
  );

  const loadConsultants = React.useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      try {
        const unitId = selectedUnitId || session?.activeUnit?.id;
        const data = await requestJson<{ consultants: Array<WhatsappSupervisionConsultant> }>(
          `/api/whatsapp-supervision${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ""}`,
        );
        setConsultants(data.consultants);
        setConsultantId((current) =>
          data.consultants.some((item) => item.id === current)
            ? current
            : data.consultants[0]?.id || "",
        );
        if (session?.user.role === "DEV" && !options.silent) {
          const [statusData, accessData] = await Promise.all([
            requestJson<{ status: typeof status }>("/api/whatsapp-supervision?view=status"),
            requestJson<{ roles: Array<{ role: UserRole; enabled: boolean }> }>(
              "/api/whatsapp-supervision/access",
            ),
          ]);
          setStatus(statusData.status);
          setRoles(accessData.roles);
        }
      } catch (error) {
        if (!options.silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar consultores.");
        }
      } finally {
        if (!options.silent) setLoading(false);
      }
    },
    [selectedUnitId, session?.activeUnit?.id, session?.user.role],
  );

  const loadConversations = React.useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!consultantId) {
        setConversations([]);
        return;
      }
      const requestId = ++conversationsRequestRef.current;
      if (!options.silent) setLoadingConversations(true);
      const params = new URLSearchParams({ view: "conversations", consultantId, limit: "100" });
      if (selectedUnitId) params.set("unitId", selectedUnitId);
      if (search.trim()) params.set("search", search.trim());
      try {
        const data = await requestJson<{
          conversations: Array<WhatsappSupervisionConversation>;
        }>(`/api/whatsapp-supervision?${params}`);
        if (requestId !== conversationsRequestRef.current) return;
        setConversations(data.conversations);
        setConversationId((current) =>
          data.conversations.some((item) => item.id === current)
            ? current
            : data.conversations[0]?.id || "",
        );
      } catch (error) {
        if (!options.silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar conversas.");
        }
      } finally {
        if (!options.silent && requestId === conversationsRequestRef.current) {
          setLoadingConversations(false);
        }
      }
    },
    [consultantId, search, selectedUnitId],
  );

  const loadMessages = React.useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!conversationId) {
        setMessages([]);
        return;
      }
      const selectedId = conversationId;
      const requestId = ++messagesRequestRef.current;
      if (!options.silent) setLoadingConversation(true);
      try {
        const data = await requestJson<{ messages: Array<WhatsappSupervisionMessage> }>(
          `/api/whatsapp-supervision/conversations/${selectedId}`,
        );
        if (requestId !== messagesRequestRef.current || selectedId !== conversationId) return;
        setMessages((current) => {
          const oldLastId = current.at(-1)?.id;
          const newLastId = data.messages.at(-1)?.id;
          if (oldLastId && newLastId && oldLastId !== newLastId && !stickToBottomRef.current) {
            setNewMessagesBelow(true);
          }
          if (!options.silent) return data.messages;
          const merged = new Map(current.map((message) => [message.id, message]));
          data.messages.forEach((message) => merged.set(message.id, message));
          return Array.from(merged.values()).sort(
            (first, second) => new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime(),
          );
        });
        if (!options.silent) setHasOlderMessages(data.messages.length === 60);
        setLastUpdatedAt(new Date());
      } catch (error) {
        if (!options.silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar mensagens.");
        }
      } finally {
        if (!options.silent && requestId === messagesRequestRef.current) {
          setLoadingConversation(false);
        }
      }
    },
    [conversationId],
  );

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadConsultants({ silent: true }),
      loadConversations({ silent: true }),
      loadMessages({ silent: true }),
    ]);
    setRefreshing(false);
  }, [loadConsultants, loadConversations, loadMessages]);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setNewMessagesBelow(false);
  }, []);

  async function loadOlderMessages() {
    const oldest = messages[0];
    const viewport = chatViewportRef.current;
    if (!conversationId || !oldest || loadingOlderMessages) return;
    const previousHeight = viewport?.scrollHeight ?? 0;
    setLoadingOlderMessages(true);
    try {
      const data = await requestJson<{ messages: Array<WhatsappSupervisionMessage> }>(
        `/api/whatsapp-supervision/conversations/${conversationId}?before=${encodeURIComponent(oldest.sentAt)}`,
      );
      setMessages((current) => {
        const merged = new Map<string, WhatsappSupervisionMessage>();
        data.messages.forEach((message) => merged.set(message.id, message));
        current.forEach((message) => merged.set(message.id, message));
        return Array.from(merged.values()).sort(
          (first, second) => new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime(),
        );
      });
      setHasOlderMessages(data.messages.length === 60);
      window.requestAnimationFrame(() => {
        if (viewport) viewport.scrollTop = viewport.scrollHeight - previousHeight;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar mensagens antigas.");
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  React.useEffect(() => {
    void loadConsultants();
  }, [loadConsultants]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadConversations(), 250);
    return () => window.clearTimeout(timer);
  }, [loadConversations]);

  React.useEffect(() => {
    stickToBottomRef.current = true;
    setNewMessagesBelow(false);
    setHasOlderMessages(false);
    setMessages([]);
    void loadMessages();
  }, [conversationId, loadMessages]);

  React.useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") {
        void loadConversations({ silent: true });
        void loadMessages({ silent: true });
      }
    };
    const liveTimer = window.setInterval(refreshVisible, LIVE_REFRESH_MS);
    const consultantsTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadConsultants({ silent: true });
    }, CONSULTANTS_REFRESH_MS);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(liveTimer);
      window.clearInterval(consultantsTimer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadConsultants, loadConversations, loadMessages]);

  React.useLayoutEffect(() => {
    const changedConversation = previousConversationRef.current !== conversationId;
    previousConversationRef.current = conversationId;
    if (changedConversation || stickToBottomRef.current) {
      window.requestAnimationFrame(() => scrollToBottom(changedConversation ? "auto" : "smooth"));
    }
  }, [conversationId, messages, scrollToBottom]);

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!conversationId || !reply.trim()) return;
    setSending(true);
    stickToBottomRef.current = true;
    try {
      const data = await requestJson<{ intervention: { status: string } }>(
        `/api/whatsapp-supervision/conversations/${conversationId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientRequestId: crypto.randomUUID(), text: reply.trim() }),
        },
      );
      setReply("");
      await Promise.all([loadMessages({ silent: true }), loadConversations({ silent: true })]);
      if (data.intervention.status === "pending") {
        toast.info("Envio aguardando confirmação da Evolution; ele não será repetido.");
      } else {
        toast.success("Mensagem enviada e intervenção registrada.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar.");
    } finally {
      setSending(false);
    }
  }

  async function toggleRole(role: UserRole, enabled: boolean) {
    try {
      const data = await requestJson<{
        roles: Array<{ role: UserRole; enabled: boolean }>;
      }>("/api/whatsapp-supervision/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, enabled }),
      });
      setRoles(data.roles);
      toast.success(`${ROLE_LABELS[role]} ${enabled ? "liberado" : "bloqueado"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar acesso.");
    }
  }

  const liveLabel = lastUpdatedAt
    ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`
    : "Sincronização automática ativa";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Comercial"
        title="Conversas WhatsApp"
        description="Acompanhe as conversas da equipe, responda com auditoria e consulte a análise da IA."
        actions={
          <>
            {session && session.units.length > 1 ? (
              <Select
                value={selectedUnitId}
                onValueChange={(value) => {
                  setSelectedUnitId(value);
                  setConsultantId("");
                  setConversationId("");
                }}
              >
                <SelectTrigger className="w-56 bg-background">
                  <SelectValue placeholder="Selecionar unidade" />
                </SelectTrigger>
                <SelectContent>
                  {session.units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" onClick={() => void refreshAll()} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Atualizar
            </Button>
          </>
        }
      />

      {session?.user.role === "DEV" && (status || roles.length) ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
            <div className="mr-auto">
              <div className="text-sm font-bold">Operação e liberação</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {status
                  ? `${status.pendingJobs} análises pendentes · ${status.failedJobs} falhas · ${status.pendingSends} envios a confirmar`
                  : ""}
              </div>
            </div>
            {roles.map((item) => (
              <label key={item.role} className="flex items-center gap-2 text-xs font-semibold">
                <Switch
                  checked={item.enabled}
                  disabled={item.role === "DEV"}
                  onCheckedChange={(checked) => void toggleRole(item.role, checked)}
                />
                {ROLE_LABELS[item.role]}
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm xl:grid xl:h-[calc(100vh-190px)] xl:min-h-[680px] xl:max-h-[920px] xl:grid-cols-[250px_340px_minmax(440px,1fr)]">
        <section className="flex min-h-0 flex-col border-b xl:border-r xl:border-b-0">
          <div className="border-b px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">Equipe</h2>
                <p className="text-xs text-muted-foreground">{consultants.length} consultores</p>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" /> Ao vivo
              </span>
            </div>
          </div>
          <ScrollArea className="h-[230px] xl:h-auto xl:flex-1">
            <div className="space-y-1.5 p-2">
              {loading ? (
                <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
              ) : consultants.length ? (
                consultants.map((item) => {
                  const active = consultantId === item.id;
                  const connected = item.status === "connected";
                  return (
                    <button
                      key={`${item.unitId}:${item.id}`}
                      type="button"
                      onClick={() => {
                        setConsultantId(item.id);
                        setConversationId("");
                        setSearch("");
                      }}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition-colors hover:bg-muted/70",
                        active && "border-primary/15 bg-primary/8",
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10 border bg-background">
                          <AvatarImage src={item.avatarUrl || undefined} />
                          <AvatarFallback>{getInitials(item.name)}</AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-card",
                            connected ? "bg-sky-500" : "bg-slate-300",
                          )}
                        />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {item.conversationCount} conversas ·{" "}
                          {connected ? "Conectado" : "Desconectado"}
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <EmptyPanel
                  icon={Smartphone}
                  title="Nenhum consultor conectado"
                  description="Conecte uma instância Star nesta unidade para iniciar."
                />
              )}
            </div>
          </ScrollArea>
        </section>

        <section className="flex min-h-0 flex-col border-b xl:border-r xl:border-b-0">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome ou telefone"
                className="bg-background pr-9 pl-9"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  className="absolute top-2 right-3 text-lg leading-none text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span>{selectedConsultant?.name || "Selecione um consultor"}</span>
              <span>{conversations.length} contatos</span>
            </div>
          </div>
          <ScrollArea className="h-[330px] xl:h-auto xl:flex-1">
            {loadingConversations ? (
              <Loader2 className="mx-auto mt-16 h-5 w-5 animate-spin text-muted-foreground" />
            ) : conversations.length ? (
              <div className="divide-y">
                {conversations.map((item) => (
                  <ConversationItem
                    key={item.id}
                    conversation={item}
                    active={conversationId === item.id}
                    onClick={() => {
                      stickToBottomRef.current = true;
                      setConversationId(item.id);
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={MessageCircleMore}
                title={search ? "Nenhum contato encontrado" : "Nenhuma conversa"}
                description={
                  search
                    ? "Tente buscar por outro nome ou telefone."
                    : "As conversas aparecerão assim que forem sincronizadas."
                }
              />
            )}
          </ScrollArea>
        </section>

        <section className="flex min-h-[680px] min-w-0 flex-col bg-slate-50/50 xl:min-h-0">
          {selectedConversation ? (
            <>
              <ConversationHeader
                conversation={selectedConversation}
                consultant={selectedConsultant}
                liveLabel={liveLabel}
                analysisOpen={analysisOpen}
                onToggleAnalysis={() => setAnalysisOpen((current) => !current)}
              />
              {analysisOpen && selectedConversation.latestAnalysis ? (
                <AnalysisSummary conversation={selectedConversation} />
              ) : null}
              <div className="relative min-h-0 flex-1">
                <div
                  ref={chatViewportRef}
                  onScroll={(event) => {
                    const viewport = event.currentTarget;
                    const distance =
                      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
                    stickToBottomRef.current = distance < 120;
                    if (distance < 120) setNewMessagesBelow(false);
                  }}
                  className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
                >
                  {loadingConversation ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length ? (
                    <>
                      {hasOlderMessages ? (
                        <div className="mb-3 flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={loadingOlderMessages}
                            onClick={() => void loadOlderMessages()}
                            className="rounded-full bg-background text-xs"
                          >
                            {loadingOlderMessages ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Carregar mensagens anteriores
                          </Button>
                        </div>
                      ) : null}
                      <MessageTimeline messages={messages} />
                    </>
                  ) : (
                    <EmptyPanel
                      icon={MessageCircleMore}
                      title="Conversa sem mensagens"
                      description="Aguardando a primeira mensagem sincronizada."
                    />
                  )}
                </div>
                {newMessagesBelow ? (
                  <button
                    type="button"
                    onClick={() => scrollToBottom()}
                    className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-xs font-semibold shadow-lg"
                  >
                    Novas mensagens <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <form onSubmit={sendReply} className="border-t bg-background p-3">
                <div className="flex items-end gap-2 rounded-2xl border bg-muted/25 p-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                  <Textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    maxLength={4000}
                    rows={1}
                    placeholder="Digite uma mensagem"
                    className="max-h-32 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full"
                    disabled={
                      sending || !reply.trim() || selectedConsultant?.status !== "connected"
                    }
                    title={
                      selectedConsultant?.status === "connected"
                        ? "Enviar mensagem"
                        : "WhatsApp do consultor desconectado"
                    }
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="mt-1.5 flex justify-between gap-3 px-1 text-[10px] text-muted-foreground">
                  <span>Enter envia · Shift + Enter quebra a linha</span>
                  <span>{reply.length}/4000 · intervenção identificada internamente</span>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyPanel
                icon={MessageCircleMore}
                title="Selecione uma conversa"
                description="Escolha um consultor e um contato para acompanhar o atendimento."
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex max-w-64 flex-col items-center justify-center px-5 py-14 text-center">
      <span className="rounded-2xl bg-muted p-3">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function ContactAvatar({
  conversation,
  className,
}: {
  conversation: WhatsappSupervisionConversation;
  className?: string;
}) {
  return (
    <Avatar className={cn("border bg-background", className)}>
      <AvatarImage src={conversation.profilePictureUrl || undefined} alt="" />
      <AvatarFallback className="bg-slate-100 text-slate-700">
        {getInitials(conversation.contactName)}
      </AvatarFallback>
    </Avatar>
  );
}

function ConversationItem({
  conversation,
  active,
  onClick,
}: {
  conversation: WhatsappSupervisionConversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full px-3 py-3.5 text-left transition-colors hover:bg-muted/60",
        active && "bg-primary/8 hover:bg-primary/10",
      )}
    >
      <div className="flex items-start gap-3">
        <ContactAvatar conversation={conversation} className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {conversation.contactName}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {listTime(conversation.lastMessageAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {conversationPreview(conversation)}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            {conversation.lead ? (
              <Badge variant="secondary" className="max-w-40 truncate text-[9px] font-medium">
                {conversation.lead.courseName || "Lead no CRM"}
              </Badge>
            ) : null}
            {conversation.latestAnalysis ? (
              <Badge variant="outline" className="text-[9px] font-medium">
                <Bot className="mr-1 h-2.5 w-2.5" />
                {conversation.latestAnalysis.score === null
                  ? "Sem nota"
                  : `${conversation.latestAnalysis.score}/100`}
              </Badge>
            ) : null}
            <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
              {conversation.messageCount} msgs
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ConversationHeader({
  conversation,
  consultant,
  liveLabel,
  analysisOpen,
  onToggleAnalysis,
}: {
  conversation: WhatsappSupervisionConversation;
  consultant?: WhatsappSupervisionConsultant;
  liveLabel: string;
  analysisOpen: boolean;
  onToggleAnalysis: () => void;
}) {
  const connected = consultant?.status === "connected";
  return (
    <div className="border-b bg-background px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <ContactAvatar conversation={conversation} className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold sm:text-base">{conversation.contactName}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{formatPhone(conversation.phone)}</span>
            {conversation.lead?.courseName ? <span>· {conversation.lead.courseName}</span> : null}
            <span>· atendido por {consultant?.name || "consultor"}</span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div
            className={cn(
              "flex items-center justify-end gap-1.5 text-[11px] font-medium",
              connected ? "text-sky-700" : "text-muted-foreground",
            )}
          >
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? "Conectado" : "Desconectado"}
          </div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">{liveLabel}</div>
        </div>
        {conversation.latestAnalysis ? (
          <Button
            type="button"
            variant={analysisOpen ? "secondary" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={onToggleAnalysis}
          >
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Análise IA</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", analysisOpen && "rotate-180")}
            />
          </Button>
        ) : (
          <Badge variant="outline" className="hidden shrink-0 font-normal sm:flex">
            IA pendente
          </Badge>
        )}
      </div>
    </div>
  );
}

function AnalysisSummary({ conversation }: { conversation: WhatsappSupervisionConversation }) {
  const analysis = conversation.latestAnalysis!;
  return (
    <div className="border-b bg-background px-4 py-3 sm:px-5">
      <div className="max-h-52 overflow-y-auto rounded-xl border bg-slate-50 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Bot className="h-4 w-4 text-primary" /> Análise da conversa
          </div>
          <Badge variant="outline" className="text-[9px]">
            {analysis.rubricType === "course_script" ? "Script do curso" : "Rubrica geral"}
          </Badge>
          {analysis.score !== null ? (
            <Badge className="ml-auto bg-primary/10 text-primary hover:bg-primary/10">
              Nota {analysis.score}/100
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-auto">
              Contexto insuficiente
            </Badge>
          )}
        </div>
        {analysis.stage || analysis.intent ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.stage ? <Badge variant="secondary">Etapa: {analysis.stage}</Badge> : null}
            {analysis.intent ? <Badge variant="outline">Intenção: {analysis.intent}</Badge> : null}
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-5">{analysis.summary}</p>
        <div className="mt-2 grid gap-2 text-xs lg:grid-cols-2">
          {analysis.strengths.length ? (
            <AnalysisList title="Pontos positivos" values={analysis.strengths} />
          ) : null}
          {analysis.objections.length ? (
            <AnalysisList title="Objeções" values={analysis.objections} />
          ) : null}
          {analysis.nextSteps.length ? (
            <AnalysisList title="Próximos passos" values={analysis.nextSteps} />
          ) : null}
          {analysis.risks.length ? (
            <AnalysisList title="Pontos de atenção" values={analysis.risks} warning />
          ) : null}
        </div>
        {analysis.evidence.length ? (
          <p className="mt-2 border-t pt-2 text-[10px] leading-4 text-muted-foreground">
            <strong>Evidências:</strong> {analysis.evidence.join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AnalysisList({
  title,
  values,
  warning = false,
}: {
  title: string;
  values: Array<string>;
  warning?: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-background p-2.5", warning && "text-amber-800")}>
      <div className="flex items-center gap-1 font-semibold">
        {warning ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
        {title}
      </div>
      <p className="mt-1 leading-4 text-muted-foreground">{values.join(" · ")}</p>
    </div>
  );
}

function MessageTimeline({ messages }: { messages: Array<WhatsappSupervisionMessage> }) {
  let previousDay = "";
  return (
    <div className="space-y-2.5">
      {messages.map((message) => {
        const currentDay = dayKey(message.sentAt);
        const showDay = currentDay !== previousDay;
        previousDay = currentDay;
        return (
          <React.Fragment key={message.id}>
            {showDay ? (
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-full border bg-background/95 px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                  {dayLabel(message.sentAt)}
                </span>
              </div>
            ) : null}
            <MessageBubble message={message} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DeliveryIcon({ status }: { status: WhatsappDeliveryStatus | null }) {
  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Falha no envio" />;
  }
  if (status === "delivered" || status === "read" || status === "played") {
    return (
      <CheckCheck
        className={cn("h-3.5 w-3.5", (status === "read" || status === "played") && "text-sky-600")}
        aria-label={status === "delivered" ? "Entregue" : "Lida"}
      />
    );
  }
  if (status === "sent") return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
  return <Check className="h-3.5 w-3.5 opacity-50" aria-label="Aguardando confirmação" />;
}

function MessageMedia({ message }: { message: WhatsappSupervisionMessage }) {
  const [failed, setFailed] = React.useState(false);
  if (!message.mediaUrl) return null;
  if (failed) {
    return (
      <a
        href={message.mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="mb-2 flex items-center gap-2 rounded-lg border bg-background/70 p-3 text-xs underline"
      >
        <Download className="h-4 w-4" /> Abrir {mediaLabel(message.type).toLowerCase()}
      </a>
    );
  }
  if (message.type === "audio") {
    return (
      <div className="mb-1.5 min-w-[240px] rounded-xl bg-background/65 p-2">
        <audio
          controls
          preload="metadata"
          className="h-10 w-full max-w-[320px]"
          onError={() => setFailed(true)}
        >
          <source src={message.mediaUrl} type={message.mimeType || undefined} />
          Seu navegador não conseguiu reproduzir este áudio.
        </audio>
      </div>
    );
  }
  if (message.type === "image") {
    return (
      <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-1.5 block">
        <img
          src={message.mediaUrl}
          alt={message.fileName || "Imagem recebida pelo WhatsApp"}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-80 w-auto max-w-full rounded-xl object-contain"
        />
      </a>
    );
  }
  if (message.type === "video") {
    return (
      <video
        controls
        preload="metadata"
        className="mb-1.5 max-h-80 w-full max-w-md rounded-xl bg-black"
        onError={() => setFailed(true)}
      >
        <source src={message.mediaUrl} type={message.mimeType || undefined} />
        Seu navegador não conseguiu reproduzir este vídeo.
      </video>
    );
  }
  return (
    <a
      href={message.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className="mb-1.5 flex min-w-56 items-center gap-3 rounded-xl border bg-background/70 p-3"
    >
      <span className="rounded-lg bg-muted p-2">
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">
          {message.fileName || "Documento"}
        </span>
        <span className="text-[10px] text-muted-foreground">Abrir ou baixar arquivo</span>
      </span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

function MessageBubble({ message }: { message: WhatsappSupervisionMessage }) {
  const outbound = message.direction === "outbound";
  const showCaption =
    message.content &&
    (message.type === "text" || !genericMediaCaption(message.content, message.type));
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[78%]",
          outbound
            ? "rounded-br-md border border-primary/15 bg-primary/10 text-foreground"
            : "rounded-bl-md border bg-background",
          message.deletedAt && "opacity-60",
        )}
      >
        <MessageMedia message={message} />
        {message.deletedAt ? (
          <p className="flex items-center gap-1.5 text-xs italic text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" /> Mensagem apagada
          </p>
        ) : showCaption ? (
          <p className="whitespace-pre-wrap break-words leading-5">{message.content}</p>
        ) : null}
        {message.intervention ? (
          <div className="mt-2 border-t border-current/10 pt-1.5 text-[9px] font-medium text-muted-foreground">
            Enviado por liderança — {message.intervention.actorName} (
            {message.intervention.actorRole})
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
          {message.editedAt ? <span>Editada ·</span> : null}
          <span>{messageTime(message.sentAt)}</span>
          {outbound ? <DeliveryIcon status={message.deliveryStatus} /> : null}
        </div>
      </div>
    </div>
  );
}

function ConsultantInterventions() {
  const [notifications, setNotifications] = React.useState<Array<WhatsappInterventionNotification>>(
    [],
  );
  const [messages, setMessages] = React.useState<Array<WhatsappSupervisionMessage>>([]);
  const [selected, setSelected] = React.useState("");

  const loadNotifications = React.useCallback(async () => {
    const data = await requestJson<{ notifications: Array<WhatsappInterventionNotification> }>(
      "/api/whatsapp-supervision/notifications",
    );
    setNotifications(data.notifications);
    setSelected((current) => current || data.notifications[0]?.conversationId || "");
  }, []);

  const loadMessages = React.useCallback(async () => {
    if (!selected) return;
    const data = await requestJson<{ messages: Array<WhatsappSupervisionMessage> }>(
      `/api/whatsapp-supervision/conversations/${selected}`,
    );
    setMessages(data.messages);
  }, [selected]);

  React.useEffect(() => {
    void loadNotifications().catch(() => undefined);
  }, [loadNotifications]);
  React.useEffect(() => {
    void loadMessages().catch(() => undefined);
  }, [loadMessages]);
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadNotifications().catch(() => undefined);
        void loadMessages().catch(() => undefined);
      }
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadMessages, loadNotifications]);

  async function open(item: WhatsappInterventionNotification) {
    setSelected(item.conversationId);
    if (!item.readAt) {
      await requestJson("/api/whatsapp-supervision/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: item.id }),
      });
      setNotifications((current) =>
        current.map((value) =>
          value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value,
        ),
      );
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="WhatsApp"
        title="Intervenções da liderança"
        description="Veja quando uma liderança respondeu em uma conversa da sua conta."
      />
      <div className="grid min-h-[620px] overflow-hidden rounded-2xl border bg-card lg:grid-cols-[340px_1fr]">
        <section className="border-b lg:border-r lg:border-b-0">
          <div className="border-b p-4 font-bold">Notificações</div>
          <div className="divide-y">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void open(item)}
                className={cn(
                  "w-full p-4 text-left hover:bg-muted/50",
                  selected === item.conversationId && "bg-primary/8",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-bold">
                  <UserRound className="h-4 w-4" />
                  {item.actorName}
                  {!item.readAt ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.content}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{listTime(item.createdAt)}</p>
              </button>
            ))}
          </div>
        </section>
        <ScrollArea className="h-[620px] bg-slate-50/50">
          <div className="p-5">
            {messages.length ? <MessageTimeline messages={messages} /> : null}
            {!selected ? (
              <EmptyPanel
                icon={Smartphone}
                title="Nenhuma intervenção registrada"
                description="As respostas da liderança aparecerão aqui."
              />
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
