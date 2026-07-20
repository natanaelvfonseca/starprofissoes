import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Download,
  KeyRound,
  LockKeyhole,
  Mail,
  Save,
  Smartphone,
  Trash2,
  Upload,
  UserRound,
  UnlockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { getInitials, isDevRole } from "@/lib/auth-types";
import {
  consumeDeferredInstallPrompt,
  getDeferredInstallPrompt,
  isInstalledAsApp,
  isIosDevice,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install";

const MAX_AVATAR_UPLOAD_BYTES = 1_000_000;

type ProfileResponse = {
  error?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
};

type SystemSettingsResponse = {
  error?: string;
  settings?: {
    systemLocked: boolean;
  };
};

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Perfil - Star Profissões" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, refreshSession } = useAuth();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [saving, setSaving] = React.useState(false);
  const [savingSystemSettings, setSavingSystemSettings] = React.useState(false);
  const [systemLocked, setSystemLocked] = React.useState(true);
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    avatarUrl: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const user = session?.user;
  const canManageSystemLock = Boolean(user && isDevRole(user.role));
  const userId = user?.id;
  const userName = user?.name;
  const userEmail = user?.email;
  const userAvatarUrl = user?.avatarUrl;

  React.useEffect(() => {
    if (!userId || !userName || !userEmail) {
      return;
    }

    setForm((current) => ({
      ...current,
      name: userName,
      email: userEmail,
      avatarUrl: userAvatarUrl ?? "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    }));
  }, [userId, userName, userEmail, userAvatarUrl]);

  React.useEffect(() => {
    if (!canManageSystemLock) {
      return;
    }

    let cancelled = false;

    fetch("/api/system-settings", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SystemSettingsResponse | null) => {
        if (!cancelled && data?.settings) {
          setSystemLocked(data.settings.systemLocked);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [canManageSystemLock]);

  React.useEffect(() => {
    setAppInstalled(isInstalledAsApp());
    setInstallPrompt(getDeferredInstallPrompt());

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const refreshInstalledState = () => setAppInstalled(isInstalledAsApp());
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setAppInstalled(true);
      toast.success("Aplicativo criado na tela inicial.");
    };
    const unsubscribePrompt = subscribeInstallPrompt(() =>
      setInstallPrompt(getDeferredInstallPrompt()),
    );

    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery.addEventListener("change", refreshInstalledState);

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", refreshInstalledState);
      unsubscribePrompt();
    };
  }, []);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida.");
      return;
    }

    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      toast.error("A imagem precisa ter até 1 MB.");
      return;
    }

    const avatarUrl = await readFileAsDataUrl(file).catch(() => "");

    if (!avatarUrl) {
      toast.error("Não foi possível carregar a imagem.");
      return;
    }

    setForm((current) => ({ ...current, avatarUrl }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.newPassword || form.confirmPassword) {
      if (!form.currentPassword) {
        toast.error("Informe a senha atual.");
        return;
      }

      if (!form.newPassword) {
        toast.error("Informe a nova senha.");
        return;
      }

      if (form.newPassword !== form.confirmPassword) {
        toast.error("A confirmação da senha não confere.");
        return;
      }
    }

    setSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          avatarUrl: form.avatarUrl,
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ProfileResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível salvar o perfil.");
      }

      await refreshSession();
      setForm((current) => ({
        ...current,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      toast.success("Perfil atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallApp() {
    if (appInstalled) {
      toast.success("O aplicativo já está instalado neste dispositivo.");
      return;
    }

    const prompt = consumeDeferredInstallPrompt();

    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;

        if (choice.outcome === "accepted") {
          setAppInstalled(true);
          toast.success("Aplicativo criado na tela inicial.");
        } else {
          toast("Instalação cancelada.");
        }
      } catch {
        toast("Não foi possível abrir a instalação agora.", {
          description: "Use o menu do navegador e escolha Instalar app.",
        });
      }

      return;
    }

    toast("Instalação pelo navegador", {
      description: isIosDevice()
        ? "No iPhone, toque em Compartilhar e depois em Adicionar à Tela de Início."
        : "Abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial.",
    });
  }

  async function handleSystemLockChange(nextLocked: boolean) {
    setSavingSystemSettings(true);

    try {
      const response = await fetch("/api/system-settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ systemLocked: nextLocked }),
      });
      const data = (await response.json().catch(() => ({}))) as SystemSettingsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível atualizar o bloqueio.");
      }

      setSystemLocked(Boolean(data.settings?.systemLocked));
      toast.success(nextLocked ? "Sistema bloqueado para os usuários." : "Sistema liberado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar o bloqueio.");
    } finally {
      setSavingSystemSettings(false);
    }
  }

  const initials = user ? getInitials(form.name || user.name) : "PG";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configurações"
        title="Perfil"
        description="Dados da sua conta e acesso."
      />

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 xl:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]"
      >
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="flex-row items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground">
                <UserRound className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Foto do perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col items-center gap-4 rounded-lg border border-primary/10 bg-primary/5 px-5 py-6 text-center">
                <Avatar className="h-28 w-28 border-4 border-background shadow-[0_18px_40px_-24px_rgba(244,183,40,0.95)]">
                  <AvatarImage
                    src={form.avatarUrl || undefined}
                    alt={form.name || "Perfil"}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-primary text-2xl font-bold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <div className="text-sm font-semibold">
                    {form.name || user?.name || "Star Profissões"}
                  </div>
                  <div className="text-xs text-muted-foreground">{form.email || user?.email}</div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => void handleAvatarChange(event)}
              />

              <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4" />
                  Trocar imagem
                </Button>
                {form.avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setForm((current) => ({ ...current, avatarUrl: "" }))}
                    className="flex-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {canManageSystemLock ? (
            <Card className="shadow-card">
              <CardHeader className="flex-row items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {systemLocked ? (
                    <LockKeyhole className="h-4 w-4" />
                  ) : (
                    <UnlockKeyhole className="h-4 w-4" />
                  )}
                </div>
                <CardTitle className="text-base">Acesso do sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/10 bg-primary/5 p-4">
                  <div className="text-sm font-semibold">
                    {systemLocked ? "Sistema bloqueado" : "Sistema liberado"}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Quando bloqueado, todos os usuários que não são Dev veem o aviso de área
                    bloqueada e o contato com suporte.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={systemLocked ? "default" : "outline"}
                  className={systemLocked ? "w-full bg-gradient-primary" : "w-full"}
                  disabled={savingSystemSettings}
                  onClick={() => void handleSystemLockChange(!systemLocked)}
                >
                  {systemLocked ? (
                    <UnlockKeyhole className="h-4 w-4" />
                  ) : (
                    <LockKeyhole className="h-4 w-4" />
                  )}
                  {savingSystemSettings
                    ? "Atualizando..."
                    : systemLocked
                      ? "Liberar sistema"
                      : "Bloquear sistema"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden border-primary/20 bg-[linear-gradient(145deg,#16006C_0%,#F4B728_58%,#07154C_100%)] text-white shadow-card">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                <img
                  src="/icon-star-192.png"
                  alt="Star Profissões"
                  className="h-16 w-16 rounded-2xl shadow-[0_18px_38px_-18px_rgba(0,0,0,0.72)] ring-1 ring-white/15"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gold">
                    <Smartphone className="h-3.5 w-3.5" />
                    Aplicativo
                  </div>
                  <div className="mt-1 text-lg font-bold leading-tight">Star Profissões no celular</div>
                  <p className="mt-1 text-sm text-white/70">
                    Crie o atalho com ícone na tela inicial.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void handleInstallApp()}
                className="w-full gap-2 bg-gradient-gold font-bold text-gold-foreground hover:opacity-95"
              >
                {appInstalled ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {appInstalled ? "Aplicativo instalado" : "Criar aplicativo"}
              </Button>

              {!installPrompt && !appInstalled ? (
                <p className="text-center text-xs text-white/62">
                  No iPhone, use Compartilhar e Adicionar à Tela de Início.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader className="flex-row items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold text-gold-foreground">
              <KeyRound className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Dados de acesso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Nome</Label>
                <Input
                  id="profile-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className="pl-9"
                    required
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha atual</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={form.currentPassword}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currentPassword: event.target.value }))
                  }
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={form.newPassword}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="bg-gradient-primary" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar perfil"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
