import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Edit3,
  GraduationCap,
  Lock,
  MapPin,
  Plus,
  RadioTower,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AcquisitionChannelRecord,
  CommercialStatus,
  CourseRecord,
} from "@/lib/commercial-types";
import { useAuth } from "@/lib/auth";
import { canViewManagement } from "@/lib/auth-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CourseFormState = {
  name: string;
  value: string;
  category: string;
  status: CommercialStatus;
};

type ChannelFormState = {
  name: string;
  type: string;
  status: CommercialStatus;
};

type DeleteTarget =
  | { kind: "course"; id: string; name: string }
  | { kind: "channel"; id: string; name: string }
  | { kind: "attendance"; id: string; name: string };

type CoursesResponse = {
  courses: Array<CourseRecord>;
};

type ChannelsResponse = {
  channels: Array<AcquisitionChannelRecord>;
};

type AttendanceRecord = {
  id: string;
  unitId: string;
  unitName: string;
  courseId: string;
  courseName: string;
  city: string;
  state: string;
  status: CommercialStatus;
  consultantIds: Array<string>;
  consultantNames: Array<string>;
};

type AttendancesResponse = {
  attendances: Array<AttendanceRecord>;
  consultants: Array<{ id: string; name: string }>;
};

type AttendanceFormState = {
  courseId: string;
  city: string;
  state: string;
  consultantIds: Array<string>;
  status: CommercialStatus;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const initialCourseForm: CourseFormState = {
  name: "",
  value: "",
  category: "",
  status: "active",
};

const initialChannelForm: ChannelFormState = {
  name: "",
  type: "Pago",
  status: "active",
};

const initialAttendanceForm: AttendanceFormState = {
  courseId: "",
  city: "",
  state: "",
  consultantIds: [],
  status: "active",
};

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

export const Route = createFileRoute("/gestao/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro - Gestão - Star Profissões" }] }),
  component: CadastroPage,
});

function CadastroPage() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const [courses, setCourses] = React.useState<Array<CourseRecord>>([]);
  const [channels, setChannels] = React.useState<Array<AcquisitionChannelRecord>>([]);
  const [attendances, setAttendances] = React.useState<Array<AttendanceRecord>>([]);
  const [consultants, setConsultants] = React.useState<AttendancesResponse["consultants"]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingCourse, setSavingCourse] = React.useState(false);
  const [savingChannel, setSavingChannel] = React.useState(false);
  const [savingAttendance, setSavingAttendance] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [courseDialogOpen, setCourseDialogOpen] = React.useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = React.useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = React.useState(false);
  const [editingCourseId, setEditingCourseId] = React.useState<string | null>(null);
  const [editingChannelId, setEditingChannelId] = React.useState<string | null>(null);
  const [editingAttendanceId, setEditingAttendanceId] = React.useState<string | null>(null);
  const [courseForm, setCourseForm] = React.useState<CourseFormState>(initialCourseForm);
  const [channelForm, setChannelForm] = React.useState<ChannelFormState>(initialChannelForm);
  const [attendanceForm, setAttendanceForm] =
    React.useState<AttendanceFormState>(initialAttendanceForm);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);

  const activeCourses = courses.filter((course) => course.status === "active").length;
  const activeChannels = channels.filter((channel) => channel.status === "active").length;

  const loadData = React.useCallback(async () => {
    if (session && !canViewManagement(session.user.role)) {
      setLoading(false);
      return;
    }

    if (!activeUnitId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [coursesData, channelsData, attendancesData] = await Promise.all([
        readJson<CoursesResponse>(
          await fetch(`/api/gestao/courses${unitQuery(activeUnitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        ),
        readJson<ChannelsResponse>(
          await fetch(`/api/gestao/channels${unitQuery(activeUnitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        ),
        readJson<AttendancesResponse>(
          await fetch(`/api/gestao/attendances${unitQuery(activeUnitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        ),
      ]);

      setCourses(coursesData.courses);
      setChannels(channelsData.channels);
      setAttendances(attendancesData.attendances);
      setConsultants(attendancesData.consultants);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar cadastros.");
    } finally {
      setLoading(false);
    }
  }, [activeUnitId, session]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (session && !canViewManagement(session.user.role)) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O cadastro de cursos e canais fica disponível para Dev, CEO, CVO, Diretor, Gerente e
            Marketing.
          </p>
        </div>
      </div>
    );
  }

  function openNewCourseDialog() {
    setEditingCourseId(null);
    setCourseForm(initialCourseForm);
    setCourseDialogOpen(true);
  }

  function openEditCourseDialog(course: CourseRecord) {
    setEditingCourseId(course.id);
    setCourseForm({
      name: course.name,
      value: String(course.value),
      category: course.category ?? "",
      status: course.status,
    });
    setCourseDialogOpen(true);
  }

  function openNewChannelDialog() {
    setEditingChannelId(null);
    setChannelForm(initialChannelForm);
    setChannelDialogOpen(true);
  }

  function openEditChannelDialog(channel: AcquisitionChannelRecord) {
    setEditingChannelId(channel.id);
    setChannelForm({
      name: channel.name,
      type: channel.type,
      status: channel.status,
    });
    setChannelDialogOpen(true);
  }

  function openNewAttendanceDialog() {
    setEditingAttendanceId(null);
    setAttendanceForm(initialAttendanceForm);
    setAttendanceDialogOpen(true);
  }

  function openEditAttendanceDialog(attendance: AttendanceRecord) {
    setEditingAttendanceId(attendance.id);
    setAttendanceForm({
      courseId: attendance.courseId,
      city: attendance.city,
      state: attendance.state,
      consultantIds: attendance.consultantIds,
      status: attendance.status,
    });
    setAttendanceDialogOpen(true);
  }

  async function handleCourseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeUnitId) {
      toast.error("Selecione uma unidade ativa.");
      return;
    }

    const parsedValue = Number(courseForm.value.replace(",", "."));
    if (!courseForm.name.trim() || Number.isNaN(parsedValue) || parsedValue < 0) {
      toast.error("Preencha o nome e um valor válido para o curso.");
      return;
    }

    setSavingCourse(true);

    try {
      const payload = {
        ...courseForm,
        value: parsedValue,
        unitId: activeUnitId,
      };
      const endpoint = editingCourseId
        ? `/api/gestao/courses/${editingCourseId}`
        : "/api/gestao/courses";
      const method = editingCourseId ? "PATCH" : "POST";

      await readJson<{ course: CourseRecord }>(
        await fetch(endpoint, {
          method,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      );

      toast.success(editingCourseId ? "Curso atualizado." : "Curso cadastrado.");
      setCourseDialogOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar curso.");
    } finally {
      setSavingCourse(false);
    }
  }

  async function handleChannelSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeUnitId) {
      toast.error("Selecione uma unidade ativa.");
      return;
    }

    if (!channelForm.name.trim() || !channelForm.type.trim()) {
      toast.error("Preencha o canal e o tipo.");
      return;
    }

    setSavingChannel(true);

    try {
      const payload = { ...channelForm, unitId: activeUnitId };
      const endpoint = editingChannelId
        ? `/api/gestao/channels/${editingChannelId}`
        : "/api/gestao/channels";
      const method = editingChannelId ? "PATCH" : "POST";

      await readJson<{ channel: AcquisitionChannelRecord }>(
        await fetch(endpoint, {
          method,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      );

      toast.success(editingChannelId ? "Canal atualizado." : "Canal cadastrado.");
      setChannelDialogOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar canal.");
    } finally {
      setSavingChannel(false);
    }
  }

  async function handleAttendanceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeUnitId) {
      toast.error("Selecione uma unidade ativa.");
      return;
    }

    setSavingAttendance(true);

    try {
      await readJson<{ ok: true }>(
        await fetch("/api/gestao/attendances", {
          method: editingAttendanceId ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...attendanceForm,
            id: editingAttendanceId,
            unitId: activeUnitId,
          }),
        }),
      );

      toast.success(editingAttendanceId ? "Atendimento atualizado." : "Atendimento criado.");
      setAttendanceDialogOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar atendimento.");
    } finally {
      setSavingAttendance(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !activeUnitId) {
      return;
    }

    setDeleting(true);

    try {
      const endpoint =
        deleteTarget.kind === "course"
          ? `/api/gestao/courses/${deleteTarget.id}${unitQuery(activeUnitId)}`
          : deleteTarget.kind === "channel"
            ? `/api/gestao/channels/${deleteTarget.id}${unitQuery(activeUnitId)}`
            : "/api/gestao/attendances";

      await readJson<{ ok: true }>(
        await fetch(endpoint, {
          method: "DELETE",
          credentials: "same-origin",
          headers:
            deleteTarget.kind === "attendance"
              ? { Accept: "application/json", "Content-Type": "application/json" }
              : { Accept: "application/json" },
          body:
            deleteTarget.kind === "attendance"
              ? JSON.stringify({ id: deleteTarget.id, unitId: activeUnitId })
              : undefined,
        }),
      );

      toast.success(
        deleteTarget.kind === "course"
          ? "Curso excluído."
          : deleteTarget.kind === "channel"
            ? "Canal excluído."
            : "Atendimento excluído.",
      );
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir registro.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Cadastro"
        description="Central operacional para manter cursos e canais de aquisição prontos para as integrações comerciais."
        actions={
          <>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {activeCourses} cursos ativos
            </Badge>
            <Badge variant="secondary" className="bg-gold/15 text-gold-foreground">
              {activeChannels} canais ativos
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={GraduationCap}
          label="Cursos cadastrados"
          value={courses.length}
          detail="Base pronta para precificação e matrículas."
        />
        <MetricCard
          icon={RadioTower}
          label="Canais de aquisição"
          value={channels.length}
          detail="Origem padronizada para leads e campanhas."
        />
        <MetricCard
          icon={Sparkles}
          label="Unidade ativa"
          value={session?.activeUnit?.name ?? "--"}
          detail="Dados gravados no banco por unidade."
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="animate-panel-rise overflow-hidden border-primary/10 shadow-card">
          <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(244,183,40,0.95)]">
                  <BookOpenCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Cursos</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Crie, edite e organize a esteira de produtos educacionais.
                  </p>
                </div>
              </div>
              <Button onClick={openNewCourseDialog} className="bg-gradient-primary shadow-elegant">
                <Plus className="h-4 w-4" />
                Novo Curso
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="px-5">Nome</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[128px] pr-5 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-28 px-5 text-center text-muted-foreground">
                      Carregando cursos...
                    </TableCell>
                  </TableRow>
                ) : courses.length ? (
                  courses.map((course) => (
                    <TableRow key={course.id} className="group">
                      <TableCell className="px-5 font-medium">
                        <div>{course.name}</div>
                        {course.category ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {course.category}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {currencyFormatter.format(course.value)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={course.status} />
                      </TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditCourseDialog(course)}
                            aria-label={`Editar ${course.name}`}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setDeleteTarget({ kind: "course", id: course.id, name: course.name })
                            }
                            aria-label={`Excluir ${course.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-28 px-5 text-center text-muted-foreground">
                      Nenhum curso cadastrado ainda. Use o botão Novo Curso para iniciar a base.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="animate-panel-rise overflow-hidden border-primary/10 shadow-card [animation-delay:80ms]">
          <CardHeader className="border-b border-border/70 bg-gradient-to-r from-gold/15 via-card to-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold text-gold-foreground shadow-[0_12px_28px_-18px_rgba(18,54,201,0.95)]">
                  <RadioTower className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Canais de Aquisição</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fontes padronizadas para classificação de leads e campanhas.
                  </p>
                </div>
              </div>
              <Button
                onClick={openNewChannelDialog}
                variant="outline"
                className="border-primary/30 bg-white/70 text-primary hover:bg-primary/10"
              >
                <Plus className="h-4 w-4" />
                Novo Canal
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="px-5">Canal</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[128px] pr-5 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-28 px-5 text-center text-muted-foreground">
                      Carregando canais...
                    </TableCell>
                  </TableRow>
                ) : (
                  channels.map((channel) => (
                    <TableRow key={channel.id}>
                      <TableCell className="px-5 font-medium">{channel.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-secondary/80 text-secondary-foreground"
                        >
                          {channel.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={channel.status} />
                      </TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditChannelDialog(channel)}
                            aria-label={`Editar ${channel.name}`}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "channel",
                                id: channel.id,
                                name: channel.name,
                              })
                            }
                            aria-label={`Excluir ${channel.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-panel-rise overflow-hidden border-primary/10 shadow-card">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Atendimentos por curso e cidade</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Defina quem recebe cada combinação identificada no nome das campanhas.
                </p>
              </div>
            </div>
            <Button onClick={openNewAttendanceDialog} className="bg-gradient-primary">
              <Plus className="h-4 w-4" />
              Novo Atendimento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-5">Curso</TableHead>
                <TableHead>Praça</TableHead>
                <TableHead>Consultores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[128px] pr-5 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Carregando atendimentos...
                  </TableCell>
                </TableRow>
              ) : attendances.length ? (
                attendances.map((attendance) => (
                  <TableRow key={attendance.id}>
                    <TableCell className="px-5 font-semibold">{attendance.courseName}</TableCell>
                    <TableCell>
                      {attendance.city}-{attendance.state}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex flex-wrap gap-1">
                        {attendance.consultantNames.map((name) => (
                          <Badge key={name} variant="secondary">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={attendance.status} />
                    </TableCell>
                    <TableCell className="pr-5">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditAttendanceDialog(attendance)}
                          aria-label={`Editar ${attendance.courseName} em ${attendance.city}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            setDeleteTarget({
                              kind: "attendance",
                              id: attendance.id,
                              name: `${attendance.courseName} - ${attendance.city}-${attendance.state}`,
                            })
                          }
                          aria-label={`Excluir atendimento ${attendance.courseName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhuma combinação cadastrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CourseDialog
        open={courseDialogOpen}
        editing={Boolean(editingCourseId)}
        form={courseForm}
        saving={savingCourse}
        onOpenChange={setCourseDialogOpen}
        onFormChange={setCourseForm}
        onSubmit={handleCourseSubmit}
      />
      <ChannelDialog
        open={channelDialogOpen}
        editing={Boolean(editingChannelId)}
        form={channelForm}
        saving={savingChannel}
        onOpenChange={setChannelDialogOpen}
        onFormChange={setChannelForm}
        onSubmit={handleChannelSubmit}
      />
      <AttendanceDialog
        open={attendanceDialogOpen}
        editing={Boolean(editingAttendanceId)}
        form={attendanceForm}
        courses={courses.filter((course) => course.status === "active")}
        consultants={consultants}
        saving={savingAttendance}
        onOpenChange={setAttendanceDialogOpen}
        onFormChange={setAttendanceForm}
        onSubmit={handleAttendanceSubmit}
      />
      <DeleteDialog
        target={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <Card className="animate-panel-rise border-primary/10 bg-card/90 shadow-card">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-[0_0_24px_rgba(255,138,31,0.16)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-bold leading-none text-foreground">{value}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: CommercialStatus }) {
  const isActive = status === "active";

  return (
    <Badge
      variant="secondary"
      className={isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}
    >
      {isActive ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function CourseDialog({
  open,
  editing,
  form,
  saving,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: CourseFormState;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<CourseFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/20 bg-card shadow-elegant sm:max-w-xl">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar curso" : "Novo curso"}</DialogTitle>
            <DialogDescription>
              Defina o curso, valor comercial e status exibidos na base de cadastro.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="course-name">Nome do curso</Label>
              <Input
                id="course-name"
                value={form.name}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Informática Profissional"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-value">Valor do curso</Label>
              <Input
                id="course-value"
                type="number"
                min="0"
                step="0.01"
                value={form.value}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, value: event.target.value }))
                }
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-category">Categoria (opcional)</Label>
              <Input
                id="course-category"
                value={form.category}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, category: event.target.value }))
                }
                placeholder="Ex.: Tecnologia"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    status: value as CommercialStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-gradient-primary" disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar curso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChannelDialog({
  open,
  editing,
  form,
  saving,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: ChannelFormState;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<ChannelFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/20 bg-card shadow-elegant sm:max-w-xl">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar canal" : "Novo canal"}</DialogTitle>
            <DialogDescription>
              Organize as fontes de aquisição que alimentarão leads, campanhas e relatórios.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="channel-name">Canal</Label>
              <Input
                id="channel-name"
                value={form.name}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: LinkedIn Ads"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-type">Tipo</Label>
              <Input
                id="channel-type"
                value={form.type}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, type: event.target.value }))
                }
                placeholder="Ex.: Pago"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    status: value as CommercialStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-gradient-primary" disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar canal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDialog({
  open,
  editing,
  form,
  courses,
  consultants,
  saving,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: AttendanceFormState;
  courses: Array<CourseRecord>;
  consultants: Array<{ id: string; name: string }>;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: React.Dispatch<React.SetStateAction<AttendanceFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  function toggleConsultant(id: string) {
    onFormChange((current) => ({
      ...current,
      consultantIds: current.consultantIds.includes(id)
        ? current.consultantIds.filter((consultantId) => consultantId !== id)
        : [...current.consultantIds, id],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/20 bg-card shadow-elegant sm:max-w-2xl">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar atendimento" : "Novo atendimento"}</DialogTitle>
            <DialogDescription>
              O nome da campanha deve conter [Curso] [Cidade-UF] para usar esta distribuição.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Curso</Label>
              <Select
                value={form.courseId}
                onValueChange={(value) =>
                  onFormChange((current) => ({ ...current, courseId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o curso" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-city">Cidade</Label>
              <Input
                id="attendance-city"
                value={form.city}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, city: event.target.value }))
                }
                placeholder="Ex.: Juiz de Fora"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-state">UF</Label>
              <Input
                id="attendance-state"
                value={form.state}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    state: event.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                placeholder="MG"
                maxLength={2}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Consultores participantes</Label>
              <div className="grid max-h-52 gap-2 overflow-y-auto rounded-lg border bg-background/70 p-3 sm:grid-cols-2">
                {consultants.length ? (
                  consultants.map((consultant) => (
                    <label
                      key={consultant.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        checked={form.consultantIds.includes(consultant.id)}
                        onChange={() => toggleConsultant(consultant.id)}
                      />
                      {consultant.name}
                    </label>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Cadastre consultores ativos nesta unidade.
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  onFormChange((current) => ({
                    ...current,
                    status: value as CommercialStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-gradient-primary"
              disabled={
                saving ||
                !form.courseId ||
                !form.city.trim() ||
                form.state.length !== 2 ||
                !form.consultantIds.length
              }
            >
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar atendimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: DeleteTarget | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="border-destructive/25 bg-card shadow-elegant sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
          <DialogDescription>
            {target
              ? `Deseja excluir "${target.name}"? Esta ação remove o registro do banco de dados.`
              : "Deseja excluir este registro?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
