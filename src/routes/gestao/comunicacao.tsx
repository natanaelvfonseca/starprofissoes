import * as React from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  Bell,
  MessageCircle,
  RefreshCw,
  QrCode,
  ShieldAlert,
  Save,
  PauseCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { canTransferLeads } from "@/lib/auth-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Rule = {
  id: string;
  kind: "stale" | "overdue" | "good" | "low";
  enabled: boolean;
  threshold: number;
};
type Contact = { id: string; name: string; phone: string | null; opt_in: boolean };
type Outbox = {
  id: string;
  recipient: string;
  status: string;
  message: string;
  last_error: string | null;
  sent_at: string | null;
};
type Settings = {
  enabled: boolean;
  daily_limit: number;
  recipient_daily_limit: number;
  min_interval_seconds: number;
  failed_count: number;
  last_error: string | null;
};
type Management = {
  rules: Rule[];
  contacts: Contact[];
  queue: Outbox[];
  sender: { settings: Settings; instance: { status: string; phoneNumber: string | null } | null };
};
const descriptions: Record<Rule["kind"], { title: string; hint: string; unit: string }> = {
  stale: {
    title: "Leads parados",
    hint: "Avisar consultores com leads ativos sem movimentação por determinado período.",
    unit: "horas",
  },
  overdue: {
    title: "Tarefas atrasadas",
    hint: "Avisar consultores com tarefas vencidas, sem repetir o alerta durante o dia.",
    unit: "horas de atraso",
  },
  good: {
    title: "Resultados positivos",
    hint: "Reconhecer quem atingiu a quantidade definida de matrículas após as 17h.",
    unit: "matrículas",
  },
  low: {
    title: "Apoio aos resultados",
    hint: "Avisar quem está abaixo da referência após as 17h e tem carteira ativa.",
    unit: "matrículas",
  },
};
async function call<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/team/management", {
    credentials: "same-origin",
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Operação indisponível.");
  return result as T;
}
export const Route = createFileRoute("/gestao/comunicacao")({
  head: () => ({ meta: [{ title: "Comunicação da equipe | Star Profissões" }] }),
  component: Communication,
});
function Communication() {
  const { session, loading: authLoading } = useAuth();
  const manager = session ? canTransferLeads(session.user.role) : false;
  const unitId = session?.activeUnit?.id ?? "";
  const [data, setData] = React.useState<Management | null>(null);
  const [working, setWorking] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [qr, setQr] = React.useState<string | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [daily, setDaily] = React.useState(25);
  const [recipientDaily, setRecipientDaily] = React.useState(1);
  const [intervalSeconds, setIntervalSeconds] = React.useState(180);
  const [ruleDrafts, setRuleDrafts] = React.useState<Record<string, number>>({});
  const reload = React.useCallback(async () => {
    if (!unitId || !manager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await call<Management>();
      setData(payload);
      setEnabled(payload.sender.settings.enabled);
      setDaily(payload.sender.settings.daily_limit);
      setRecipientDaily(payload.sender.settings.recipient_daily_limit);
      setIntervalSeconds(payload.sender.settings.min_interval_seconds);
      setRuleDrafts(Object.fromEntries(payload.rules.map((r) => [r.kind, r.threshold])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar comunicação.");
    } finally {
      setLoading(false);
    }
  }, [unitId, manager]);
  React.useEffect(() => {
    void reload();
  }, [reload]);
  const execute = async (body: Record<string, unknown>, message: string) => {
    setWorking(true);
    try {
      const result = await call<{ qrCode?: string; status?: string }>(body);
      if (result.qrCode?.startsWith("data:image/")) setQr(result.qrCode);
      if (result.status === "connected" || body.action === "disconnect") setQr(null);
      toast.success(message);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operação falhou.");
    } finally {
      setWorking(false);
    }
  };
  if (authLoading) return null;
  if (session && !manager) return <Navigate to="/tarefas" replace />;
  const connected = data?.sender.instance?.status === "connected";
  return (
    <div className="space-y-5 pb-10">
      <header className="rounded-[24px] border border-[#E2E8F2] bg-white p-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#3468D9]">
          Gestão comercial
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#18294D] sm:text-3xl">
              Comunicação da equipe
            </h1>
            <p className="mt-2 text-sm text-[#8290A6]">
              Regras de lembretes, WhatsApp de gestão e histórico de mensagens.
            </p>
          </div>
          <Button variant="outline" disabled={working || loading} onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
        <p className="mt-4 text-xs text-[#8A97AA]">
          Unidade: {session?.activeUnit?.name} ·{" "}
          <Link to="/tarefas" className="text-[#3468D9] hover:underline">
            Central de Tarefas
          </Link>
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <Card className="rounded-[22px] border-[#E2E8F2] bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-extrabold text-[#18294D]">
            <Bell className="h-5 w-5 text-[#3568DE]" />
            Regras automáticas de alertas
          </h2>
          <p className="mt-2 text-xs text-[#8E9AAD]">
            Notificações no CRM para cada consultor, deduplicadas por regra e por dia.
          </p>
          <div className="mt-5 space-y-4">
            {data?.rules.map((rule) => {
              const item = descriptions[rule.kind];
              return (
                <div key={rule.id} className="rounded-xl border border-[#E4EAF3] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-[#263858]">{item.title}</p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {rule.enabled ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#8D99AC]">{item.hint}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={rule.kind === "stale" ? 1 : 0}
                      max={720}
                      value={ruleDrafts[rule.kind] ?? rule.threshold}
                      onChange={(e) =>
                        setRuleDrafts((v) => ({ ...v, [rule.kind]: Number(e.target.value) }))
                      }
                      className="h-9 w-20 rounded-lg border border-[#DCE5F1] px-2 text-sm"
                    />
                    <span className="text-xs text-[#7E8A9F]">{item.unit}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={working}
                      onClick={() =>
                        void execute(
                          {
                            action: "rule",
                            kind: rule.kind,
                            enabled: rule.enabled,
                            threshold: ruleDrafts[rule.kind] ?? rule.threshold,
                          },
                          "Regra salva.",
                        )
                      }
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      disabled={working}
                      variant={rule.enabled ? "outline" : "default"}
                      onClick={() =>
                        void execute(
                          {
                            action: "rule",
                            kind: rule.kind,
                            enabled: !rule.enabled,
                            threshold: ruleDrafts[rule.kind] ?? rule.threshold,
                          },
                          rule.enabled ? "Regra pausada." : "Regra ativada.",
                        )
                      }
                    >
                      {rule.enabled ? (
                        <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {rule.enabled ? "Pausar" : "Ativar"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="rounded-[22px] border-[#E2E8F2] bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-extrabold text-[#18294D]">
            <MessageCircle className="h-5 w-5 text-[#18A582]" />
            WhatsApp da gestão
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#8D99AC]">
            Uma conexão de envio exclusiva por unidade, separada dos números dos consultores.
          </p>
          <div className="mt-4 rounded-xl border border-[#E2EAF4] bg-[#F8FAFD] p-4">
            <p className="text-sm font-bold text-[#273959]">
              Conexão:{" "}
              {connected ? "Conectado" : (data?.sender.instance?.status ?? "Não conectado")}
            </p>
            {data?.sender.instance?.phoneNumber ? (
              <p className="mt-1 text-xs text-[#8D99AC]">
                Número: {data.sender.instance.phoneNumber}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={working}
                onClick={() => void execute({ action: "state" }, "Conexão verificada.")}
              >
                Verificar
              </Button>
              {!connected ? (
                <Button
                  size="sm"
                  disabled={working}
                  onClick={() =>
                    void execute({ action: "connect" }, "Conexão iniciada; use o QR Code.")
                  }
                >
                  <QrCode className="mr-1.5 h-4 w-4" />
                  Conectar
                </Button>
              ) : null}
              {data?.sender.instance ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() => {
                    if (window.confirm("Desconectar o número e suspender envios?"))
                      void execute({ action: "disconnect" }, "Número desconectado.");
                  }}
                >
                  Desconectar
                </Button>
              ) : null}
            </div>
            {qr ? (
              <div className="mt-4 rounded-xl bg-white p-3 text-center">
                <img
                  alt="QR Code do WhatsApp da gestão"
                  src={qr}
                  className="mx-auto h-52 w-52 object-contain"
                />
                <p className="mt-2 text-xs text-[#7E8B9C]">
                  WhatsApp → Aparelhos conectados → Conectar aparelho.
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-5 space-y-3">
            <label className="flex items-start gap-2 text-xs leading-5 text-[#61718C]">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1"
              />
              Ativar envio automático de resumos, somente a consultores que autorizaram.
            </label>
            {[
              {
                label: "Limite máximo da unidade por dia",
                value: daily,
                change: setDaily,
                min: 1,
                max: 50,
              },
              {
                label: "Limite por consultor por dia",
                value: recipientDaily,
                change: setRecipientDaily,
                min: 1,
                max: 2,
              },
              {
                label: "Intervalo mínimo (segundos)",
                value: intervalSeconds,
                change: setIntervalSeconds,
                min: 180,
                max: 3600,
              },
            ].map((field) => (
              <label key={field.label} className="block text-xs font-semibold text-[#6E7D93]">
                {field.label}
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={field.value}
                  onChange={(e) => field.change(Number(e.target.value))}
                  className="mt-1 block h-10 w-full rounded-lg border border-[#DDE5F0] px-3 text-sm text-[#263858]"
                />
              </label>
            ))}
            {data?.sender.settings.last_error ? (
              <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                {data.sender.settings.last_error}
              </p>
            ) : null}
            <Button
              className="w-full bg-[#16006C] text-white hover:bg-[#16006C]/90"
              disabled={working || Boolean(enabled && !connected)}
              onClick={() =>
                void execute(
                  {
                    action: "sender_settings",
                    enabled,
                    dailyLimit: daily,
                    recipientDailyLimit: recipientDaily,
                    minIntervalSeconds: intervalSeconds,
                  },
                  "Configuração de envio salva.",
                )
              }
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar configuração
            </Button>
            <p className="text-xs leading-5 text-[#8E9AAD]">
              Horário permitido 08h–18h. A fila agrupa avisos, evita duplicações e suspende envios
              após 3 falhas.
            </p>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-[22px] border-[#E2E8F2] bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-[#18294D]">Consultores autorizados</h2>
          <p className="mt-1 text-xs text-[#8C9AAE]">
            O consultor controla seu telefone e consentimento na Central de Tarefas.
          </p>
          <div className="mt-4 space-y-2">
            {data?.contacts.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#E7EDF5] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[#273959]">{item.name}</p>
                  <p className="mt-1 text-xs text-[#8E9AAD]">
                    {item.phone ?? "Telefone não informado"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-bold ${item.opt_in && item.phone ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {item.opt_in && item.phone ? "Autorizou" : "Sem autorização"}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="rounded-[22px] border-[#E2E8F2] bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-[#18294D]">Fila e histórico de envios</h2>
          <p className="mt-1 text-xs text-[#8C9AAE]">
            Enviados, pendentes e falhas, sem retransmissão automática após erro.
          </p>
          <div className="mt-4 max-h-[430px] space-y-2 overflow-y-auto">
            {data?.queue.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#E7EDF5] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#273959]">{row.recipient}</p>
                  <span className="rounded-full bg-[#F2F4F8] px-2 py-1 text-xs font-bold text-[#7A879B]">
                    {row.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-[#8A97AA]">
                  {row.message}
                </p>
                {row.last_error ? (
                  <p className="mt-2 text-xs text-rose-600">{row.last_error}</p>
                ) : null}
              </div>
            ))}
            {data && !data.queue.length ? (
              <p className="text-sm text-[#91A0B2]">Nenhuma mensagem na fila.</p>
            ) : null}
          </div>
        </Card>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        Intervalos e limites reduzem repetição, mas não garantem proteção contra bloqueios. Para
        automações recorrentes em escala, prefira a API oficial do WhatsApp Business com
        consentimento e políticas aplicáveis.
      </div>
    </div>
  );
}
