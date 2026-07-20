import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CheckSquare2,
  Clock3,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { LeadStage } from "@/lib/commercial-types";
import { useAuth } from "@/lib/auth";
import {
  canAccessLeadTransferCenter,
  ROLE_LABELS,
  type UserRole,
} from "@/lib/auth-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TransferUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

type TransferLead = {
  id: string;
  fullName: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  city: string | null;
  courseName: string | null;
  acquisitionChannelName: string | null;
  stage: LeadStage;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  createdByRole: UserRole | null;
  campaignName: string | null;
  adName: string | null;
  ageHours: number;
  transferable: boolean;
};

type TransferDataResponse = {
  users?: Array<TransferUser>;
  consultants?: Array<TransferUser>;
  leads: Array<TransferLead>;
  policy: {
    immediateTransfer: boolean;
    requires48Hours: boolean;
  };
};

type TransferSubmitResponse = {
  transferredIds: Array<string>;
  targetUser: TransferUser;
};

const FILTER_ALL = "__all__";
const WITHOUT_OWNER = "__without_owner__";

function unitQuery(unitId: string) {
  return `?unitId=${encodeURIComponent(unitId)}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Falha na requisição.");
  }

  return data;
}

function formatLeadAge(lead: TransferLead) {
  if (lead.ageHours < 1) {
    return "agora";
  }

  if (lead.ageHours < 24) {
    return `${lead.ageHours}h`;
  }

  const days = Math.floor(lead.ageHours / 24);
  const hours = lead.ageHours % 24;

  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function leadMatchesSearch(lead: TransferLead, search: string) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    lead.fullName,
    lead.phone,
    lead.phone2,
    lead.email,
    lead.city,
    lead.courseName,
    lead.acquisitionChannelName,
    lead.campaignName,
    lead.adName,
    lead.createdByName,
    lead.stage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function ownerFilterMatches(lead: TransferLead, ownerId: string) {
  if (ownerId === FILTER_ALL) {
    return true;
  }

  if (ownerId === WITHOUT_OWNER) {
    return !lead.createdById;
  }

  return lead.createdById === ownerId;
}

export const Route = createFileRoute("/crm/transferencia")({
  head: () => ({ meta: [{ title: "Transferência de Leads · Star Profissões" }] }),
  component: LeadTransferCenter,
});

function LeadTransferCenter() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const canAccess = session ? canAccessLeadTransferCenter(session.user.role) : false;
  const [leads, setLeads] = React.useState<Array<TransferLead>>([]);
  const [users, setUsers] = React.useState<Array<TransferUser>>([]);
  const [policy, setPolicy] = React.useState<TransferDataResponse["policy"]>({
    immediateTransfer: false,
    requires48Hours: true,
  });
  const [selectedLeadIds, setSelectedLeadIds] = React.useState<Set<string>>(() => new Set());
  const [targetUserId, setTargetUserId] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState(FILTER_ALL);
  const [stageFilter, setStageFilter] = React.useState(FILTER_ALL);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [transferring, setTransferring] = React.useState(false);
  const broadcastChannelRef = React.useRef<BroadcastChannel | null>(null);

  const loadData = React.useCallback(async () => {
    if (!activeUnitId || !canAccess) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await readJson<TransferDataResponse>(
        await fetch(`/api/crm/transfer${unitQuery(activeUnitId)}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      );
      const nextUsers = data.users ?? data.consultants ?? [];
      const availableIds = new Set(data.leads.map((lead) => lead.id));

      setUsers(nextUsers);
      setLeads(data.leads);
      setPolicy(data.policy);
      setSelectedLeadIds((current) => new Set(Array.from(current).filter((id) => availableIds.has(id))));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar transferências.");
    } finally {
      setLoading(false);
    }
  }, [activeUnitId, canAccess]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!activeUnitId) {
      return undefined;
    }

    const channel =
      "BroadcastChannel" in window ? new BroadcastChannel(`crm-pipeline-${activeUnitId}`) : null;

    broadcastChannelRef.current = channel;

    return () => {
      channel?.close();
      if (broadcastChannelRef.current === channel) {
        broadcastChannelRef.current = null;
      }
    };
  }, [activeUnitId]);

  const ownerOptions = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: UserRole | null }>();

    leads.forEach((lead) => {
      if (lead.createdById && lead.createdByName) {
        map.set(lead.createdById, {
          id: lead.createdById,
          name: lead.createdByName,
          role: lead.createdByRole,
        });
      }
    });

    return Array.from(map.values()).sort((first, second) =>
      first.name.localeCompare(second.name, "pt-BR"),
    );
  }, [leads]);

  const filteredLeads = React.useMemo(
    () =>
      leads.filter(
        (lead) =>
          ownerFilterMatches(lead, ownerFilter) &&
          (stageFilter === FILTER_ALL || lead.stage === stageFilter) &&
          leadMatchesSearch(lead, search),
      ),
    [leads, ownerFilter, search, stageFilter],
  );

  const transferableFilteredLeads = React.useMemo(
    () => filteredLeads.filter((lead) => lead.transferable),
    [filteredLeads],
  );
  const selectedLeads = React.useMemo(
    () => leads.filter((lead) => selectedLeadIds.has(lead.id)),
    [leads, selectedLeadIds],
  );
  const selectedCount = selectedLeadIds.size;
  const allFilteredSelected =
    transferableFilteredLeads.length > 0 &&
    transferableFilteredLeads.every((lead) => selectedLeadIds.has(lead.id));
  const groupedCounts = React.useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();

    leads.forEach((lead) => {
      const id = lead.createdById ?? WITHOUT_OWNER;
      const item = map.get(id) ?? { name: lead.createdByName ?? "Sem responsável", count: 0 };
      item.count += 1;
      map.set(id, item);
    });

    return Array.from(map.entries()).map(([id, value]) => ({ id, ...value }));
  }, [leads]);
  const targetUser = users.find((user) => user.id === targetUserId) ?? null;

  function toggleLead(lead: TransferLead, checked: boolean | "indeterminate") {
    if (!lead.transferable) {
      return;
    }

    setSelectedLeadIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(lead.id);
      } else {
        next.delete(lead.id);
      }

      return next;
    });
  }

  function toggleFilteredLeads(checked: boolean | "indeterminate") {
    if (!checked) {
      setSelectedLeadIds((current) => {
        const visible = new Set(transferableFilteredLeads.map((lead) => lead.id));
        return new Set(Array.from(current).filter((id) => !visible.has(id)));
      });
      return;
    }

    setSelectedLeadIds((current) => {
      const next = new Set(current);
      transferableFilteredLeads.forEach((lead) => next.add(lead.id));
      return next;
    });
  }

  async function submitTransfer() {
    if (!activeUnitId || transferring) {
      return;
    }

    const leadIds = Array.from(selectedLeadIds);

    if (!leadIds.length) {
      toast.error("Selecione ao menos um lead.");
      return;
    }

    if (!targetUserId) {
      toast.error("Escolha o novo responsável.");
      return;
    }

    setTransferring(true);

    try {
      const data = await readJson<TransferSubmitResponse>(
        await fetch("/api/crm/transfer", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unitId: activeUnitId,
            leadIds,
            targetUserId,
          }),
        }),
      );

      toast.success(`${data.transferredIds.length} lead(s) transferido(s).`);
      setSelectedLeadIds(new Set());
      setTargetUserId("");
      broadcastChannelRef.current?.postMessage({
        type: "lead-transferred",
        leadIds: data.transferredIds,
      });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao transferir leads.");
    } finally {
      setTransferring(false);
    }
  }

  function clearFilters() {
    setOwnerFilter(FILTER_ALL);
    setStageFilter(FILTER_ALL);
    setSearch("");
  }

  if (session && !canAccess) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Transferências ficam disponíveis para Marketing, Dev, CEO, CVO, Diretores e Gerentes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Comercial"
        title="Transferência de Leads"
        description="Central de correção de responsáveis do CRM."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {policy.immediateTransfer ? "Transferência imediata" : "Regra de 48h"}
            </Badge>
            <Button type="button" variant="outline" onClick={() => void loadData()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Users} label="Leads no funil" value={leads.length} />
        <Metric icon={CheckSquare2} label="Selecionados" value={selectedCount} tone="gold" />
        <Metric icon={UserCheck} label="Responsáveis" value={groupedCounts.length} />
        <Metric
          icon={ShieldCheck}
          label={policy.immediateTransfer ? "Liberação" : "Elegíveis"}
          value={policy.immediateTransfer ? "Agora" : transferableFilteredLeads.length}
          tone="gold"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="border-primary/10 shadow-card">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, telefone, curso, origem ou campanha"
                  className="pl-9"
                />
              </div>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos os responsáveis</SelectItem>
                  <SelectItem value={WITHOUT_OWNER}>Sem responsável</SelectItem>
                  {ownerOptions.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todas as etapas</SelectItem>
                  {Array.from(new Set(leads.map((lead) => lead.stage))).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Limpar
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-primary/10 shadow-card">
            <div className="flex flex-col gap-3 border-b bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-primary">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleFilteredLeads}
                  disabled={!transferableFilteredLeads.length || loading}
                />
                Selecionar leads filtrados
              </label>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-white text-primary">
                  {filteredLeads.length} visíveis
                </Badge>
                <Badge variant="secondary" className="bg-gold/15 text-gold-foreground">
                  {transferableFilteredLeads.length} liberados
                </Badge>
              </div>
            </div>

            {loading ? (
              <div className="flex h-80 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : filteredLeads.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12" />
                      <TableHead>Lead</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Curso / origem</TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => {
                      const selected = selectedLeadIds.has(lead.id);

                      return (
                        <TableRow key={lead.id} className={selected ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => toggleLead(lead, checked)}
                              disabled={!lead.transferable || loading}
                              aria-label={`Selecionar ${lead.fullName}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">{lead.fullName}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{lead.phone}</span>
                              {lead.city ? <span>{lead.city}</span> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {lead.createdByName ?? "Sem responsável"}
                            </div>
                            {lead.createdByRole ? (
                              <div className="text-xs text-muted-foreground">
                                {ROLE_LABELS[lead.createdByRole]}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{lead.courseName ?? "--"}</div>
                            <div className="text-xs text-muted-foreground">
                              {lead.acquisitionChannelName ?? "Origem não informada"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-56 truncate font-medium">
                              {lead.campaignName ?? lead.adName ?? "--"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className={
                                  lead.transferable
                                    ? "bg-success/10 text-success"
                                    : "bg-gold/15 text-gold-foreground"
                                }
                              >
                                {lead.transferable ? "Liberado" : "Aguardando 48h"}
                              </Badge>
                              <Badge variant="outline">{lead.stage}</Badge>
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatLeadAge(lead)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-6">
                <EmptyState
                  icon={ArrowRightLeft}
                  title="Nenhum lead encontrado"
                  description="Ajuste os filtros ou atualize a lista."
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-primary/10 bg-[linear-gradient(135deg,rgba(22,0,108,.05),rgba(255,138,31,.09),rgba(18,54,201,.08))] shadow-card">
            <CardContent className="space-y-4 p-5">
              <div>
                <div className="text-sm font-bold text-primary">Novo responsável</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedCount ? `${selectedCount} lead(s) prontos para transferência.` : "Nenhum lead selecionado."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Usuário de destino</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} · {ROLE_LABELS[user.role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-white/80 p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Destino
                </div>
                <div className="mt-2 text-sm font-bold text-primary">
                  {targetUser ? targetUser.name : "Pendente"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {targetUser ? ROLE_LABELS[targetUser.role] : "Escolha para concluir"}
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void submitTransfer()}
                disabled={loading || transferring || !selectedCount || !targetUserId}
                className="w-full gap-2 bg-gradient-primary"
              >
                {transferring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                {transferring ? "Transferindo..." : "Transferir selecionados"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <Users className="h-4 w-4" />
                Leads por responsável
              </div>
              <div className="space-y-2">
                {groupedCounts.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setOwnerFilter(group.id)}
                    className="flex w-full items-center justify-between rounded-lg border bg-white/80 px-3 py-2 text-left text-sm transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span className="min-w-0 truncate font-medium">{group.name}</span>
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {group.count}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: "blue" | "gold";
}) {
  return (
    <Card className="border-primary/10 shadow-card">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={
            tone === "gold"
              ? "flex h-11 w-11 items-center justify-center rounded-lg bg-gold/15 text-gold-foreground"
              : "flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"
          }
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-black text-foreground">{value}</div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
