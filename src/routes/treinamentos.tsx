import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Crown,
  Film,
  GraduationCap,
  Layers3,
  Loader2,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { canManageTraining, canViewLeadershipTraining } from "@/lib/auth-types";
import {
  TRAINING_TRAILS,
  type TrainingLesson,
  type TrainingLessonScope,
  type TrainingSummary,
  type TrainingTrailId,
  type TrainingVideoSource,
} from "@/lib/training-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TrainingResponse = {
  lessons?: Array<TrainingLesson>;
  lesson?: TrainingLesson;
  summary?: TrainingSummary;
  canManage?: boolean;
  error?: string;
};

type UploadFormState = {
  title: string;
  description: string;
  trail: TrainingTrailId;
  durationLabel: string;
  orderIndex: string;
  scope: TrainingLessonScope;
  videoSource: TrainingVideoSource;
  videoUrl: string;
  videoFile: File | null;
  thumbnailFile: File | null;
};

type EditFormState = Pick<
  UploadFormState,
  "title" | "description" | "trail" | "durationLabel" | "orderIndex" | "scope"
>;

const initialUploadForm: UploadFormState = {
  title: "",
  description: "",
  trail: "plataforma",
  durationLabel: "",
  orderIndex: "0",
  scope: "global",
  videoSource: "upload",
  videoUrl: "",
  videoFile: null,
  thumbnailFile: null,
};

const MAX_VIDEO_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_THUMBNAIL_UPLOAD_BYTES = 6 * 1024 * 1024;
const PLAYBACK_RATES = ["0.75", "1", "1.25", "1.5", "2"] as const;

const trailStyles: Record<TrainingTrailId, { ring: string; glow: string; icon: typeof Sparkles }> =
  {
    plataforma: {
      ring: "from-[#F4B728] to-[#F3F5F9]",
      glow: "shadow-[0_20px_80px_-46px_rgba(244,183,40,0.85)]",
      icon: Layers3,
    },
    vendas: {
      ring: "from-[#377DFE] to-[#FFFFFF]",
      glow: "shadow-[0_20px_80px_-46px_rgba(55,125,254,0.85)]",
      icon: Crown,
    },
    escola: {
      ring: "from-[#224C99] to-[#377DFE]",
      glow: "shadow-[0_20px_80px_-46px_rgba(34,76,153,0.85)]",
      icon: GraduationCap,
    },
    lideranca: {
      ring: "from-[#16006C] to-[#224C99]",
      glow: "shadow-[0_20px_80px_-46px_rgba(22,0,108,0.85)]",
      icon: ShieldCheck,
    },
  };

export const Route = createFileRoute("/treinamentos")({
  head: () => ({ meta: [{ title: "Área de Membros · Treinamentos" }] }),
  component: Treinamentos,
});

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível concluir a ação.");
  }

  return data;
}

function unitQuery(unitId: string) {
  return `?unitId=${encodeURIComponent(unitId)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function getTrail(trailId: TrainingTrailId) {
  return TRAINING_TRAILS.find((trail) => trail.id === trailId) ?? TRAINING_TRAILS[0];
}

function sortLessons(lessons: Array<TrainingLesson>) {
  const trailOrder = new Map(TRAINING_TRAILS.map((trail, index) => [trail.id, index]));

  return [...lessons].sort(
    (a, b) =>
      (trailOrder.get(a.trail) ?? 0) - (trailOrder.get(b.trail) ?? 0) ||
      a.orderIndex - b.orderIndex ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function buildVideoSrc(lesson: TrainingLesson, unitId: string) {
  if (lesson.videoSource === "url" && lesson.videoUrl) {
    return lesson.videoUrl;
  }

  const params = new URLSearchParams({ id: lesson.id, unitId });

  return `/api/training/video?${params.toString()}`;
}

function validateVideoFile(file: File) {
  if (!file.type.startsWith("video/")) {
    toast.error("Selecione um vídeo válido.");
    return false;
  }

  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    toast.error("O vídeo precisa ter até 60 MB.");
    return false;
  }

  return true;
}

function validateImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    toast.error("Selecione uma imagem válida.");
    return false;
  }

  if (file.size > MAX_THUMBNAIL_UPLOAD_BYTES) {
    toast.error("A capa precisa ter até 6 MB.");
    return false;
  }

  return true;
}

function TrainingPlaceholder({ trail }: { trail: TrainingTrailId }) {
  const trailStyle = trailStyles[trail];
  const Icon = trailStyle.icon;

  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(135deg,#07154C_0%,#16006C_50%,#377DFE_100%)] text-white",
        trailStyle.glow,
      )}
    >
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.09)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
        <Icon className="h-7 w-7" />
      </div>
    </div>
  );
}

function UploadDialog({
  activeUnitId,
  open,
  onOpenChange,
  onUploaded,
}: {
  activeUnitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (lesson: TrainingLesson) => void;
}) {
  const [form, setForm] = useState<UploadFormState>(initialUploadForm);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  const updateForm = (patch: Partial<UploadFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file || !validateVideoFile(file)) {
      return;
    }

    updateForm({ videoFile: file });
  };

  const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file || !validateImageFile(file)) {
      return;
    }

    updateForm({ thumbnailFile: file });
  };

  const submit = async () => {
    if (!activeUnitId) {
      toast.error("Selecione uma unidade ativa antes de publicar.");
      return;
    }

    if (!form.title.trim() || !form.description.trim() || !form.durationLabel.trim()) {
      toast.error("Preencha título, descrição e duração.");
      return;
    }

    if (form.videoSource === "upload" && !form.videoFile) {
      toast.error("Envie o vídeo da aula.");
      return;
    }

    if (form.videoSource === "url" && !form.videoUrl.trim()) {
      toast.error("Informe a URL do vídeo.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const payload = new FormData();
      payload.set("unitId", activeUnitId);
      payload.set("title", form.title);
      payload.set("description", form.description);
      payload.set("trail", form.trail);
      payload.set("durationLabel", form.durationLabel);
      payload.set("orderIndex", form.orderIndex);
      payload.set("scope", form.scope);
      payload.set("videoSource", form.videoSource);
      payload.set("videoUrl", form.videoUrl.trim());

      if (form.videoFile) payload.set("video", form.videoFile);
      if (form.thumbnailFile) payload.set("thumbnail", form.thumbnailFile);

      setUploadStep("Publicando na área exclusiva da Star");
      setUploadProgress(65);

      const data = await readJson<TrainingResponse>(
        await fetch("/api/training", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          body: payload,
        }),
      );

      setUploadProgress(100);

      if (data.lesson) {
        onUploaded(data.lesson);
      }

      toast.success("Aula publicada na área de membros.");
      setForm(initialUploadForm);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao publicar aula.");
    } finally {
      setUploading(false);
      setUploadStep("");
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !uploading && onOpenChange(nextOpen)}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gold text-[#07154C] hover:bg-[#D99A10]">
          <Plus className="h-4 w-4" /> Nova aula
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publicar aula</DialogTitle>
          <DialogDescription>
            Curadoria de conteúdos para a trilha de aprendizagem da equipe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Título</Label>
            <Input
              value={form.title}
              onChange={(event) => updateForm({ title: event.target.value })}
              placeholder="Ex: Como registrar uma matrícula no CRM"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trilha</Label>
            <Select
              value={form.trail}
              onValueChange={(value) => updateForm({ trail: value as TrainingTrailId })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_TRAILS.map((trail) => (
                  <SelectItem key={trail.id} value={trail.id}>
                    {trail.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Visibilidade</Label>
            <Select
              value={form.scope}
              onValueChange={(value) => updateForm({ scope: value as TrainingLessonScope })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Todas as unidades</SelectItem>
                <SelectItem value="unit">Unidade ativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Duração</Label>
            <Input
              value={form.durationLabel}
              onChange={(event) => updateForm({ durationLabel: event.target.value })}
              placeholder="Ex: 12 min"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem na trilha</Label>
            <Input
              type="number"
              min="0"
              value={form.orderIndex}
              onChange={(event) => updateForm({ orderIndex: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">O menor número aparece primeiro.</p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(event) => updateForm({ description: event.target.value })}
              placeholder="Resumo objetivo do que o time vai aprender nesta aula."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Origem do vídeo</Label>
            <Select
              value={form.videoSource}
              onValueChange={(value) => updateForm({ videoSource: value as TrainingVideoSource })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upload">Upload MP4/WebM</SelectItem>
                <SelectItem value="url">URL HTTPS direta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.videoSource === "upload" ? (
            <div className="space-y-1.5">
              <Label>Vídeo da aula</Label>
              <input
                id="training-video-upload"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handleVideoChange}
              />
              <Button asChild variant="outline" className="w-full justify-start gap-2">
                <label htmlFor="training-video-upload">
                  <Upload className="h-4 w-4" />
                  {form.videoFile ? form.videoFile.name : "Selecionar vídeo"}
                </label>
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>URL do vídeo</Label>
              <Input
                value={form.videoUrl}
                onChange={(event) => updateForm({ videoUrl: event.target.value })}
                placeholder="https://..."
              />
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2">
            <Label>Capa da aula</Label>
            <input
              id="training-thumbnail-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleThumbnailChange}
            />
            <Button asChild variant="outline" className="w-full justify-start gap-2">
              <label htmlFor="training-thumbnail-upload">
                <Upload className="h-4 w-4" />
                {form.thumbnailFile ? form.thumbnailFile.name : "Selecionar capa"}
              </label>
            </Button>
          </div>
        </div>

        {uploading ? (
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 font-bold text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadStep || "Preparando publicação"}
              </div>
              <span className="font-black text-primary">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="mt-3 h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              Mantenha esta janela aberta enquanto o vídeo é enviado.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={uploading} className="gap-2 bg-primary text-white">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Publicar aula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLessonDialog({
  activeUnitId,
  lesson,
  open,
  onOpenChange,
  onUpdated,
}: {
  activeUnitId: string;
  lesson: TrainingLesson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (response: TrainingResponse) => void;
}) {
  const [form, setForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lesson || !open) return;

    setForm({
      title: lesson.title,
      description: lesson.description,
      trail: lesson.trail,
      durationLabel: lesson.durationLabel,
      orderIndex: String(lesson.orderIndex),
      scope: lesson.scope,
    });
  }, [lesson, open]);

  const updateForm = (patch: Partial<EditFormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const submit = async () => {
    if (!lesson || !form) return;

    if (!form.title.trim() || !form.description.trim() || !form.durationLabel.trim()) {
      toast.error("Preencha título, descrição e duração.");
      return;
    }

    setSaving(true);

    try {
      const data = await readJson<TrainingResponse>(
        await fetch("/api/training", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "updateLesson",
            unitId: activeUnitId,
            lessonId: lesson.id,
            ...form,
          }),
        }),
      );

      onUpdated(data);
      onOpenChange(false);
      toast.success("Aula atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao editar aula.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar aula</DialogTitle>
          <DialogDescription>
            Ajuste as informações e a posição da aula sem reenviar o vídeo.
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trilha</Label>
              <Select
                value={form.trail}
                onValueChange={(value) => updateForm({ trail: value as TrainingTrailId })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_TRAILS.map((trail) => (
                    <SelectItem key={trail.id} value={trail.id}>
                      {trail.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibilidade</Label>
              <Select
                value={form.scope}
                onValueChange={(value) => updateForm({ scope: value as TrainingLessonScope })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Todas as unidades</SelectItem>
                  <SelectItem value="unit">Unidade ativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duração</Label>
              <Input
                value={form.durationLabel}
                onChange={(event) => updateForm({ durationLabel: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Posição na trilha</Label>
              <Input
                type="number"
                min="0"
                value={form.orderIndex}
                onChange={(event) => updateForm({ orderIndex: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">O menor número aparece primeiro.</p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(event) => updateForm({ description: event.target.value })}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Treinamentos() {
  const { session } = useAuth();
  const activeUnitId = session?.activeUnit?.id ?? "";
  const activeUnitName = session?.activeUnit?.name ?? "Unidade ativa";
  const canManage = session ? canManageTraining(session.user.role) : false;
  const canViewLeadership = session ? canViewLeadershipTraining(session.user.role) : false;  const visibleTrails = useMemo(
    () => TRAINING_TRAILS.filter((trail) => trail.id !== "lideranca" || canViewLeadership),
    [canViewLeadership],
  );
  const [lessons, setLessons] = useState<Array<TrainingLesson>>([]);
  const [summary, setSummary] = useState<TrainingSummary>({
    totalLessons: 0,
    completedLessons: 0,
    progressPercent: 0,
  });
  const [selectedTrail, setSelectedTrail] = useState<TrainingTrailId>("plataforma");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState("1");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selectedLessonIdRef = useRef<string | null>(null);
  const hasInitializedTrainingRef = useRef(false);

  const selectedLesson = useMemo(
    () =>
      (selectedLessonId ? lessons.find((lesson) => lesson.id === selectedLessonId) : null) ??
      lessons.find((lesson) => lesson.trail === selectedTrail) ??
      null,
    [lessons, selectedLessonId, selectedTrail],
  );
  const lessonsByTrail = useMemo(
    () =>
      visibleTrails.reduce(
        (acc, trail) => {
          acc[trail.id] = lessons.filter((lesson) => lesson.trail === trail.id);
          return acc;
        },
        {} as Record<TrainingTrailId, Array<TrainingLesson>>,
      ),
    [lessons, visibleTrails],
  );
  const activeTrail = getTrail(selectedTrail);
  const activeTrailLessons = lessonsByTrail[selectedTrail] ?? [];

  const selectTrail = (trailId: TrainingTrailId) => {
    const firstLesson = lessonsByTrail[trailId]?.[0] ?? null;

    selectedLessonIdRef.current = firstLesson?.id ?? null;
    setSelectedTrail(trailId);
    setSelectedLessonId(firstLesson?.id ?? null);
  };

  useEffect(() => {
    selectedLessonIdRef.current = selectedLessonId;
  }, [selectedLessonId]);

  useEffect(() => {
    hasInitializedTrainingRef.current = false;
    selectedLessonIdRef.current = null;
    setSelectedLessonId(null);
    setSelectedTrail("plataforma");
  }, [activeUnitId]);

  const loadTraining = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!activeUnitId) {
        setLessons([]);
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const data = await readJson<TrainingResponse>(
          await fetch(`/api/training${unitQuery(activeUnitId)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );
        const nextLessons = sortLessons(data.lessons ?? []);

        setLessons(nextLessons);
        setSummary(
          data.summary ?? {
            totalLessons: nextLessons.length,
            completedLessons: nextLessons.filter((lesson) => lesson.completedAt).length,
            progressPercent: 0,
          },
        );

        const selectedStillExists = nextLessons.some(
          (lesson) => lesson.id === selectedLessonIdRef.current,
        );

        if (!hasInitializedTrainingRef.current && nextLessons[0]) {
          selectedLessonIdRef.current = nextLessons[0].id;
          setSelectedLessonId(nextLessons[0].id);
          setSelectedTrail(nextLessons[0].trail);
          hasInitializedTrainingRef.current = true;
        } else if (selectedLessonIdRef.current && !selectedStillExists) {
          selectedLessonIdRef.current = null;
          setSelectedLessonId(null);
        }
      } catch (error) {
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar treinamentos.");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [activeUnitId],
  );

  useEffect(() => {
    void loadTraining();
  }, [loadTraining]);

  const updateProgress = async (lesson: TrainingLesson, completed: boolean) => {
    if (!activeUnitId) {
      return;
    }

    setSavingProgress(true);

    try {
      const data = await readJson<TrainingResponse>(
        await fetch("/api/training", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ unitId: activeUnitId, lessonId: lesson.id, completed }),
        }),
      );

      setLessons(sortLessons(data.lessons ?? []));
      if (data.summary) {
        setSummary(data.summary);
      }
      toast.success(completed ? "Aula concluída." : "Conclusão removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar progresso.");
    } finally {
      setSavingProgress(false);
    }
  };

  const archiveLesson = async (lesson: TrainingLesson) => {
    setArchivingId(lesson.id);

    try {
      await readJson<{ ok: boolean }>(
        await fetch("/api/training", {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lessonId: lesson.id }),
        }),
      );
      toast.success("Aula arquivada.");
      void loadTraining({ silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao arquivar aula.");
    } finally {
      setArchivingId(null);
    }
  };

  const handleUploaded = (lesson: TrainingLesson) => {
    setLessons((current) => sortLessons([...current, lesson]));
    selectedLessonIdRef.current = lesson.id;
    setSelectedLessonId(lesson.id);
    setSelectedTrail(lesson.trail);
    void loadTraining({ silent: true });
  };

  const handleUpdated = (data: TrainingResponse) => {
    const nextLessons = sortLessons(data.lessons ?? []);
    setLessons(nextLessons);

    if (data.summary) {
      setSummary(data.summary);
    }

    if (data.lesson) {
      selectedLessonIdRef.current = data.lesson.id;
      setSelectedLessonId(data.lesson.id);
      setSelectedTrail(data.lesson.trail);
    }
  };

  const changePlaybackRate = (value: string) => {
    setPlaybackRate(value);

    if (videoRef.current) {
      videoRef.current.playbackRate = Number(value);
    }
  };

  return (
    <div className="space-y-6 overflow-x-hidden" onContextMenu={(event) => event.preventDefault()}>      <section className="relative overflow-hidden rounded-xl bg-[linear-gradient(135deg,#07154C_0%,#16006C_42%,#224C99_76%,#377DFE_100%)] p-5 text-white shadow-[0_30px_90px_-50px_rgba(22,0,108,0.8)] md:p-7">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.1)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="absolute left-0 top-0 h-px w-full animate-pulse bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />

        <div className="relative grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
          <div className="min-w-0 max-w-3xl">
            <Badge className="border-white/20 bg-white/10 text-white">
              <BookOpenCheck className="mr-1 h-3.5 w-3.5" /> Área de Membros
            </Badge>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">
              Trilha de aprendizagem Star Profissões
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/78 md:text-base">
              {canViewLeadership
                ? "Treinamento para plataforma, vendas, escola e liderança, organizado para evoluir o time com consistência."
                : "Treinamento para plataforma, vendas e escola, organizado para evoluir o atendimento com consistência."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge className="border-gold/30 bg-gold/15 text-gold">{activeUnitName}</Badge>
              <Badge className="border-white/15 bg-white/10 text-white">
                {summary.completedLessons}/{summary.totalLessons} aulas concluídas
              </Badge>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/60">Progresso</div>
                <div className="mt-1 text-3xl font-black">{summary.progressPercent}%</div>
              </div>
              <div
                className="grid h-20 w-20 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#F4B728 ${summary.progressPercent * 3.6}deg, rgba(255,255,255,.15) 0deg)`,
                }}
              >
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#16006C]">
                  <Sparkles className="h-5 w-5 text-gold" />
                </div>
              </div>
            </div>
            <Progress
              value={summary.progressPercent}
              className="mt-4 bg-white/15 [&>div]:bg-gold"
            />
            <div className="mt-4 flex min-w-0 flex-wrap gap-2">
              <Button
                variant="secondary"
                className="min-w-0 flex-1 gap-2 bg-white text-[#16006C] hover:bg-white/90"
                onClick={() => loadTraining()}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
              </Button>
              {canManage ? (
                <UploadDialog
                  activeUnitId={activeUnitId}
                  open={uploadOpen}
                  onOpenChange={setUploadOpen}
                  onUploaded={handleUploaded}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0 space-y-5">
          <div
            className={cn(
              "grid min-w-0 grid-cols-2 gap-2",
              canViewLeadership ? "sm:grid-cols-4" : "sm:grid-cols-3",
            )}
          >
            {visibleTrails.map((trail) => {
              const Icon = trailStyles[trail.id].icon;
              const trailLessons = lessonsByTrail[trail.id] ?? [];
              const completed = trailLessons.filter((lesson) => lesson.completedAt).length;
              const active = selectedTrail === trail.id;

              return (
                <button
                  key={trail.id}
                  type="button"
                  onClick={() => selectTrail(trail.id)}
                  className={cn(
                    "group flex min-w-0 items-center gap-2 rounded-full border bg-card px-2.5 py-2 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elegant sm:px-3 md:justify-between md:px-4",
                    active && "border-primary bg-primary text-white shadow-elegant",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white",
                        trailStyles[trail.id].ring,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black md:text-sm">
                        {trail.title}
                      </span>
                      <span
                        className={cn(
                          "hidden truncate text-[11px] text-muted-foreground md:block",
                          active && "text-white/70",
                        )}
                      >
                        {trail.subtitle}
                      </span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground",
                      active && "bg-white/15 text-white",
                    )}
                  >
                    {completed}/{trailLessons.length}
                  </span>
                </button>
              );
            })}
          </div>

          <Card className="min-w-0 overflow-hidden border-primary/20 shadow-elegant">
            {selectedLesson ? (
              <>
                <CardHeader className="border-b bg-[linear-gradient(90deg,rgba(194,65,12,.06),rgba(255,138,31,.12),rgba(18,54,201,.08))] p-4 md:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary/10 text-primary">Assistindo agora</Badge>
                    <Badge variant="secondary">{getTrail(selectedLesson.trail).title}</Badge>
                  </div>
                  <CardTitle className="mt-2 line-clamp-2 text-lg leading-tight md:text-2xl">
                    {selectedLesson.title}
                  </CardTitle>
                </CardHeader>
                <div className="relative min-w-0 bg-[#07154C] p-2 md:p-3">
                  <div className="mb-2 flex items-center justify-end gap-2 text-white">
                    <span className="text-xs font-semibold text-white/70">Velocidade</span>
                    <Select value={playbackRate} onValueChange={changePlaybackRate}>
                      <SelectTrigger className="h-8 w-24 border-white/20 bg-white/10 text-xs text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAYBACK_RATES.map((rate) => (
                          <SelectItem key={rate} value={rate}>
                            {rate}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <video
                    key={selectedLesson.id}
                    ref={videoRef}
                    className="aspect-video w-full max-w-full rounded-lg bg-black shadow-[0_24px_70px_-36px_rgba(0,0,0,0.85)]"
                    controls
                    controlsList="nodownload noremoteplayback"
                    disablePictureInPicture
                    disableRemotePlayback
                    onContextMenu={(event) => event.preventDefault()}
                    onDragStart={(event) => event.preventDefault()}
                    poster={selectedLesson.thumbnailDataUrl ?? undefined}
                    preload="metadata"
                    src={buildVideoSrc(selectedLesson, activeUnitId)}
                    onLoadedMetadata={(event) => {
                      event.currentTarget.playbackRate = Number(playbackRate);
                    }}
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
                </div>
              </>
            ) : (
              <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center md:min-h-[430px]">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Play className="h-7 w-7" />
                </div>
                <div className="mt-4 text-base font-black">Player da trilha</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Selecione uma aula para começar o treinamento.
                </p>
              </CardContent>
            )}
          </Card>

          <Card className="min-w-0 overflow-hidden shadow-card">
            <CardHeader className="border-b bg-[linear-gradient(90deg,rgba(194,65,12,.06),rgba(255,138,31,.12),rgba(18,54,201,.08))]">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PlayCircle className="h-5 w-5 text-primary" />
                    {activeTrail.title}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{activeTrail.description}</p>
                </div>
                <Badge className="w-fit border-primary/20 bg-primary/10 text-primary">
                  {activeTrailLessons.length} aulas
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {activeTrailLessons.length ? (
                <div className="relative min-w-0 space-y-3 before:absolute before:bottom-5 before:left-[29px] before:top-5 before:w-px before:bg-gradient-to-b before:from-primary before:via-primary/30 before:to-transparent">
                  {activeTrailLessons.map((lesson, index) => {
                    const selected = selectedLesson?.id === lesson.id;
                    const completed = Boolean(lesson.completedAt);

                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => setSelectedLessonId(lesson.id)}
                        className={cn(
                          "group relative grid w-full min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-2 rounded-xl border bg-card p-3 text-left transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elegant sm:grid-cols-[58px_minmax(0,1fr)] sm:gap-3",
                          selected && "border-primary shadow-elegant",
                        )}
                      >
                        <div className="relative z-10">
                          <div
                            className={cn(
                              "flex h-11 w-11 items-center justify-center rounded-full border-4 border-background text-sm font-black shadow-card",
                              completed
                                ? "bg-success text-white"
                                : selected
                                  ? "bg-primary text-white"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {completed ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                          </div>
                        </div>
                        <div className="grid min-w-0 gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                          {lesson.thumbnailDataUrl ? (
                            <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                              <img
                                src={lesson.thumbnailDataUrl}
                                alt=""
                                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                              />
                            </div>
                          ) : (
                            <TrainingPlaceholder trail={lesson.trail} />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  completed
                                    ? "border-success/30 bg-success/10 text-success"
                                    : "border-primary/20 bg-primary/10 text-primary"
                                }
                              >
                                {completed ? "Concluída" : "Disponível"}
                              </Badge>
                              <Badge variant="secondary" className="gap-1">
                                <Clock3 className="h-3 w-3" /> {lesson.durationLabel}
                              </Badge>
                              <Badge variant="secondary">
                                {lesson.scope === "global" ? "Todas as unidades" : "Unidade"}
                              </Badge>
                            </div>
                            <h3 className="mt-2 line-clamp-2 font-black leading-tight">
                              {lesson.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {lesson.description}
                            </p>
                            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                              <Film className="h-3.5 w-3.5" />
                              Publicada em {formatDate(lesson.createdAt)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed bg-accent/20 p-6 text-center">
                  {loading ? (
                    <Loader2 className="h-9 w-9 animate-spin text-primary" />
                  ) : (
                    <BookOpenCheck className="h-9 w-9 text-muted-foreground" />
                  )}
                  <div className="mt-3 text-sm font-bold">
                    {loading ? "Carregando trilha..." : "Trilha aguardando aulas"}
                  </div>
                  <p className="mt-1 max-w-[300px] text-xs text-muted-foreground">
                    As aulas publicadas pela liderança aparecem aqui.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-5 xl:self-start">
          <Card className="min-w-0 overflow-hidden border-primary/20 shadow-elegant">
            <CardHeader className="border-b bg-[linear-gradient(135deg,#16006C_0%,#224C99_100%)] p-4 text-white">
              <CardTitle className="flex items-center gap-2 text-base">
                <Film className="h-4 w-4 text-gold" />
                Informações da aula
              </CardTitle>
            </CardHeader>
            {selectedLesson ? (
              <CardContent className="space-y-4 p-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-primary/10 text-primary">
                      {getTrail(selectedLesson.trail).title}
                    </Badge>
                    <Badge variant="secondary">{selectedLesson.durationLabel}</Badge>
                  </div>
                  <h2 className="mt-3 break-words text-xl font-black leading-tight">
                    {selectedLesson.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {selectedLesson.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-muted-foreground">Status</div>
                    <div className="mt-1 font-bold">
                      {selectedLesson.completedAt ? "Concluída" : "Em andamento"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-muted-foreground">Publicado</div>
                    <div className="mt-1 font-bold">{formatDate(selectedLesson.createdAt)}</div>
                  </div>
                </div>

                <Button
                  className={cn(
                    "w-full gap-2",
                    selectedLesson.completedAt
                      ? "bg-success text-white hover:bg-success/90"
                      : "bg-primary text-white",
                  )}
                  onClick={() => updateProgress(selectedLesson, !selectedLesson.completedAt)}
                  disabled={savingProgress}
                >
                  {savingProgress ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedLesson.completedAt ? (
                    <BadgeCheck className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {selectedLesson.completedAt ? "Concluída" : "Marcar como concluída"}
                </Button>

                {canManage ? (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-primary/25 text-primary"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar aula
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 text-muted-foreground"
                      onClick={() => archiveLesson(selectedLesson)}
                      disabled={archivingId === selectedLesson.id}
                    >
                      {archivingId === selectedLesson.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Arquivar aula
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            ) : (
              <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <PlayCircle className="h-7 w-7" />
                </div>
                <div className="mt-4 text-base font-black">Aula não selecionada</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Escolha uma aula da trilha para ver os detalhes.
                </p>
              </CardContent>
            )}
          </Card>
        </aside>
      </div>

      <EditLessonDialog
        activeUnitId={activeUnitId}
        lesson={selectedLesson}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
