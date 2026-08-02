import * as React from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  BookOpenCheck,
  CalendarClock,
  CheckSquare2,
  CheckCircle2,
  Clock3,
  Filter,
  KanbanSquare,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AcquisitionChannelRecord,
  CourseRecord,
  LeadRecord,
  LeadStage,
} from "@/lib/commercial-types";
import type { CrmLeadTask } from "@/lib/crm-task-types";
import { useAuth } from "@/lib/auth";
import { canAccessLeadTransferCenter, canOperateCrm, canTransferLeads } from "@/lib/auth-types";
import { EmptyState } from "@/components/layout/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type LeadFormState = {
  fullName: string;
  phone: string;
  phone2: string;
  email: string;
  city: string;
  attendanceId: string;
  courseId: string;
  acquisitionChannelId: string;
  unitId: string;
  observations: string;
  stage: LeadStage;
};

type LeadTaskFormState = {
  title: string;
  dueAt: string;
  notes: string;
};

type LeadDialogMode = "create" | "edit";

type LeadsResponse = {
  leads: Array<LeadRecord>;
};

type CoursesResponse = {
  courses: Array<CourseRecord>;
  attendances: Array<AttendanceOption>;
};

type AttendanceOption = {
  id: string;
  unitId: string;
  courseId: string;
  city: string;
  state: string;
  classDate: string;
  status: "active" | "inactive";
  displayName: string;
};

type ChannelsResponse = {
  channels: Array<AcquisitionChannelRecord>;
};

type TasksResponse = {
  tasks: Array<CrmLeadTask>;
};

type TaskResponse = {
  task: CrmLeadTask;
};

type TransferConsultant = {
  id: string;
  name: string;
  email: string;
};

type TransferLead = {
  id: string;
  fullName: string;
  phone: string;
  courseName: string | null;
  stage: LeadStage;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  ageHours: number;
  transferable: boolean;
};

type TransferDataResponse = {
  consultants: Array<TransferConsultant>;
  leads: Array<TransferLead>;
};

type TransferSubmitResponse = {
  transferredIds: Array<string>;
};

const NO_SELECTION = "__none__";
const FILTER_ALL = "__all__";
const PIPELINE_STAGE_PAGE_SIZE = 15;
const CONSULTANT_PIPELINE_VALUE = 130;

const stages: Array<LeadStage> = [
  "Novo lead",
  "Em contato",
  "Qualificado",
  "Proposta",
  "Pagamento pendente",
  "Recuperação",
];

const pipelineStageVisual: Record<
  string,
  { accent: string; badge: string; dot: string; surface: string }
> = {
  "Novo lead": {
    accent: "bg-[#377DFE]",
    badge: "border-[#377DFE]/25 bg-[#377DFE]/10 text-[#224C99]",
    dot: "bg-[#377DFE]",
    surface: "from-[#377DFE]/10",
  },
  "Em contato": {
    accent: "bg-[#16006C]",
    badge: "border-[#16006C]/20 bg-[#16006C]/10 text-[#16006C]",
    dot: "bg-[#16006C]",
    surface: "from-[#16006C]/10",
  },
  Qualificado: {
    accent: "bg-[#F4B728]",
    badge: "border-[#D99A10]/25 bg-[#F4B728]/15 text-[#8A6100]",
    dot: "bg-[#F4B728]",
    surface: "from-[#F4B728]/15",
  },
  Proposta: {
    accent: "bg-[#FF8A1F]",
    badge: "border-[#FF8A1F]/25 bg-[#FF8A1F]/10 text-[#B55400]",
    dot: "bg-[#FF8A1F]",
    surface: "from-[#FF8A1F]/10",
  },
  "Pagamento pendente": {
    accent: "bg-emerald-500",
    badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
    dot: "bg-emerald-500",
    surface: "from-emerald-500/10",
  },
  Recuperação: {
    accent: "bg-rose-500",
    badge: "border-rose-500/25 bg-rose-500/10 text-rose-700",
    dot: "bg-rose-500",
    surface: "from-rose-500/10",
  },
};

const stageLabels: Record<LeadStage, string> = {
  "Novo lead": "Novo lead",
  "Em contato": "Em contato",
  Qualificado: "Qualificado",
  Proposta: "Proposta",
  "Pagamento pendente": "Pagamento pendente",
  Confirmado: "Confirmado",
  Recuperação: "Recuperação",
  Matriculado: "Matriculado",
};

const pollingIntervalMs = 20000;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const confettiPalette = ["#F7D34D", "#224C99", "#22C55E", "#15803D"];
const confettiPieces = Array.from({ length: 72 }, (_, index) => ({
  id: index,
  color: confettiPalette[index % confettiPalette.length],
  left: 6 + ((index * 19) % 88),
  delay: (index % 12) * 55,
  drift: ((index % 9) - 4) * 26,
  rise: 82 + ((index * 13) % 18),
  spin: 360 + ((index * 47) % 520),
  width: index % 3 === 0 ? 8 : 10,
  height: index % 4 === 0 ? 18 : 12,
}));

type PipelineFilters = {
  courseId: string;
  channelId: string;
  ownerId: string;
  city: string;
};

function emptyPipelineFilters(): PipelineFilters {
  return {
    courseId: FILTER_ALL,
    channelId: FILTER_ALL,
    ownerId: FILTER_ALL,
    city: FILTER_ALL,
  };
}

function leadMatchesSearch(lead: LeadRecord, search: string) {
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
    lead.createdByName,
    lead.unitName,
    lead.stage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function pipelineDisplayValue(lead: LeadRecord, role?: string) {
  if (role === "CONSULTOR") {
    return CONSULTANT_PIPELINE_VALUE;
  }

  return lead.courseValue;
}

function emptyLeadForm(unitId = ""): LeadFormState {
  return {
    fullName: "",
    phone: "",
    phone2: "",
    email: "",
    city: "",
    attendanceId: "",
    courseId: "",
    acquisitionChannelId: "",
    unitId,
    observations: "",
    stage: "Novo lead",
  };
}

function emptyTaskForm(): LeadTaskFormState {
  return {
    title: "",
    dueAt: "",
    notes: "",
  };
}

function leadFormFromLead(lead: LeadRecord): LeadFormState {
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    phone2: lead.phone2 ?? "",
    email: lead.email ?? "",
    city: lead.city ?? "",
    attendanceId: lead.attendanceId ?? "",
    courseId: lead.courseId ?? "",
    acquisitionChannelId: lead.acquisitionChannelId ?? "",
    unitId: lead.unitId,
    observations: lead.observations ?? "",
    stage: lead.stage === "Confirmado" ? "Pagamento pendente" : lead.stage,
  };
}

function pipelineStage(stage: LeadStage): LeadStage {
  return stage === "Confirmado" ? "Pagamento pendente" : stage;
}

function localDateTimeToIso(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatTaskDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getAgeHours(value: string) {
  const createdAt = new Date(value).getTime();

  if (Number.isNaN(createdAt)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - createdAt) / 3_600_000));
}

function formatLeadCreatedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário indisponível";
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return `Criado às ${time}`;
}

function formatTransferLeadAge(lead: TransferLead) {
  if (lead.ageHours < 24) {
    return `${lead.ageHours}h`;
  }

  const days = Math.floor(lead.ageHours / 24);
  const hours = lead.ageHours % 24;

  return hours ? `${days}d ${hours}h` : `${days}d`;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Falha na requisição.");
  }

  return data;
}

function unitQuery(unitId: string) {
  return `?unitId=${encodeURIComponent(unitId)}`;
}

export const Route = createFileRoute("/crm")({
  head: () => ({ meta: [{ title: "Leads · Star Profissões" }] }),
  component: CRM,
});

function CRM() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  if (path !== "/crm" && path !== "/crm/") {
    return <Outlet />;
  }

  return <CRMPipeline />;
}

function CRMPipeline() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const [leads, setLeads] = React.useState<Array<LeadRecord>>([]);
  const [courses, setCourses] = React.useState<Array<CourseRecord>>([]);
  const [attendances, setAttendances] = React.useState<Array<AttendanceOption>>([]);
  const [channels, setChannels] = React.useState<Array<AcquisitionChannelRecord>>([]);
  const [leadDialogOpen, setLeadDialogOpen] = React.useState(false);
  const [leadDialogMode, setLeadDialogMode] = React.useState<LeadDialogMode>("create");
  const [editingLead, setEditingLead] = React.useState<LeadRecord | null>(null);
  const [form, setForm] = React.useState<LeadFormState>(() => emptyLeadForm(activeUnitId));
  const [search, setSearch] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<PipelineFilters>(() => emptyPipelineFilters());
  const [stageVisibleCounts, setStageVisibleCounts] = React.useState<
    Partial<Record<LeadStage, number>>
  >({});
  const [loadingLeads, setLoadingLeads] = React.useState(true);
  const [loadingOptions, setLoadingOptions] = React.useState(false);
  const [leadTasks, setLeadTasks] = React.useState<Array<CrmLeadTask>>([]);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [taskForm, setTaskForm] = React.useState<LeadTaskFormState>(() => emptyTaskForm());
  const [savingTask, setSavingTask] = React.useState(false);
  const [updatingTaskId, setUpdatingTaskId] = React.useState<string | null>(null);
  const [removingTaskId, setRemovingTaskId] = React.useState<string | null>(null);
  const [savingLead, setSavingLead] = React.useState(false);
  const [removingLeadId, setRemovingLeadId] = React.useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = React.useState<string | null>(null);
  const [confettiRunId, setConfettiRunId] = React.useState(0);
  const [draggingLeadId, setDraggingLeadId] = React.useState<string | null>(null);
  const [dropTargetStage, setDropTargetStage] = React.useState<LeadStage | null>(null);
  const [syncingLeadId, setSyncingLeadId] = React.useState<string | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = React.useState(false);
  const [transferLeads, setTransferLeads] = React.useState<Array<TransferLead>>([]);
  const [transferConsultants, setTransferConsultants] = React.useState<Array<TransferConsultant>>(
    [],
  );
  const [selectedTransferLeadIds, setSelectedTransferLeadIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [transferTargetUserId, setTransferTargetUserId] = React.useState("");
  const [loadingTransferData, setLoadingTransferData] = React.useState(false);
  const [transferringLeads, setTransferringLeads] = React.useState(false);
  const formUnitId = form.unitId || activeUnitId;
  const selectedCourse = courses.find((course) => course.id === form.courseId) ?? null;
  const selectedAttendance =
    attendances.find((attendance) => attendance.id === form.attendanceId) ?? null;
  const broadcastChannelRef = React.useRef<BroadcastChannel | null>(null);
  const canTransferUnitLeads = session ? canTransferLeads(session.user.role) : false;
  const canAccessTransfers = session ? canAccessLeadTransferCenter(session.user.role) : false;
  const canOperatePipeline = session ? canOperateCrm(session.user.role) : false;
  const canRemoveLeads = canTransferUnitLeads;
  const canViewAcquisitionChannel = session?.user.role !== "CONSULTOR";
  const canViewLeadAge = session?.user.role !== "CONSULTOR";
  const selectedTransferCount = selectedTransferLeadIds.size;
  const activeFilterCount = [
    filters.courseId,
    filters.channelId,
    filters.ownerId,
    filters.city,
  ].filter((value) => value !== FILTER_ALL).length;
  const ownerOptions = React.useMemo(() => {
    const map = new Map<string, string>();

    leads.forEach((lead) => {
      if (lead.createdById && lead.createdByName) {
        map.set(lead.createdById, lead.createdByName);
      }
    });

    return Array.from(map, ([id, name]) => ({ id, name })).sort((first, second) =>
      first.name.localeCompare(second.name, "pt-BR"),
    );
  }, [leads]);
  const cityOptions = React.useMemo(
    () =>
      Array.from(new Set(leads.map((lead) => lead.city).filter(Boolean) as Array<string>)).sort(
        (first, second) => first.localeCompare(second, "pt-BR"),
      ),
    [leads],
  );
  const filteredLeads = React.useMemo(
    () =>
      leads.filter(
        (lead) =>
          leadMatchesSearch(lead, search) &&
          (filters.courseId === FILTER_ALL || lead.courseId === filters.courseId) &&
          (filters.channelId === FILTER_ALL || lead.acquisitionChannelId === filters.channelId) &&
          (filters.ownerId === FILTER_ALL || lead.createdById === filters.ownerId) &&
          (filters.city === FILTER_ALL || lead.city === filters.city),
      ),
    [filters, leads, search],
  );

  React.useEffect(() => {
    setStageVisibleCounts({});
  }, [filters, search]);

  const loadLeads = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!activeUnitId) {
        setLoadingLeads(false);
        return;
      }

      if (!options?.silent) {
        setLoadingLeads(true);
      }

      try {
        const data = await readJson<LeadsResponse>(
          await fetch(`/api/crm/leads${unitQuery(activeUnitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );

        setLeads(data.leads);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar leads.");
      } finally {
        if (!options?.silent) {
          setLoadingLeads(false);
        }
      }
    },
    [activeUnitId],
  );

  const loadOptions = React.useCallback(async (unitId: string) => {
    if (!unitId) {
      setCourses([]);
      setAttendances([]);
      setChannels([]);
      return;
    }

    setLoadingOptions(true);

    try {
      const [coursesData, channelsData] = await Promise.all([
        readJson<CoursesResponse>(
          await fetch(`/api/gestao/courses${unitQuery(unitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        ),
        readJson<ChannelsResponse>(
          await fetch(`/api/gestao/channels${unitQuery(unitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        ),
      ]);

      setCourses(coursesData.courses.filter((course) => course.status === "active"));
      setAttendances(coursesData.attendances);
      setChannels(channelsData.channels.filter((channel) => channel.status === "active"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar opções do lead.");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const loadLeadTasks = React.useCallback(
    async (leadId: string, options?: { silent?: boolean }) => {
      if (!leadId) {
        setLeadTasks([]);
        return;
      }

      if (!options?.silent) {
        setLoadingTasks(true);
      }

      try {
        const data = await readJson<TasksResponse>(
          await fetch(`/api/crm/tasks?leadId=${encodeURIComponent(leadId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );

        setLeadTasks(data.tasks);
      } catch (error) {
        if (!options?.silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar tarefas.");
        }
      } finally {
        if (!options?.silent) {
          setLoadingTasks(false);
        }
      }
    },
    [],
  );

  const loadTransferData = React.useCallback(async () => {
    if (!activeUnitId || !canAccessTransfers) {
      setTransferLeads([]);
      setTransferConsultants([]);
      return;
    }

    setLoadingTransferData(true);

    try {
      const data = await readJson<TransferDataResponse>(
        await fetch(`/api/crm/transfer${unitQuery(activeUnitId)}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      );

      setTransferLeads(data.leads);
      setTransferConsultants(data.consultants);
      setSelectedTransferLeadIds((current) => {
        const availableIds = new Set(data.leads.map((lead) => lead.id));

        return new Set(Array.from(current).filter((id) => availableIds.has(id)));
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao carregar transferência de leads.",
      );
    } finally {
      setLoadingTransferData(false);
    }
  }, [activeUnitId, canAccessTransfers]);

  React.useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  React.useEffect(() => {
    if (!activeUnitId) {
      return undefined;
    }

    const channel =
      "BroadcastChannel" in window ? new BroadcastChannel(`crm-pipeline-${activeUnitId}`) : null;
    broadcastChannelRef.current = channel;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadLeads({ silent: true });
      }
    };

    const handleFocus = () => {
      void loadLeads({ silent: true });
    };

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === "lead-stage-updated" || event.data?.type === "lead-transferred") {
          void loadLeads({ silent: true });
        }
      };
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadLeads({ silent: true });
      }
    }, pollingIntervalMs);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      channel?.close();
      if (broadcastChannelRef.current === channel) {
        broadcastChannelRef.current = null;
      }
    };
  }, [activeUnitId, loadLeads]);

  React.useEffect(() => {
    if (activeUnitId) {
      setForm((current) => ({ ...current, unitId: current.unitId || activeUnitId }));
    }
  }, [activeUnitId]);

  React.useEffect(() => {
    void loadOptions(formUnitId);
  }, [formUnitId, loadOptions]);

  function openLeadDialog() {
    const unitId = activeUnitId || session?.units[0]?.id || "";

    setLeadDialogMode("create");
    setEditingLead(null);
    setForm(emptyLeadForm(unitId));
    setLeadTasks([]);
    setTaskForm(emptyTaskForm());
    setLeadDialogOpen(true);
  }

  function openEditLeadDialog(lead: LeadRecord) {
    setLeadDialogMode("edit");
    setEditingLead(lead);
    setForm(leadFormFromLead(lead));
    setTaskForm(emptyTaskForm());
    void loadLeadTasks(lead.id);
    setLeadDialogOpen(true);
  }

  async function handleSubmitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.fullName.trim() || !form.phone.trim()) {
      toast.error("Nome completo e telefone são obrigatórios.");
      return;
    }
    if (!form.attendanceId) {
      toast.error("Selecione a turma do lead.");
      return;
    }

    setSavingLead(true);

    try {
      const payload = {
        ...form,
        courseId: form.courseId === NO_SELECTION ? "" : form.courseId,
        acquisitionChannelId:
          form.acquisitionChannelId === NO_SELECTION ? "" : form.acquisitionChannelId,
      };
      if (leadDialogMode === "create") {
        const data = await readJson<{ lead: LeadRecord }>(
          await fetch("/api/crm/leads", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }),
        );

        toast.success("Lead criado.");
        setLeadDialogOpen(false);
        setForm(emptyLeadForm(activeUnitId));

        if (data.lead.unitId === activeUnitId) {
          setLeads((current) => [data.lead, ...current]);
        }
      } else if (editingLead) {
        await readJson<{ ok: true; stage: LeadStage }>(
          await fetch(`/api/crm/leads/${editingLead.id}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...payload, stage: form.stage }),
          }),
        );

        const attendance = attendances.find((item) => item.id === payload.attendanceId);
        const course = courses.find((item) => item.id === attendance?.courseId);
        const channel = channels.find((item) => item.id === (payload.acquisitionChannelId || ""));

        setLeads((current) =>
          current.map((item) =>
            item.id === editingLead.id
              ? {
                  ...item,
                  fullName: payload.fullName,
                  phone: payload.phone,
                  phone2: payload.phone2 || null,
                  email: payload.email || null,
                  city: attendance
                    ? `${attendance.city} - ${attendance.state}`
                    : payload.city || null,
                  attendanceId: attendance?.id ?? null,
                  attendanceName: attendance?.displayName ?? null,
                  attendanceStatus: attendance?.status ?? null,
                  courseId: attendance?.courseId ?? null,
                  courseName: course?.name ?? null,
                  courseValue: course?.value ?? null,
                  acquisitionChannelId: payload.acquisitionChannelId || null,
                  acquisitionChannelName: channel?.name ?? null,
                  observations: payload.observations || null,
                  stage: form.stage,
                }
              : item,
          ),
        );

        toast.success("Lead atualizado.");
        setLeadDialogOpen(false);
        setEditingLead(null);
        setForm(emptyLeadForm(activeUnitId));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar lead.");
    } finally {
      setSavingLead(false);
    }
  }

  async function handleCreateTask() {
    if (!editingLead) {
      return;
    }

    const dueAt = localDateTimeToIso(taskForm.dueAt);

    if (!taskForm.title.trim() || !dueAt) {
      toast.error("Preencha o título e o horário da tarefa.");
      return;
    }

    setSavingTask(true);

    try {
      const data = await readJson<TaskResponse>(
        await fetch("/api/crm/tasks", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            leadId: editingLead.id,
            title: taskForm.title,
            dueAt,
            notes: taskForm.notes,
          }),
        }),
      );

      setLeadTasks((current) =>
        [data.task, ...current].sort(
          (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
        ),
      );
      setTaskForm(emptyTaskForm());
      toast.success("Tarefa agendada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar tarefa.");
    } finally {
      setSavingTask(false);
    }
  }

  async function updateTaskStatus(task: CrmLeadTask, status: "pending" | "done") {
    setUpdatingTaskId(task.id);

    try {
      const data = await readJson<TaskResponse>(
        await fetch("/api/crm/tasks", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskId: task.id, status }),
        }),
      );

      setLeadTasks((current) =>
        current.map((item) => (item.id === data.task.id ? data.task : item)),
      );
      toast.success(status === "done" ? "Tarefa concluída." : "Tarefa reaberta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar tarefa.");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function handleRemoveTask(task: CrmLeadTask) {
    if (!window.confirm(`Remover a tarefa "${task.title}"?`)) {
      return;
    }

    setRemovingTaskId(task.id);

    try {
      await readJson<{ ok: true }>(
        await fetch("/api/crm/tasks", {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskId: task.id }),
        }),
      );

      setLeadTasks((current) => current.filter((item) => item.id !== task.id));
      toast.success("Tarefa removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover tarefa.");
    } finally {
      setRemovingTaskId(null);
    }
  }

  async function handleRemoveLead(lead: LeadRecord) {
    if (!canRemoveLeads) {
      toast.error("Seu perfil nÃ£o permite excluir leads.");
      return;
    }

    if (!window.confirm(`Remover o lead "${lead.fullName}" do banco de dados?`)) {
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
      toast.success("Lead removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover lead.");
    } finally {
      setRemovingLeadId(null);
    }
  }

  async function updateLeadStage(lead: LeadRecord, nextStage: LeadStage) {
    if (lead.stage === nextStage) {
      return;
    }

    setSyncingLeadId(lead.id);
    setLeads((current) =>
      current.map((item) => (item.id === lead.id ? { ...item, stage: nextStage } : item)),
    );

    try {
      await readJson<{ ok: true; stage: LeadStage }>(
        await fetch(`/api/crm/leads/${lead.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stage: nextStage }),
        }),
      );

      broadcastChannelRef.current?.postMessage({
        type: "lead-stage-updated",
        leadId: lead.id,
        stage: nextStage,
      });

      void loadLeads({ silent: true });

      toast.success(`Lead movido para ${stageLabels[nextStage]}.`);
    } catch (error) {
      setLeads((current) =>
        current.map((item) => (item.id === lead.id ? { ...item, stage: lead.stage } : item)),
      );
      toast.error(error instanceof Error ? error.message : "Falha ao mover lead.");
    } finally {
      setSyncingLeadId(null);
      setDraggingLeadId(null);
      setDropTargetStage(null);
    }
  }

  async function handleConvertLeadToStudent() {
    if (!editingLead) {
      return;
    }

    setConvertingLeadId(editingLead.id);
    setConfettiRunId((current) => current + 1);

    try {
      await readJson<{ ok: true; stage: LeadStage }>(
        await fetch(`/api/crm/leads/${editingLead.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stage: "Matriculado" }),
        }),
      );

      setLeads((current) => current.filter((item) => item.id !== editingLead.id));
      broadcastChannelRef.current?.postMessage({
        type: "lead-stage-updated",
        leadId: editingLead.id,
        stage: "Matriculado",
      });

      toast.success("Taxa confirmada. Lead convertido em aluno.");
      setLeadDialogOpen(false);
      setEditingLead(null);
      setLeadDialogMode("create");
      setForm(emptyLeadForm(activeUnitId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao converter lead em aluno.");
    } finally {
      setConvertingLeadId(null);
    }
  }

  function handleDragStart(event: React.DragEvent<HTMLDivElement>, lead: LeadRecord) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", lead.id);
    setDraggingLeadId(lead.id);
  }

  function handleDragEnd() {
    setDraggingLeadId(null);
    setDropTargetStage(null);
  }

  function handleStageDrop(event: React.DragEvent<HTMLDivElement>, stage: LeadStage) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain");
    const lead = leads.find((item) => item.id === leadId);

    setDropTargetStage(null);

    if (!lead) {
      setDraggingLeadId(null);
      return;
    }

    void updateLeadStage(lead, stage);
  }

  function openTransferDialog() {
    setTransferDialogOpen(true);
    setSelectedTransferLeadIds(new Set());
    setTransferTargetUserId("");
    void loadTransferData();
  }

  function toggleTransferLead(lead: TransferLead, checked: boolean | "indeterminate") {
    if (!lead.transferable) {
      return;
    }

    setSelectedTransferLeadIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(lead.id);
      } else {
        next.delete(lead.id);
      }

      return next;
    });
  }

  function toggleAllTransferableLeads(checked: boolean | "indeterminate") {
    if (!checked) {
      setSelectedTransferLeadIds(new Set());
      return;
    }

    setSelectedTransferLeadIds(
      new Set(transferLeads.filter((lead) => lead.transferable).map((lead) => lead.id)),
    );
  }

  async function handleTransferLeads() {
    if (!activeUnitId) {
      return;
    }

    const leadIds = Array.from(selectedTransferLeadIds);

    if (!leadIds.length) {
      toast.error("Selecione ao menos um lead com mais de 48 horas.");
      return;
    }

    if (!transferTargetUserId) {
      toast.error("Escolha o consultor de destino.");
      return;
    }

    setTransferringLeads(true);

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
            targetUserId: transferTargetUserId,
          }),
        }),
      );

      toast.success(`${data.transferredIds.length} lead(s) transferido(s).`);
      setSelectedTransferLeadIds(new Set());
      setTransferTargetUserId("");
      broadcastChannelRef.current?.postMessage({
        type: "lead-transferred",
        leadIds: data.transferredIds,
      });
      void loadLeads({ silent: true });
      void loadTransferData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao transferir leads.");
    } finally {
      setTransferringLeads(false);
    }
  }

  function clearPipelineFilters() {
    setSearch("");
    setFilters(emptyPipelineFilters());
  }

  function loadMoreStageLeads(stage: LeadStage, totalLeads: number) {
    setStageVisibleCounts((current) => ({
      ...current,
      [stage]: Math.min(
        (current[stage] ?? PIPELINE_STAGE_PAGE_SIZE) + PIPELINE_STAGE_PAGE_SIZE,
        totalLeads,
      ),
    }));
  }

  return (
    <div className="space-y-6">
      <ConversionConfetti runId={confettiRunId} />
      <section className="relative overflow-hidden rounded-[28px] bg-[#16006C] px-5 py-6 text-white shadow-[0_28px_70px_-42px_rgba(22,0,108,0.9)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full bg-[#377DFE]/20 blur-3xl" />
        <div className="relative">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#F4B728]">
                <span className="h-px w-7 bg-[#F4B728]" />
                Central comercial
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Gestão de leads</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/65">
                Acompanhe cada oportunidade da primeira conversa até o fechamento.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[430px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 backdrop-blur-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                  Na visão
                </div>
                <div className="mt-1 text-xl font-black text-white">
                  {loadingLeads ? "—" : filteredLeads.length}
                </div>
                <div className="text-[10px] text-white/45">oportunidades</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 backdrop-blur-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                  Etapas
                </div>
                <div className="mt-1 text-xl font-black text-[#F4B728]">{stages.length}</div>
                <div className="text-[10px] text-white/45">no funil</div>
              </div>
              <div className="rounded-2xl border border-[#F4B728]/25 bg-[#F4B728]/10 px-3 py-3 backdrop-blur-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                  Filtros
                </div>
                <div className="mt-1 text-xl font-black text-[#F4B728]">{activeFilterCount}</div>
                <div className="text-[10px] text-white/45">ativos</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.07] p-2 backdrop-blur-md md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#16006C]/55" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Busque por nome, telefone, e-mail ou cidade"
                className="h-11 border-0 bg-white pl-10 text-[#07154C] shadow-none placeholder:text-[#07154C]/40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiltersOpen((open) => !open)}
                className={`h-11 flex-1 border-white/20 px-4 md:flex-none ${
                  filtersOpen
                    ? "bg-[#F4B728] text-[#07154C] hover:bg-[#F4B728]/90"
                    : "bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }`}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filtrar
                {activeFilterCount ? (
                  <span className="ml-2 rounded-full bg-[#16006C] px-2 py-0.5 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
              {canAccessTransfers ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={openTransferDialog}
                  className="h-11 flex-1 border-white/20 bg-white/10 px-4 text-white hover:bg-white/20 hover:text-white md:flex-none"
                  aria-label="Transferência de Lead"
                  title="Transferência de Lead"
                >
                  <Clock3 className="mr-2 h-4 w-4" />
                  Transferir
                </Button>
              ) : null}
              {search || activeFilterCount ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearPipelineFilters}
                  className="h-11 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <X className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
              ) : null}
              {canOperatePipeline ? (
                <Button
                  className="h-11 flex-1 bg-[#F4B728] px-5 font-bold text-[#07154C] hover:bg-[#F4B728]/90 md:flex-none"
                  onClick={openLeadDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo lead
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {filtersOpen ? (
        <div className="grid gap-4 rounded-[24px] border border-[#16006C]/10 bg-white p-5 shadow-card md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Curso</Label>
            <Select
              value={filters.courseId}
              onValueChange={(value) => setFilters((current) => ({ ...current, courseId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os cursos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>Todos os cursos</SelectItem>
                {courses.map((course) => (
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
              onValueChange={(value) => setFilters((current) => ({ ...current, channelId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>Todas as origens</SelectItem>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select
              value={filters.ownerId}
              onValueChange={(value) => setFilters((current) => ({ ...current, ownerId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os responsáveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>Todos os responsáveis</SelectItem>
                {ownerOptions.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.name}
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
        </div>
      ) : null}

      <section className="rounded-[28px] border border-[#16006C]/10 bg-[#F7F8FC] p-3 shadow-[0_22px_60px_-46px_rgba(7,21,76,0.65)] sm:p-5">
        <div className="mb-5 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#224C99]">
              <KanbanSquare className="h-4 w-4" />
              Jornada comercial
            </div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-[#07154C]">
              Fluxo de oportunidades
            </h2>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground sm:text-right">
            Arraste uma ficha entre as etapas para atualizar o andamento da negociação.
          </p>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {stages.map((stage, stageIndex) => {
              const stageLeads = filteredLeads.filter(
                (lead) => pipelineStage(lead.stage) === stage,
              );
              const visibleCount = stageVisibleCounts[stage] ?? PIPELINE_STAGE_PAGE_SIZE;
              const visibleStageLeads = stageLeads.slice(0, visibleCount);
              const hiddenCount = Math.max(stageLeads.length - visibleStageLeads.length, 0);
              const stageValue = stageLeads.reduce(
                (sum, lead) => sum + (pipelineDisplayValue(lead, session?.user.role) ?? 0),
                0,
              );
              const isDropTarget = dropTargetStage === stage;
              const stageVisual = pipelineStageVisual[stage];

              return (
                <div
                  key={stage}
                  className={`w-[310px] flex-shrink-0 overflow-hidden rounded-[22px] border bg-gradient-to-b ${stageVisual.surface} to-white/70 transition-all duration-200 ${
                    isDropTarget
                      ? "border-[#F4B728] shadow-[0_18px_42px_-28px_rgba(244,183,40,0.95)] ring-2 ring-[#F4B728]/20"
                      : "border-[#16006C]/10"
                  }`}
                >
                  <div className="border-b border-[#16006C]/10 bg-white/75 p-4 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-sm ${stageVisual.accent}`}
                        >
                          {String(stageIndex + 1).padStart(2, "0")}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black text-[#07154C]">{stage}</h3>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${stageVisual.dot}`} />
                            {loadingLeads ? "Carregando" : `${stageLeads.length} oportunidades`}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 border px-2 py-1 text-[10px] font-bold ${stageVisual.badge}`}
                      >
                        {currencyFormatter.format(stageValue)}
                      </Badge>
                    </div>
                  </div>
                  <div
                    className="min-h-[360px] space-y-3 p-3"
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropTargetStage(stage);
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDropTargetStage(stage);
                    }}
                    onDragLeave={() =>
                      setDropTargetStage((current) => (current === stage ? null : current))
                    }
                    onDrop={(event) => handleStageDrop(event, stage)}
                  >
                    {loadingLeads ? (
                      <EmptyState
                        icon={KanbanSquare}
                        title="Carregando"
                        description="Sincronizando leads da unidade ativa."
                      />
                    ) : stageLeads.length ? (
                      <>
                        {visibleStageLeads.map((lead) => (
                          <LeadPipelineCard
                            key={lead.id}
                            lead={lead}
                            removing={removingLeadId === lead.id}
                            dragging={draggingLeadId === lead.id}
                            syncing={syncingLeadId === lead.id}
                            displayValue={pipelineDisplayValue(lead, session?.user.role)}
                            canViewAcquisitionChannel={canViewAcquisitionChannel}
                            canViewLeadAge={canViewLeadAge}
                            canViewOwner={canTransferUnitLeads}
                            canRemove={canRemoveLeads}
                            canEdit={canOperatePipeline}
                            onRemove={() => void handleRemoveLead(lead)}
                            onEdit={() => openEditLeadDialog(lead)}
                            onDragStart={(event) => handleDragStart(event, lead)}
                            onDragEnd={handleDragEnd}
                          />
                        ))}

                        {hiddenCount ? (
                          <div className="sticky bottom-0 -mx-1 -mb-1 rounded-b-xl bg-gradient-to-t from-[#F7F8FC] via-[#F7F8FC]/95 to-transparent px-1 pb-1 pt-8 backdrop-blur-sm">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full border-[#16006C]/15 bg-white/90 text-[#16006C] shadow-sm hover:bg-[#16006C] hover:text-white"
                              onClick={() => loadMoreStageLeads(stage, stageLeads.length)}
                            >
                              + carregar mais leads
                              <span className="ml-1 text-xs opacity-75">({hiddenCount})</span>
                            </Button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#16006C]/15 bg-white/40 px-5 text-center">
                        <div className={`mb-3 h-2 w-2 rounded-full ${stageVisual.dot}`} />
                        <div className="text-sm font-bold text-[#07154C]">Etapa livre</div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Novas oportunidades aparecerão aqui.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <CreateLeadDialog
        open={leadDialogOpen}
        mode={leadDialogMode}
        form={form}
        courses={courses}
        attendances={attendances}
        channels={channels}
        units={session?.units ?? []}
        selectedCourse={selectedCourse}
        selectedAttendance={selectedAttendance}
        loadingOptions={loadingOptions}
        canViewAcquisitionChannel={canViewAcquisitionChannel}
        tasks={leadTasks}
        taskForm={taskForm}
        loadingTasks={loadingTasks}
        savingTask={savingTask}
        updatingTaskId={updatingTaskId}
        removingTaskId={removingTaskId}
        saving={savingLead}
        converting={editingLead ? convertingLeadId === editingLead.id : false}
        onOpenChange={(open) => {
          setLeadDialogOpen(open);
          if (!open) {
            setEditingLead(null);
            setLeadDialogMode("create");
            setLeadTasks([]);
            setTaskForm(emptyTaskForm());
          }
        }}
        onFormChange={setForm}
        onTaskFormChange={setTaskForm}
        onSubmit={handleSubmitLead}
        onTaskSubmit={() => void handleCreateTask()}
        onTaskStatusChange={(task, status) => void updateTaskStatus(task, status)}
        onTaskRemove={(task) => void handleRemoveTask(task)}
        onConvertToStudent={() => void handleConvertLeadToStudent()}
        onResetNewLead={() => {
          setEditingLead(null);
          setLeadDialogMode("create");
          setForm(emptyLeadForm(activeUnitId));
        }}
      />
      <TransferLeadDialog
        open={transferDialogOpen}
        leads={transferLeads}
        consultants={transferConsultants}
        selectedLeadIds={selectedTransferLeadIds}
        targetUserId={transferTargetUserId}
        loading={loadingTransferData}
        transferring={transferringLeads}
        selectedCount={selectedTransferCount}
        onOpenChange={setTransferDialogOpen}
        onRefresh={() => void loadTransferData()}
        onToggleLead={toggleTransferLead}
        onToggleAll={toggleAllTransferableLeads}
        onTargetChange={setTransferTargetUserId}
        onSubmit={() => void handleTransferLeads()}
      />
    </div>
  );
}

function ConversionConfetti({ runId }: { runId: number }) {
  if (!runId) {
    return null;
  }

  return (
    <div
      key={runId}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
    >
      {confettiPieces.map((piece) => (
        <span
          key={piece.id}
          className="conversion-confetti-piece"
          style={
            {
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-rise": `-${piece.rise}vh`,
              "--confetti-spin": `${piece.spin}deg`,
              animationDelay: `${piece.delay}ms`,
              backgroundColor: piece.color,
              height: `${piece.height}px`,
              left: `${piece.left}%`,
              width: `${piece.width}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function LeadPipelineCard({
  lead,
  removing,
  dragging,
  syncing,
  displayValue,
  canViewAcquisitionChannel,
  canViewLeadAge,
  canViewOwner,
  canRemove,
  canEdit,
  onRemove,
  onEdit,
  onDragStart,
  onDragEnd,
}: {
  lead: LeadRecord;
  removing: boolean;
  dragging: boolean;
  syncing: boolean;
  displayValue: number | null;
  canViewAcquisitionChannel: boolean;
  canViewLeadAge: boolean;
  canViewOwner: boolean;
  canRemove: boolean;
  canEdit: boolean;
  onRemove: () => void;
  onEdit: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const visual = pipelineStageVisual[pipelineStage(lead.stage)] ?? pipelineStageVisual["Novo lead"];
  const initials = lead.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <Card
      draggable={canEdit}
      onDragStart={canEdit ? onDragStart : undefined}
      onDragEnd={canEdit ? onDragEnd : undefined}
      className={`group relative overflow-hidden border-[#16006C]/10 bg-white p-0 shadow-[0_14px_32px_-27px_rgba(7,21,76,0.7)] transition-all duration-200 ease-out ${
        canEdit ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        dragging
          ? "scale-[0.98] opacity-60 shadow-lg"
          : "hover:-translate-y-0.5 hover:border-[#16006C]/20 hover:shadow-[0_20px_38px_-26px_rgba(7,21,76,0.55)]"
      } ${syncing ? "ring-2 ring-primary/25" : ""}`}
    >
      <div className={`h-1 w-full ${visual.accent}`} />
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-sm ${visual.accent}`}
          >
            {initials || "LD"}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <button
              type="button"
              onClick={canEdit ? onEdit : undefined}
              className={`line-clamp-2 max-w-full text-left text-sm font-black leading-snug text-[#07154C] [overflow-wrap:anywhere] ${
                canEdit ? "transition hover:text-[#224C99]" : "cursor-default"
              }`}
            >
              {lead.fullName}
            </button>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Phone className="h-3.5 w-3.5 text-[#224C99]" />
              <span className="truncate">{lead.phone}</span>
            </div>
          </div>
          {canRemove ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-destructive opacity-50 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              onClick={onRemove}
              disabled={removing}
              aria-label={`Remover ${lead.fullName}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="mt-3 grid gap-1.5 rounded-xl bg-[#F7F8FC] px-3 py-2.5">
          {lead.phone2 ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#224C99]" />
              <span className="truncate">{lead.phone2}</span>
            </div>
          ) : null}
          {lead.email ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0 text-[#224C99]" />
              <span className="truncate">{lead.email}</span>
            </div>
          ) : null}
          {lead.city ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#224C99]" />
              <span className="truncate">{lead.city}</span>
            </div>
          ) : null}
          {canViewOwner && lead.createdByName ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#224C99]" />
              <span className="truncate">{lead.createdByName}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {lead.attendanceName || lead.courseName ? (
            <Badge
              variant="secondary"
              className="h-auto max-w-full whitespace-normal border border-[#F4B728]/20 bg-[#F4B728]/15 text-left text-[#8A6100] [overflow-wrap:anywhere]"
            >
              {lead.attendanceName ?? lead.courseName}
            </Badge>
          ) : null}
          {canViewAcquisitionChannel && lead.acquisitionChannelName ? (
            <Badge variant="secondary" className="bg-[#16006C]/7 text-[#16006C]">
              {lead.acquisitionChannelName}
            </Badge>
          ) : null}
        </div>
      </div>

      {displayValue !== null || canViewLeadAge ? (
        <div className="flex items-center justify-between gap-3 border-t border-[#16006C]/8 bg-[#FBFBFD] px-3.5 py-2.5">
          {canViewLeadAge ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-[#224C99]">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{formatLeadCreatedTime(lead.createdAt)}</span>
            </div>
          ) : (
            <span />
          )}
          {displayValue !== null ? (
            <div className="shrink-0 text-xs font-black text-[#16006C]">
              {currencyFormatter.format(displayValue)}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function TransferLeadDialog({
  open,
  leads,
  consultants,
  selectedLeadIds,
  targetUserId,
  loading,
  transferring,
  selectedCount,
  onOpenChange,
  onRefresh,
  onToggleLead,
  onToggleAll,
  onTargetChange,
  onSubmit,
}: {
  open: boolean;
  leads: Array<TransferLead>;
  consultants: Array<TransferConsultant>;
  selectedLeadIds: Set<string>;
  targetUserId: string;
  loading: boolean;
  transferring: boolean;
  selectedCount: number;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onToggleLead: (lead: TransferLead, checked: boolean | "indeterminate") => void;
  onToggleAll: (checked: boolean | "indeterminate") => void;
  onTargetChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const transferableLeads = leads.filter((lead) => lead.transferable);
  const allTransferableSelected =
    transferableLeads.length > 0 && transferableLeads.every((lead) => selectedLeadIds.has(lead.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden border-primary/20 bg-card p-0 shadow-[0_28px_90px_-38px_rgba(22,0,108,0.85)] sm:max-w-4xl">
        <div className="relative overflow-hidden bg-gradient-hero p-6 text-white">
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl text-white">
                <ArrowRightLeft className="h-5 w-5 text-gold" />
                Transferência de Lead
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-white/72">
                Mova leads com mais de 48 horas de criação para outro consultor da unidade.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              onClick={onRefresh}
              disabled={loading}
              className="w-fit text-white hover:bg-white/10 hover:text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid max-h-[calc(92vh-176px)] gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-primary">
                <Checkbox
                  checked={allTransferableSelected}
                  onCheckedChange={onToggleAll}
                  disabled={!transferableLeads.length || loading}
                />
                Selecionar todos com mais de 48h
              </label>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {transferableLeads.length} elegíveis
                </Badge>
                <Badge variant="secondary" className="bg-gold/15 text-gold-foreground">
                  {selectedCount} selecionados
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex h-56 items-center justify-center rounded-lg border bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : leads.length ? (
                leads.map((lead) => {
                  const selected = selectedLeadIds.has(lead.id);

                  return (
                    <div
                      key={lead.id}
                      className={`grid gap-3 rounded-lg border p-3 transition ${
                        lead.transferable
                          ? selected
                            ? "border-primary/45 bg-primary/10 shadow-card"
                            : "border-primary/15 bg-white/85"
                          : "border-border bg-muted/45 opacity-75"
                      } sm:grid-cols-[auto_minmax(0,1fr)_auto]`}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => onToggleLead(lead, checked)}
                        disabled={!lead.transferable || loading}
                        className="mt-1"
                        aria-label={`Selecionar ${lead.fullName}`}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="break-words text-sm font-bold">{lead.fullName}</div>
                          <Badge
                            variant="outline"
                            className={
                              lead.transferable
                                ? "border-success/25 bg-success/10 text-success"
                                : "border-warning/25 bg-warning/10 text-warning-foreground"
                            }
                          >
                            {lead.transferable ? "Pode transferir" : "Aguardando 48h"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{lead.phone}</span>
                          {lead.courseName ? <span>{lead.courseName}</span> : null}
                          <span>{lead.stage}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span className="flex items-center gap-1 text-primary">
                            <Clock3 className="h-3.5 w-3.5" />
                            Criado há {formatTransferLeadAge(lead)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <UserCheck className="h-3.5 w-3.5" />
                            {lead.createdByName ?? "Sem consultor"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {lead.transferable
                          ? "48h liberado"
                          : `Faltam ${Math.max(0, 48 - lead.ageHours)}h`}
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={ArrowRightLeft}
                  title="Nenhum lead no pipeline"
                  description="Leads da unidade aparecem aqui quando ainda não foram matriculados."
                />
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-primary/15 bg-[linear-gradient(135deg,rgba(22,0,108,.05),rgba(255,138,31,.08))] p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <UserCheck className="h-4 w-4" />
                Destino
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Escolha o consultor que receberá os leads selecionados.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Consultor</Label>
              <Select value={targetUserId} onValueChange={onTargetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o consultor" />
                </SelectTrigger>
                <SelectContent>
                  {consultants.map((consultant) => (
                    <SelectItem key={consultant.id} value={consultant.id}>
                      {consultant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-white/80 p-3 text-sm">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Resumo
              </div>
              <div className="mt-2 text-2xl font-black text-primary">{selectedCount}</div>
              <div className="text-xs text-muted-foreground">lead(s) selecionado(s)</div>
            </div>

            <Button
              type="button"
              onClick={onSubmit}
              disabled={loading || transferring || !selectedCount || !targetUserId}
              className="w-full gap-2 bg-gradient-primary"
            >
              {transferring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckSquare2 className="h-4 w-4" />
              )}
              {transferring ? "Transferindo..." : "Transferir leads"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateLeadDialog({
  open,
  mode,
  form,
  courses,
  attendances,
  channels,
  units,
  selectedCourse,
  selectedAttendance,
  loadingOptions,
  canViewAcquisitionChannel,
  tasks,
  taskForm,
  loadingTasks,
  savingTask,
  updatingTaskId,
  removingTaskId,
  saving,
  converting,
  onOpenChange,
  onFormChange,
  onTaskFormChange,
  onSubmit,
  onTaskSubmit,
  onTaskStatusChange,
  onTaskRemove,
  onConvertToStudent,
  onResetNewLead,
}: {
  open: boolean;
  mode: LeadDialogMode;
  form: LeadFormState;
  courses: Array<CourseRecord>;
  attendances: Array<AttendanceOption>;
  channels: Array<AcquisitionChannelRecord>;
  units: Array<{ id: string; name: string; slug: string }>;
  selectedCourse: CourseRecord | null;
  selectedAttendance: AttendanceOption | null;
  loadingOptions: boolean;
  canViewAcquisitionChannel: boolean;
  tasks: Array<CrmLeadTask>;
  taskForm: LeadTaskFormState;
  loadingTasks: boolean;
  savingTask: boolean;
  updatingTaskId: string | null;
  removingTaskId: string | null;
  saving: boolean;
  converting: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<LeadFormState>>;
  onTaskFormChange: React.Dispatch<React.SetStateAction<LeadTaskFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onTaskSubmit: () => void;
  onTaskStatusChange: (task: CrmLeadTask, status: "pending" | "done") => void;
  onTaskRemove: (task: CrmLeadTask) => void;
  onConvertToStudent: () => void;
  onResetNewLead: () => void;
}) {
  const isEditMode = mode === "edit";
  const showAcquisitionChannelField = !isEditMode || canViewAcquisitionChannel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-primary/20 bg-card p-0 shadow-[0_28px_90px_-38px_rgba(22,0,108,0.85),0_0_34px_rgba(255,138,31,0.22)] sm:max-w-3xl">
        <form onSubmit={onSubmit}>
          <div className="relative overflow-hidden bg-gradient-hero p-6 text-primary-foreground">
            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/12 text-gold ring-1 ring-white/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <DialogHeader className="space-y-2 text-left">
                  <DialogTitle className="text-xl text-white">
                    {isEditMode ? "Editar Lead" : "Criar Lead"}
                  </DialogTitle>
                  <DialogDescription className="text-white/70">
                    {isEditMode
                      ? "Atualize os dados comerciais e o estágio do lead."
                      : "Cadastro comercial vinculado ao curso e canal de aquisição."}
                  </DialogDescription>
                </DialogHeader>
              </div>
              {isEditMode ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                  <Button
                    type="button"
                    onClick={onConvertToStudent}
                    disabled={saving || converting}
                    className="shrink-0 bg-emerald-500 font-bold uppercase tracking-wide text-white shadow-[0_16px_34px_-20px_rgba(16,185,129,0.95)] hover:bg-emerald-600 sm:ml-auto"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {converting ? "Convertendo..." : "TAXA FEITA"}
                  </Button>
                  <div className="w-full md:hidden">
                    <Label>Status do lead</Label>
                    <Select
                      value={form.stage}
                      onValueChange={(value) =>
                        onFormChange((current) => ({ ...current, stage: value as LeadStage }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="lead-full-name">Nome Completo</Label>
              <Input
                id="lead-full-name"
                value={form.fullName}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder="Nome do lead"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-phone">Telefone</Label>
              <Input
                id="lead-phone"
                value={form.phone}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="(00) 00000-0000"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-phone-2">Telefone 2</Label>
              <Input
                id="lead-phone-2"
                value={form.phone2}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, phone2: event.target.value }))
                }
                placeholder="Contato adicional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-email">E-mail</Label>
              <Input
                id="lead-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="lead@email.com"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Turma</Label>
              <Select
                value={form.attendanceId}
                onValueChange={(value) => {
                  const attendance = attendances.find((item) => item.id === value);
                  onFormChange((current) => ({
                    ...current,
                    attendanceId: value,
                    courseId: attendance?.courseId ?? "",
                    city: attendance ? `${attendance.city} - ${attendance.state}` : "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingOptions ? "Carregando..." : "Selecione a turma"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {attendances
                    .filter(
                      (attendance) =>
                        attendance.status === "active" || attendance.id === form.attendanceId,
                    )
                    .map((attendance) => (
                      <SelectItem key={attendance.id} value={attendance.id}>
                        {attendance.displayName}
                        {attendance.status === "inactive" ? " · Inativa" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {!loadingOptions &&
              !attendances.some((attendance) => attendance.status === "active") ? (
                <p className="text-xs text-muted-foreground">Nenhuma turma ativa nesta unidade</p>
              ) : null}
              {selectedAttendance && selectedCourse ? (
                <div className="flex items-center gap-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary">
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  {selectedAttendance.city}/{selectedAttendance.state} · Valor conhecido:{" "}
                  {currencyFormatter.format(selectedCourse.value)}
                </div>
              ) : null}
            </div>

            {showAcquisitionChannelField ? (
              <div className="space-y-2">
                <Label>Canal de Aquisição</Label>
                <Select
                  value={form.acquisitionChannelId || NO_SELECTION}
                  onValueChange={(value) =>
                    onFormChange((current) => ({
                      ...current,
                      acquisitionChannelId: value === NO_SELECTION ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingOptions ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>Sem canal definido</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {!isEditMode ? (
              <div className="space-y-2 md:col-span-2">
                <Label>Unidade</Label>
                <Select
                  value={form.unitId}
                  onValueChange={(value) =>
                    onFormChange((current) => ({
                      ...current,
                      unitId: value,
                      courseId: "",
                      acquisitionChannelId: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="lead-observations">Observações</Label>
              <Textarea
                id="lead-observations"
                value={form.observations}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, observations: event.target.value }))
                }
                placeholder="Anotações comerciais, intenção, disponibilidade ou próximos passos."
                className="min-h-24"
              />
            </div>

            {isEditMode ? (
              <div className="hidden space-y-2 md:col-span-2 md:block">
                <Label>Status do lead</Label>
                <Select
                  value={form.stage}
                  onValueChange={(value) =>
                    onFormChange((current) => ({ ...current, stage: value as LeadStage }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {isEditMode ? (
              <div className="space-y-4 rounded-xl border border-primary/15 bg-[linear-gradient(135deg,rgba(22,0,108,.05),rgba(255,138,31,.09),rgba(18,54,201,.08))] p-4 md:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-primary">
                      <CalendarClock className="h-4 w-4" />
                      Tarefas do lead
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Agende um próximo passo e o sistema avisa 15 minutos antes.
                    </p>
                  </div>
                  <Badge variant="secondary" className="w-fit bg-primary/10 text-primary">
                    {tasks.filter((task) => task.status === "pending").length} pendentes
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
                  <div className="space-y-2">
                    <Label htmlFor="lead-task-title">Tarefa</Label>
                    <Input
                      id="lead-task-title"
                      value={taskForm.title}
                      onChange={(event) =>
                        onTaskFormChange((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Ex.: Ligar para confirmar documentação"
                      maxLength={140}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-task-due">Data e hora</Label>
                    <Input
                      id="lead-task-due"
                      type="datetime-local"
                      value={taskForm.dueAt}
                      onChange={(event) =>
                        onTaskFormChange((current) => ({
                          ...current,
                          dueAt: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="lead-task-notes">Observação</Label>
                    <Textarea
                      id="lead-task-notes"
                      value={taskForm.notes}
                      onChange={(event) =>
                        onTaskFormChange((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Contexto da tarefa, combinado com o lead ou próximos passos."
                      className="min-h-20 bg-white/75"
                      maxLength={1200}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={onTaskSubmit}
                    disabled={savingTask || !taskForm.title || !taskForm.dueAt}
                    className="gap-2 bg-gradient-primary"
                  >
                    {savingTask ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarClock className="h-4 w-4" />
                    )}
                    {savingTask ? "Agendando..." : "Agendar tarefa"}
                  </Button>
                </div>

                <div className="space-y-2">
                  {loadingTasks ? (
                    <div className="flex h-20 items-center justify-center rounded-lg border bg-white/60">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : tasks.length ? (
                    tasks.map((task) => {
                      const pending = task.status === "pending";
                      const busy = updatingTaskId === task.id || removingTaskId === task.id;

                      return (
                        <div
                          key={task.id}
                          className="grid gap-3 rounded-lg border bg-white/80 p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  pending
                                    ? "border-gold/30 bg-gold/15 text-gold-foreground"
                                    : "border-success/25 bg-success/10 text-success"
                                }
                              >
                                {pending ? "Pendente" : "Concluída"}
                              </Badge>
                              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatTaskDate(task.dueAt)}
                              </span>
                            </div>
                            <div className="mt-2 break-words text-sm font-bold">{task.title}</div>
                            {task.notes ? (
                              <p className="mt-1 whitespace-pre-line break-words text-xs text-muted-foreground">
                                {task.notes}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5 sm:justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant={pending ? "default" : "outline"}
                              className={pending ? "gap-1.5 bg-gradient-primary" : "gap-1.5"}
                              onClick={() => onTaskStatusChange(task, pending ? "done" : "pending")}
                              disabled={busy}
                            >
                              {updatingTaskId === task.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {pending ? "Concluir" : "Reabrir"}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => onTaskRemove(task)}
                              disabled={busy}
                              aria-label={`Remover tarefa ${task.title}`}
                            >
                              {removingTaskId === task.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed bg-white/50 p-4 text-center text-sm text-muted-foreground">
                      Nenhuma tarefa agendada para este lead.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/30 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onResetNewLead();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-gradient-primary"
              disabled={saving || converting || !form.unitId}
            >
              {saving
                ? isEditMode
                  ? "Salvando..."
                  : "Criando..."
                : isEditMode
                  ? "Salvar alterações"
                  : "Criar Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
