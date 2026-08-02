import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Filter,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  Trash2,
  Undo2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { LeadRecord, PipelineColumn } from "@/lib/commercial-types";
import { useAuth } from "@/lib/auth";
import {
  canOperateCrm,
  canReturnStudentToLead,
  canTransferLeads,
  canViewStudents,
} from "@/lib/auth-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LeadsResponse = {
  leads: Array<LeadRecord>;
  pipelineColumns: Array<PipelineColumn>;
};

type StudentFilters = {
  courseId: string;
  channelId: string;
  city: string;
  unitId: string;
};

const FILTER_ALL = "__all__";

const fallbackStudentColumns: Array<PipelineColumn> = [
  {
    id: "enrolled",
    unitId: "",
    pipelineType: "students",
    name: "Matrícula confirmada",
    color: "blue",
    position: 10,
    systemKey: "enrolled",
    semanticStage: null,
  },
  {
    id: "follow-up",
    unitId: "",
    pipelineType: "students",
    name: "Em acompanhamento",
    color: "gold",
    position: 20,
    systemKey: "follow_up",
    semanticStage: null,
  },
  {
    id: "completed",
    unitId: "",
    pipelineType: "students",
    name: "Concluído",
    color: "green",
    position: 30,
    systemKey: "completed",
    semanticStage: null,
  },
];

const studentColumnStyles: Record<string, { accent: string; surface: string; badge: string }> = {
  blue: {
    accent: "bg-[#377DFE]",
    surface: "from-[#377DFE]/10",
    badge: "bg-[#377DFE]/10 text-[#224C99]",
  },
  indigo: {
    accent: "bg-[#16006C]",
    surface: "from-[#16006C]/10",
    badge: "bg-[#16006C]/10 text-[#16006C]",
  },
  gold: {
    accent: "bg-[#F4B728]",
    surface: "from-[#F4B728]/15",
    badge: "bg-[#F4B728]/15 text-[#8A6100]",
  },
  orange: {
    accent: "bg-[#FF8A1F]",
    surface: "from-[#FF8A1F]/10",
    badge: "bg-[#FF8A1F]/10 text-[#B55400]",
  },
  green: {
    accent: "bg-emerald-500",
    surface: "from-emerald-500/10",
    badge: "bg-emerald-500/10 text-emerald-700",
  },
  rose: {
    accent: "bg-rose-500",
    surface: "from-rose-500/10",
    badge: "bg-rose-500/10 text-rose-700",
  },
};

function emptyStudentFilters(): StudentFilters {
  return {
    courseId: FILTER_ALL,
    channelId: FILTER_ALL,
    city: FILTER_ALL,
    unitId: FILTER_ALL,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Falha na requisição.");
  }

  return data;
}

function unitQuery(unitId: string) {
  return `?unitId=${encodeURIComponent(unitId)}&view=students`;
}

export const Route = createFileRoute("/leads/")({
  head: () => ({ meta: [{ title: "Alunos · Star Profissões" }] }),
  component: LeadsList,
});

function LeadsList() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const canViewStudentList = session ? canViewStudents(session.user.role) : false;
  const canRemoveStudents = session ? canTransferLeads(session.user.role) : false;
  const canMoveStudents = session ? canOperateCrm(session.user.role) : false;
  const canReturnStudents = session ? canReturnStudentToLead(session.user.role) : false;
  const isConsultant = session?.user.role === "CONSULTOR";
  const [leads, setLeads] = React.useState<Array<LeadRecord>>([]);
  const [pipelineColumns, setPipelineColumns] = React.useState<Array<PipelineColumn>>([]);
  const [search, setSearch] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<StudentFilters>(() => emptyStudentFilters());
  const [loading, setLoading] = React.useState(true);
  const [removingLeadId, setRemovingLeadId] = React.useState<string | null>(null);
  const [returningLeadId, setReturningLeadId] = React.useState<string | null>(null);
  const [syncingLeadId, setSyncingLeadId] = React.useState<string | null>(null);
  const [draggingLeadId, setDraggingLeadId] = React.useState<string | null>(null);
  const [dropTargetColumnId, setDropTargetColumnId] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadLeads() {
      if (session && !canViewStudentList) {
        setLeads([]);
        setLoading(false);
        return;
      }

      if (!activeUnitId) {
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

        setLeads(data.leads);
        setPipelineColumns(data.pipelineColumns ?? []);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar alunos.");
      } finally {
        setLoading(false);
      }
    }

    void loadLeads();
  }, [activeUnitId, canViewStudentList, session]);

  if (session && !canViewStudentList) {
    return <StudentsAccessDenied />;
  }

  const courseOptions = Array.from(
    new Map(
      leads
        .filter((lead) => lead.courseId && lead.courseName)
        .map((lead) => [lead.courseId as string, lead.courseName as string]),
    ),
    ([id, name]) => ({ id, name }),
  ).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  const channelOptions = Array.from(
    new Map(
      leads
        .filter((lead) => lead.acquisitionChannelId && lead.acquisitionChannelName)
        .map((lead) => [
          lead.acquisitionChannelId as string,
          lead.acquisitionChannelName as string,
        ]),
    ),
    ([id, name]) => ({ id, name }),
  ).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  const cityOptions = Array.from(
    new Set(leads.map((lead) => lead.city).filter(Boolean) as Array<string>),
  ).sort((first, second) => first.localeCompare(second, "pt-BR"));
  const unitOptions = Array.from(
    new Map(leads.map((lead) => [lead.unitId, lead.unitName])),
    ([id, name]) => ({ id, name }),
  ).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  const activeFilterCount = [
    filters.courseId,
    filters.channelId,
    filters.city,
    filters.unitId,
  ].filter((value) => value !== FILTER_ALL).length;

  const filteredLeads = leads.filter((lead) => {
    const searchText = [
      lead.fullName,
      lead.phone,
      lead.phone2,
      lead.email,
      lead.city,
      lead.courseName,
      lead.acquisitionChannelName,
      lead.unitName,
      lead.stage,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      searchText.includes(search.trim().toLowerCase()) &&
      (filters.courseId === FILTER_ALL || lead.courseId === filters.courseId) &&
      (filters.channelId === FILTER_ALL || lead.acquisitionChannelId === filters.channelId) &&
      (filters.city === FILTER_ALL || lead.city === filters.city) &&
      (filters.unitId === FILTER_ALL || lead.unitId === filters.unitId)
    );
  });
  const displayColumns = pipelineColumns.length ? pipelineColumns : fallbackStudentColumns;

  function resolveStudentColumn(lead: LeadRecord) {
    if (lead.studentPipelineColumnId) {
      const assigned = displayColumns.find((column) => column.id === lead.studentPipelineColumnId);
      if (assigned) return assigned;
    }
    return displayColumns.find((column) => column.systemKey === "enrolled") ?? displayColumns[0];
  }

  function clearStudentFilters() {
    setSearch("");
    setFilters(emptyStudentFilters());
  }

  async function handleRemoveStudent(lead: LeadRecord) {
    if (!window.confirm(`Remover o cliente "${lead.fullName}" do banco de dados?`)) {
      return;
    }

    setRemovingLeadId(lead.id);

    try {
      await readJson<{ ok: true }>(
        await fetch(`/api/crm/leads/${lead.id}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      );

      setLeads((current) => current.filter((item) => item.id !== lead.id));
      toast.success("Cliente removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover cliente.");
    } finally {
      setRemovingLeadId(null);
    }
  }

  async function moveStudent(lead: LeadRecord, column: PipelineColumn) {
    if (!canMoveStudents || lead.studentPipelineColumnId === column.id) return;

    const previousColumnId = lead.studentPipelineColumnId;
    setSyncingLeadId(lead.id);
    setLeads((current) =>
      current.map((item) =>
        item.id === lead.id ? { ...item, studentPipelineColumnId: column.id } : item,
      ),
    );

    try {
      await readJson<{ ok: true; studentPipelineColumnId: string }>(
        await fetch(`/api/crm/leads/${lead.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ studentPipelineColumnId: column.id }),
        }),
      );
      toast.success(`${lead.fullName} movido para ${column.name}.`);
    } catch (error) {
      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id ? { ...item, studentPipelineColumnId: previousColumnId } : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : "Falha ao mover aluno.");
    } finally {
      setSyncingLeadId(null);
      setDraggingLeadId(null);
      setDropTargetColumnId(null);
    }
  }

  async function handleReturnToLeads(lead: LeadRecord) {
    if (
      !window.confirm(
        `Voltar “${lead.fullName}” para leads? A confirmação da taxa será desfeita e o registro voltará para a etapa anterior do CRM.`,
      )
    ) {
      return;
    }

    setReturningLeadId(lead.id);

    try {
      const result = await readJson<{
        ok: true;
        stage: LeadRecord["stage"];
        pipelineColumnId: string | null;
      }>(
        await fetch(`/api/crm/leads/${lead.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ returnToLead: true }),
        }),
      );

      setLeads((current) => current.filter((item) => item.id !== lead.id));
      toast.success(`${lead.fullName} voltou para ${result.stage} no CRM.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao voltar o aluno para leads.");
    } finally {
      setReturningLeadId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Comercial"
        title="Alunos"
        description={
          isConsultant
            ? "Seus alunos convertidos quando a taxa foi confirmada no CRM Pipeline."
            : "Base de alunos convertidos quando a taxa foi confirmada no CRM Pipeline."
        }
      />
      <Card className="shadow-card">
        <div className="border-b border-border p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por aluno, telefone, curso, cidade ou origem..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={filtersOpen ? "default" : "outline"}
                onClick={() => setFiltersOpen((open) => !open)}
                className={filtersOpen ? "bg-gradient-primary" : ""}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filtros
                {activeFilterCount ? (
                  <Badge className="ml-2 bg-gold text-gold-foreground">{activeFilterCount}</Badge>
                ) : null}
              </Button>
              {search || activeFilterCount ? (
                <Button type="button" variant="ghost" onClick={clearStudentFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>

          {filtersOpen ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/25 p-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Curso</Label>
                <Select
                  value={filters.courseId}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, courseId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os cursos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>Todos os cursos</SelectItem>
                    {courseOptions.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Origem</Label>
                <Select
                  value={filters.channelId}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, channelId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as origens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>Todas as origens</SelectItem>
                    {channelOptions.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cidade</Label>
                <Select
                  value={filters.city}
                  onValueChange={(value) => setFilters((current) => ({ ...current, city: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as cidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>Todas as cidades</SelectItem>
                    {cityOptions.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={filters.unitId}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, unitId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as unidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>Todas as unidades</SelectItem>
                    {unitOptions.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
        <div className="bg-[#F7F8FC] p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#224C99]">
                Jornada do aluno
              </div>
              <h2 className="mt-1 text-lg font-black text-[#07154C]">Pipeline de matrículas</h2>
            </div>
            <Badge variant="secondary" className="bg-[#16006C]/10 text-[#16006C]">
              {filteredLeads.length} alunos
            </Badge>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {displayColumns.map((column, columnIndex) => {
                const columnStudents = filteredLeads.filter(
                  (lead) => resolveStudentColumn(lead)?.id === column.id,
                );
                const style = studentColumnStyles[column.color] ?? studentColumnStyles.blue;
                const isDropTarget = dropTargetColumnId === column.id;

                return (
                  <section
                    key={column.id}
                    className={`w-[320px] flex-shrink-0 overflow-hidden rounded-[22px] border bg-gradient-to-b ${style.surface} to-white/80 transition ${
                      isDropTarget
                        ? "border-[#F4B728] ring-2 ring-[#F4B728]/25"
                        : "border-[#16006C]/10"
                    }`}
                    onDragOver={(event) => {
                      if (!canMoveStudents) return;
                      event.preventDefault();
                      setDropTargetColumnId(column.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const lead = leads.find(
                        (item) => item.id === event.dataTransfer.getData("text/plain"),
                      );
                      if (lead) void moveStudent(lead, column);
                    }}
                    onDragLeave={() =>
                      setDropTargetColumnId((current) => (current === column.id ? null : current))
                    }
                  >
                    <header className="flex items-center justify-between border-b border-[#16006C]/10 bg-white/80 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${style.accent}`}
                        >
                          {String(columnIndex + 1).padStart(2, "0")}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black text-[#07154C]">
                            {column.name}
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            {columnStudents.length} registros
                          </p>
                        </div>
                      </div>
                    </header>

                    <div className="min-h-[340px] space-y-3 p-3">
                      {loading ? (
                        <EmptyState
                          icon={Users}
                          title="Carregando"
                          description="Buscando alunos."
                        />
                      ) : columnStudents.length ? (
                        columnStudents.map((lead) => (
                          <Card
                            key={lead.id}
                            draggable={canMoveStudents}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", lead.id);
                              setDraggingLeadId(lead.id);
                            }}
                            onDragEnd={() => {
                              setDraggingLeadId(null);
                              setDropTargetColumnId(null);
                            }}
                            className={`overflow-hidden border-[#16006C]/10 bg-white p-0 shadow-card ${
                              canMoveStudents ? "cursor-grab active:cursor-grabbing" : ""
                            } ${draggingLeadId === lead.id ? "opacity-60" : ""} ${
                              syncingLeadId === lead.id ? "ring-2 ring-primary/25" : ""
                            }`}
                          >
                            <div className={`h-1 ${style.accent}`} />
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black text-[#07154C]">
                                    {lead.fullName}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5 text-[#224C99]" />
                                    {lead.phone}
                                  </div>
                                </div>
                                {canRemoveStudents ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => void handleRemoveStudent(lead)}
                                    disabled={removingLeadId === lead.id}
                                    className="h-8 w-8 text-destructive"
                                    aria-label={`Remover ${lead.fullName}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                              <div className="mt-3 space-y-1.5 rounded-xl bg-[#F7F8FC] p-3 text-[11px] text-muted-foreground">
                                {lead.courseName ? (
                                  <div className="flex items-center gap-2">
                                    <BookOpenCheck className="h-3.5 w-3.5 text-[#224C99]" />
                                    <span className="truncate">{lead.courseName}</span>
                                  </div>
                                ) : null}
                                {lead.city ? (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3.5 w-3.5 text-[#224C99]" />
                                    <span className="truncate">{lead.city}</span>
                                  </div>
                                ) : null}
                                {lead.email ? (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3.5 w-3.5 text-[#224C99]" />
                                    <span className="truncate">{lead.email}</span>
                                  </div>
                                ) : null}
                                {lead.createdByName ? (
                                  <div className="flex items-center gap-2">
                                    <UserCheck className="h-3.5 w-3.5 text-[#224C99]" />
                                    <span className="truncate">{lead.createdByName}</span>
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <Badge className={style.badge}>Aluno</Badge>
                                <strong className="text-xs text-[#16006C]">
                                  {lead.courseValue !== null
                                    ? lead.courseValue.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                      })
                                    : "--"}
                                </strong>
                              </div>
                              {canReturnStudents ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleReturnToLeads(lead)}
                                  disabled={
                                    returningLeadId === lead.id || syncingLeadId === lead.id
                                  }
                                  className="mt-3 w-full border-[#224C99]/20 bg-[#224C99]/5 text-[#224C99] hover:bg-[#224C99]/10 hover:text-[#07154C]"
                                >
                                  <Undo2 className="mr-2 h-4 w-4" />
                                  {returningLeadId === lead.id
                                    ? "Retornando..."
                                    : "Voltar para leads"}
                                </Button>
                              ) : null}
                            </div>
                          </Card>
                        ))
                      ) : (
                        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#16006C]/15 bg-white/45 p-5 text-center">
                          <div className={`mb-3 h-2 w-2 rounded-full ${style.accent}`} />
                          <div className="text-sm font-bold text-[#07154C]">Etapa livre</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Arraste alunos para esta coluna.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StudentsAccessDenied() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A lista de alunos não está disponível para este perfil.
        </p>
      </div>
    </div>
  );
}
