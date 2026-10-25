import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Lock,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { LeadRecord, PipelineColumn } from "@/lib/commercial-types";
import { useAuth } from "@/lib/auth";
import { canExportLeads, ROLE_LABELS, type UserRole } from "@/lib/auth-types";
import { leadExportFilename, leadsToCsv } from "@/lib/lead-csv";
import {
  PIPELINE_FILTER_ALL as FILTER_ALL,
  countActivePipelineFilters,
  emptyPipelineFilters,
  filterPipelineLeads,
  type PipelineFilters,
} from "@/lib/pipeline-filters";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OwnerOption = { id: string; name: string; role: UserRole };
type LeadsResponse = {
  leads: Array<LeadRecord>;
  pipelineColumns: Array<PipelineColumn>;
  owners?: Array<OwnerOption>;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na requisição.");
  return data;
}

function unitQuery(unitId: string) {
  return `?unitId=${encodeURIComponent(unitId)}`;
}

function uniqueOptions(
  leads: Array<LeadRecord>,
  idKey: "attendanceId" | "courseId" | "acquisitionChannelId",
  nameKey: "attendanceName" | "courseName" | "acquisitionChannelName",
) {
  return Array.from(
    new Map(
      leads
        .filter((lead) => lead[idKey] && lead[nameKey])
        .map((lead) => [lead[idKey] as string, lead[nameKey] as string]),
    ),
    ([id, name]) => ({ id, name }),
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export const Route = createFileRoute("/crm/exportar")({
  head: () => ({ meta: [{ title: "Exportar Leads · Star Profissões" }] }),
  component: ExportLeadsPage,
});

function ExportLeadsPage() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const canAccess = session ? canExportLeads(session.user.role, session.user.email) : false;
  const canViewAcquisitionChannel = session?.user.role !== "CONSULTOR";
  const [leads, setLeads] = React.useState<Array<LeadRecord>>([]);
  const [owners, setOwners] = React.useState<Array<OwnerOption>>([]);
  const [filters, setFilters] = React.useState<PipelineFilters>(() => emptyPipelineFilters());
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let ignored = false;

    async function loadLeads() {
      if (!activeUnitId || !canAccess) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await readJson<LeadsResponse>(
          await fetch(`/api/crm/leads${unitQuery(activeUnitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );
        if (!ignored) {
          setLeads(data.leads);
          setOwners(data.owners ?? []);
        }
      } catch (error) {
        if (!ignored) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar os leads.");
        }
      } finally {
        if (!ignored) setLoading(false);
      }
    }

    void loadLeads();
    return () => {
      ignored = true;
    };
  }, [activeUnitId, canAccess]);

  const attendanceOptions = React.useMemo(
    () => uniqueOptions(leads, "attendanceId", "attendanceName"),
    [leads],
  );
  const courseOptions = React.useMemo(
    () => uniqueOptions(leads, "courseId", "courseName"),
    [leads],
  );
  const channelOptions = React.useMemo(
    () => uniqueOptions(leads, "acquisitionChannelId", "acquisitionChannelName"),
    [leads],
  );
  const cityOptions = React.useMemo(
    () =>
      Array.from(new Set(leads.map((lead) => lead.city).filter(Boolean) as Array<string>)).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [leads],
  );
  const filteredLeads = React.useMemo(
    () =>
      filterPipelineLeads(leads, filters, {
        search,
        consultantId: session?.user.role === "CONSULTOR" ? session.user.id : undefined,
        consultantScope: "all",
        canViewAcquisitionChannel,
      }),
    [canViewAcquisitionChannel, filters, leads, search, session?.user.id, session?.user.role],
  );
  const activeFilterCount = countActivePipelineFilters(filters, canViewAcquisitionChannel);

  function updateFilter<K extends keyof PipelineFilters>(key: K, value: PipelineFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setSearch("");
    setFilters(emptyPipelineFilters());
  }

  function exportCsv() {
    if (!filteredLeads.length) {
      toast.error("Nenhum lead encontrado para exportar.");
      return;
    }
    const blob = new Blob([leadsToCsv(filteredLeads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = leadExportFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success(`${filteredLeads.length} lead(s) exportado(s).`);
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
            A exportação de leads está disponível somente para Diretores, Gerentes, Marketing e o
            usuário master.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/crm">Voltar ao CRM</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Comercial"
        title="Exportar leads"
        description="Escolha os filtros e baixe os dados em uma planilha CSV."
        actions={
          <Button asChild variant="outline">
            <Link to="/crm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao CRM
            </Link>
          </Button>
        }
      />

      <Card className="border-primary/10 shadow-card">
        <CardHeader className="border-b bg-primary/[0.035]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-primary">
                <Filter className="h-5 w-5" /> Filtros da exportação
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Os filtros podem ser combinados para selecionar exatamente os leads desejados.
              </p>
            </div>
            <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">
              {activeFilterCount} filtro(s) ativo(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2 xl:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, telefone, e-mail, curso, cidade ou etapa"
              className="pl-9"
            />
          </div>

          <FilterSelect
            label="Status da turma"
            value={filters.attendanceStatus}
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                attendanceStatus: value,
                attendanceId: FILTER_ALL,
              }));
            }}
            options={[
              { id: FILTER_ALL, name: "Todas as turmas" },
              { id: "active", name: "Turmas ativas" },
              { id: "inactive", name: "Turmas inativas" },
            ]}
          />
          <FilterSelect
            label="Turma"
            value={filters.attendanceId}
            onChange={(value) => updateFilter("attendanceId", value)}
            options={[
              { id: FILTER_ALL, name: "Todas as turmas" },
              ...attendanceOptions.filter((option) => {
                if (filters.attendanceStatus === FILTER_ALL) return true;
                return leads.some(
                  (lead) =>
                    lead.attendanceId === option.id &&
                    lead.attendanceStatus === filters.attendanceStatus,
                );
              }),
            ]}
          />
          <FilterSelect
            label="Curso"
            value={filters.courseId}
            onChange={(value) => updateFilter("courseId", value)}
            options={[{ id: FILTER_ALL, name: "Todos os cursos" }, ...courseOptions]}
          />
          {canViewAcquisitionChannel ? (
            <FilterSelect
              label="Origem"
              value={filters.channelId}
              onChange={(value) => updateFilter("channelId", value)}
              options={[{ id: FILTER_ALL, name: "Todas as origens" }, ...channelOptions]}
            />
          ) : null}
          <FilterSelect
            label="Responsável"
            value={filters.ownerId}
            onChange={(value) => updateFilter("ownerId", value)}
            options={[
              { id: FILTER_ALL, name: "Todos os responsáveis" },
              ...owners.map((owner) => ({
                id: owner.id,
                name: `${owner.name} · ${ROLE_LABELS[owner.role]}`,
              })),
            ]}
          />
          <FilterSelect
            label="Cidade"
            value={filters.city}
            onChange={(value) => updateFilter("city", value)}
            options={[
              { id: FILTER_ALL, name: "Todas as cidades" },
              ...cityOptions.map((city) => ({ id: city, name: city })),
            ]}
          />
          <div className="space-y-2">
            <Label htmlFor="export-start-date">Data inicial</Label>
            <Input
              id="export-start-date"
              type="date"
              value={filters.startDate}
              max={filters.endDate || undefined}
              onChange={(event) => updateFilter("startDate", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-end-date">Data final</Label>
            <Input
              id="export-end-date"
              type="date"
              value={filters.endDate}
              min={filters.startDate || undefined}
              onChange={(event) => updateFilter("endDate", event.target.value)}
            />
          </div>
          <div className="flex items-end justify-end gap-2 md:col-span-2 xl:col-span-4">
            <Button
              type="button"
              variant="ghost"
              onClick={clearFilters}
              disabled={!search && !activeFilterCount}
            >
              <X className="mr-2 h-4 w-4" /> Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-primary/10 shadow-card">
        <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-card to-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-primary">
                <FileSpreadsheet className="h-5 w-5" /> Resultado
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {loading
                  ? "Carregando leads..."
                  : `${filteredLeads.length} de ${leads.length} lead(s) selecionado(s).`}
              </p>
            </div>
            <Button
              type="button"
              onClick={exportCsv}
              disabled={loading || !filteredLeads.length}
              className="bg-gradient-primary"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Lead</TableHead>
                    <TableHead>Turma / curso</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="pr-5">Cidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.slice(0, 50).map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="pl-5">
                        <div className="font-semibold">{lead.fullName}</div>
                        <div className="text-xs text-muted-foreground">{lead.phone}</div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-72 truncate">
                          {lead.attendanceName ?? "Sem turma"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lead.courseName ?? "Sem curso"}
                        </div>
                      </TableCell>
                      <TableCell>{lead.createdByName ?? "Sem responsável"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{lead.stage}</Badge>
                      </TableCell>
                      <TableCell className="pr-5">{lead.city ?? "--"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredLeads.length > 50 ? (
                <div className="border-t p-3 text-center text-xs text-muted-foreground">
                  Prévia dos primeiros 50 leads. O CSV incluirá todos os {filteredLeads.length}{" "}
                  resultados.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={FileSpreadsheet}
                title="Nenhum lead encontrado"
                description="Ajuste ou limpe os filtros para gerar a exportação."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
