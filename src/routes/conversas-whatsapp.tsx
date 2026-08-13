import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bot, CheckCheck, Loader2, MessageCircleMore, RefreshCw, Search, Send, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth";
import { getInitials, ROLE_LABELS, type UserRole } from "@/lib/auth-types";
import type { WhatsappInterventionNotification, WhatsappSupervisionConsultant, WhatsappSupervisionConversation, WhatsappSupervisionMessage } from "@/lib/whatsapp-supervision-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conversas-whatsapp")({ component: WhatsappConversationsPage });

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok && response.status !== 202) throw new Error(data.error || "Falha na requisição.");
  return data;
}

function when(value: string | null) {
  if (!value) return "Sem mensagens";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function WhatsappConversationsPage() {
  const { session } = useAuth();
  if (session?.user.role === "CONSULTOR") return <ConsultantInterventions />;
  if (!session?.features.whatsappSupervision) return <div className="flex min-h-[55vh] items-center justify-center text-center"><div><ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">Função ainda não liberada</h1><p className="mt-2 text-sm text-muted-foreground">A supervisão do WhatsApp está em liberação gradual.</p></div></div>;
  return <LeadershipInbox />;
}

function LeadershipInbox() {
  const { session } = useAuth();
  const [consultants, setConsultants] = React.useState<Array<WhatsappSupervisionConsultant>>([]);
  const [conversations, setConversations] = React.useState<Array<WhatsappSupervisionConversation>>([]);
  const [messages, setMessages] = React.useState<Array<WhatsappSupervisionMessage>>([]);
  const [consultantId, setConsultantId] = React.useState("");
  const [conversationId, setConversationId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadingConversation, setLoadingConversation] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [status, setStatus] = React.useState<{ pendingJobs: number; failedJobs: number; pendingSends: number; lastSyncAt: string | null } | null>(null);
  const [roles, setRoles] = React.useState<Array<{ role: UserRole; enabled: boolean }>>([]);
  const [selectedUnitId, setSelectedUnitId] = React.useState(session?.activeUnit?.id || "");
  const selectedConversation = conversations.find((item) => item.id === conversationId) ?? null;

  const loadConsultants = React.useCallback(async () => {
    setLoading(true);
    try {
      const unitId = selectedUnitId || session?.activeUnit?.id;
      const data = await requestJson<{ consultants: Array<WhatsappSupervisionConsultant> }>(`/api/whatsapp-supervision${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ""}`);
      setConsultants(data.consultants);
      setConsultantId((current) => data.consultants.some((item) => item.id === current) ? current : data.consultants[0]?.id || "");
      if (session?.user.role === "DEV") {
        const [statusData, accessData] = await Promise.all([
          requestJson<{ status: typeof status }>("/api/whatsapp-supervision?view=status"),
          requestJson<{ roles: Array<{ role: UserRole; enabled: boolean }> }>("/api/whatsapp-supervision/access"),
        ]);
        setStatus(statusData.status);
        setRoles(accessData.roles);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao carregar consultores."); }
    finally { setLoading(false); }
  }, [selectedUnitId, session?.activeUnit?.id, session?.user.role]);

  const loadConversations = React.useCallback(async () => {
    if (!consultantId) { setConversations([]); return; }
    const params = new URLSearchParams({ view: "conversations", consultantId });
    if (selectedUnitId) params.set("unitId", selectedUnitId);
    if (search.trim()) params.set("search", search.trim());
    try {
      const data = await requestJson<{ conversations: Array<WhatsappSupervisionConversation> }>(`/api/whatsapp-supervision?${params}`);
      setConversations(data.conversations);
      setConversationId((current) => data.conversations.some((item) => item.id === current) ? current : data.conversations[0]?.id || "");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao carregar conversas."); }
  }, [consultantId, search, selectedUnitId]);

  const loadMessages = React.useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoadingConversation(true);
    try {
      const data = await requestJson<{ messages: Array<WhatsappSupervisionMessage> }>(`/api/whatsapp-supervision/conversations/${conversationId}`);
      setMessages(data.messages);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao carregar mensagens."); }
    finally { setLoadingConversation(false); }
  }, [conversationId]);

  React.useEffect(() => { void loadConsultants(); }, [loadConsultants]);
  React.useEffect(() => { const timer = window.setTimeout(() => void loadConversations(), 250); return () => window.clearTimeout(timer); }, [loadConversations]);
  React.useEffect(() => { void loadMessages(); }, [loadMessages]);

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!conversationId || !reply.trim()) return;
    setSending(true);
    try {
      const data = await requestJson<{ intervention: { status: string } }>(`/api/whatsapp-supervision/conversations/${conversationId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), text: reply.trim() }) });
      setReply(""); await loadMessages();
      if (data.intervention.status === "pending") toast.info("Envio aguardando confirmação da Evolution; não será repetido automaticamente.");
      else toast.success("Mensagem enviada e intervenção registrada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao enviar."); }
    finally { setSending(false); }
  }

  async function toggleRole(role: UserRole, enabled: boolean) {
    try {
      const data = await requestJson<{ roles: Array<{ role: UserRole; enabled: boolean }> }>("/api/whatsapp-supervision/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, enabled }) });
      setRoles(data.roles); toast.success(`${ROLE_LABELS[role]} ${enabled ? "liberado" : "bloqueado"}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao alterar acesso."); }
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Comercial" title="Conversas WhatsApp" description="Acompanhe a equipe, intervenha com auditoria e consulte a análise individual da IA." actions={<>{session && session.units.length > 1 ? <Select value={selectedUnitId} onValueChange={(value) => { setSelectedUnitId(value); setConsultantId(""); setConversationId(""); }}><SelectTrigger className="w-56"><SelectValue placeholder="Selecionar unidade" /></SelectTrigger><SelectContent>{session.units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectContent></Select> : null}<Button variant="outline" onClick={() => void loadConsultants()} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Atualizar</Button></>} />
    {session?.user.role === "DEV" && (status || roles.length) ? <Card><CardContent className="flex flex-wrap items-center gap-4 p-4"><div className="mr-auto"><div className="text-sm font-bold">Operação e liberação</div><div className="mt-1 text-xs text-muted-foreground">{status ? `${status.pendingJobs} análises pendentes · ${status.failedJobs} falhas · ${status.pendingSends} envios a confirmar` : ""}</div></div>{roles.map((item) => <label key={item.role} className="flex items-center gap-2 text-xs font-semibold"><Switch checked={item.enabled} disabled={item.role === "DEV"} onCheckedChange={(checked) => void toggleRole(item.role, checked)} />{ROLE_LABELS[item.role]}</label>)}</CardContent></Card> : null}
    <div className="grid min-h-[690px] overflow-hidden rounded-2xl border bg-card xl:grid-cols-[250px_320px_minmax(0,1fr)]">
      <section className="border-b xl:border-b-0 xl:border-r"><div className="border-b p-4"><h2 className="font-bold">Consultores</h2><p className="text-xs text-muted-foreground">{consultants.length} cadastrados</p></div><ScrollArea className="h-[220px] xl:h-[620px]"><div className="space-y-1 p-2">{consultants.map((item) => <button key={`${item.unitId}:${item.id}`} onClick={() => { setConsultantId(item.id); setConversationId(""); }} className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted", consultantId === item.id && "bg-primary/10 text-primary")}><Avatar className="h-9 w-9"><AvatarImage src={item.avatarUrl || undefined} /><AvatarFallback>{getInitials(item.name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.conversationCount} conversas · {item.unitName}</span></span><span className={cn("h-2.5 w-2.5 rounded-full", item.status === "connected" ? "bg-emerald-500" : "bg-slate-300")} /></button>)}</div></ScrollArea></section>
      <section className="border-b xl:border-b-0 xl:border-r"><div className="border-b p-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato ou telefone" className="pl-9" /></div></div><ScrollArea className="h-[300px] xl:h-[630px]"><div className="divide-y">{conversations.map((item) => <button key={item.id} onClick={() => setConversationId(item.id)} className={cn("w-full p-4 text-left hover:bg-muted/60", conversationId === item.id && "bg-primary/10")}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{item.contactName}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.lastMessage}</div></div><span className="text-[10px] text-muted-foreground">{when(item.lastMessageAt)}</span></div><div className="mt-2 flex gap-1">{item.lead ? <Badge variant="secondary" className="text-[10px]">CRM: {item.lead.courseName || item.lead.name}</Badge> : null}{item.latestAnalysis ? <Badge variant="outline" className="text-[10px]"><Bot className="mr-1 h-3 w-3" />{item.latestAnalysis.score ?? "Contexto insuficiente"}</Badge> : null}</div></button>)}</div></ScrollArea></section>
      <section className="flex min-w-0 flex-col">{selectedConversation ? <><div className="border-b p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{selectedConversation.contactName}</h2><p className="text-xs text-muted-foreground">{selectedConversation.phone || selectedConversation.remoteJid} · {selectedConversation.messageCount} mensagens</p></div>{selectedConversation.latestAnalysis ? <Badge className="bg-primary/10 text-primary">IA {selectedConversation.latestAnalysis.score ?? "sem nota"}</Badge> : <Badge variant="outline">Aguardando análise diária</Badge>}</div>{selectedConversation.latestAnalysis ? <AnalysisSummary conversation={selectedConversation} /> : null}</div><ScrollArea className="h-[440px] flex-1 bg-muted/20"><div className="space-y-3 p-4">{loadingConversation ? <Loader2 className="mx-auto mt-12 h-6 w-6 animate-spin" /> : messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div></ScrollArea><form onSubmit={sendReply} className="border-t p-3"><div className="flex items-end gap-2"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={4000} rows={2} placeholder="Responder pelo WhatsApp do consultor…" /><Button type="submit" size="icon" disabled={sending || !reply.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div><p className="mt-1 text-[10px] text-muted-foreground">A resposta será identificada internamente com seu nome e cargo.</p></form></> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageCircleMore className="h-12 w-12 text-muted-foreground" /><h2 className="mt-3 font-bold">Selecione uma conversa</h2></div>}</section>
    </div>
  </div>;
}

function AnalysisSummary({ conversation }: { conversation: WhatsappSupervisionConversation }) {
  const analysis = conversation.latestAnalysis!;
  return <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border bg-muted/30 p-3"><div className="flex items-center gap-2 text-xs font-bold"><Bot className="h-4 w-4 text-primary" />Análise da conversa · {analysis.rubricType === "course_script" ? "script do curso" : "rubrica geral"}</div>{analysis.stage || analysis.intent ? <div className="mt-2 flex flex-wrap gap-1">{analysis.stage ? <Badge variant="secondary">Etapa: {analysis.stage}</Badge> : null}{analysis.intent ? <Badge variant="outline">Intenção: {analysis.intent}</Badge> : null}</div> : null}<p className="mt-2 text-xs leading-5">{analysis.summary}</p>{analysis.strengths.length ? <p className="mt-2 text-xs"><strong>Pontos positivos:</strong> {analysis.strengths.join(" · ")}</p> : null}{analysis.objections.length ? <p className="mt-1 text-xs"><strong>Objeções:</strong> {analysis.objections.join(" · ")}</p> : null}{analysis.nextSteps.length ? <p className="mt-1 text-xs"><strong>Próximo passo:</strong> {analysis.nextSteps.join(" · ")}</p> : null}{analysis.risks.length ? <p className="mt-1 flex items-start gap-1 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{analysis.risks.join(" · ")}</p> : null}{analysis.evidence.length ? <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground"><strong>Evidências consideradas:</strong> {analysis.evidence.join(" · ")}</div> : null}</div>;
}

function MessageBubble({ message }: { message: WhatsappSupervisionMessage }) {
  const outbound = message.direction === "outbound";
  return <div className={cn("flex", outbound ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm", outbound ? "bg-primary text-primary-foreground" : "border bg-background", message.deletedAt && "opacity-60")}>{message.mediaUrl ? <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 block underline">Abrir {message.type}</a> : null}<p className="whitespace-pre-wrap break-words">{message.content}</p><div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", outbound ? "text-primary-foreground/70" : "text-muted-foreground")}>{message.intervention ? <span>Enviado por liderança — {message.intervention.actorName} ({message.intervention.actorRole})</span> : null}<span>{when(message.sentAt)}</span>{outbound ? <CheckCheck className="h-3 w-3" /> : null}</div></div></div>;
}

function ConsultantInterventions() {
  const [notifications, setNotifications] = React.useState<Array<WhatsappInterventionNotification>>([]);
  const [messages, setMessages] = React.useState<Array<WhatsappSupervisionMessage>>([]);
  const [selected, setSelected] = React.useState("");
  React.useEffect(() => { void requestJson<{ notifications: Array<WhatsappInterventionNotification> }>("/api/whatsapp-supervision/notifications").then((data) => { setNotifications(data.notifications); setSelected(data.notifications[0]?.conversationId || ""); }).catch(() => undefined); }, []);
  React.useEffect(() => { if (!selected) return; void requestJson<{ messages: Array<WhatsappSupervisionMessage> }>(`/api/whatsapp-supervision/conversations/${selected}`).then((data) => setMessages(data.messages)); }, [selected]);
  async function open(item: WhatsappInterventionNotification) { setSelected(item.conversationId); if (!item.readAt) { await requestJson("/api/whatsapp-supervision/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: item.id }) }); setNotifications((current) => current.map((value) => value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value)); } }
  return <div className="space-y-5"><PageHeader eyebrow="WhatsApp" title="Intervenções da liderança" description="Veja quando uma liderança respondeu em uma conversa da sua conta." /><div className="grid min-h-[620px] overflow-hidden rounded-2xl border bg-card lg:grid-cols-[340px_1fr]"><section className="border-b lg:border-b-0 lg:border-r"><div className="border-b p-4 font-bold">Notificações</div><div className="divide-y">{notifications.map((item) => <button key={item.id} onClick={() => void open(item)} className={cn("w-full p-4 text-left", selected === item.conversationId && "bg-primary/10")}><div className="flex items-center gap-2 text-sm font-bold"><UserRound className="h-4 w-4" />{item.actorName}{!item.readAt ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground">{item.content}</p><p className="mt-1 text-[10px] text-muted-foreground">{when(item.createdAt)}</p></button>)}</div></section><ScrollArea className="h-[620px] bg-muted/20"><div className="space-y-3 p-5">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}{!selected ? <div className="mt-24 text-center text-sm text-muted-foreground"><Smartphone className="mx-auto mb-2 h-10 w-10" />Nenhuma intervenção registrada.</div> : null}</div></ScrollArea></div></div>;
}
