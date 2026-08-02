import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  GraduationCap,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { canViewCrmFinancialSwitcher, canViewStudentSwitcher } from "@/lib/auth-types";
import type { CrmLeadTask } from "@/lib/crm-task-types";
import { cn } from "@/lib/utils";

type NotificationsResponse = {
  tasks: Array<CrmLeadTask>;
};

type TaskResponse = {
  task: CrmLeadTask;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Falha na requisição.");
  }

  return data;
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function Topbar() {
  const { session } = useAuth();
  const path = useRouterState({ select: (routerState) => routerState.location.pathname });
  const isFinancial = path.startsWith("/financeiro");
  const isStudent = path.startsWith("/aluno");
  const isCrm = !isFinancial && !isStudent;
  const canShowCrmFinancial = session ? canViewCrmFinancialSwitcher(session.user.role) : false;
  const canShowStudent = session ? canViewStudentSwitcher(session.user.role) : false;
  const [notifications, setNotifications] = React.useState<Array<CrmLeadTask>>([]);
  const [loadingNotifications, setLoadingNotifications] = React.useState(false);
  const [updatingTaskId, setUpdatingTaskId] = React.useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = React.useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const notifiedTaskIdsRef = React.useRef<Set<string>>(new Set());

  const notifyBrowser = React.useCallback(
    (tasks: Array<CrmLeadTask>) => {
      if (
        browserPermission !== "granted" ||
        typeof window === "undefined" ||
        !("Notification" in window)
      ) {
        return;
      }

      tasks.forEach((task) => {
        if (notifiedTaskIdsRef.current.has(task.id)) {
          return;
        }

        notifiedTaskIdsRef.current.add(task.id);
        new Notification("Tarefa do CRM", {
          body: `${task.title} - ${task.leadName} às ${formatNotificationDate(task.dueAt)}`,
          tag: `crm-task-${task.id}`,
        });
      });
    },
    [browserPermission],
  );

  const loadNotifications = React.useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!session) {
        setNotifications([]);
        return;
      }

      if (!silent) {
        setLoadingNotifications(true);
      }

      try {
        const data = await readJson<NotificationsResponse>(
          await fetch("/api/crm/tasks?view=notifications", {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }),
        );

        setNotifications(data.tasks);
        notifyBrowser(data.tasks);
      } catch (error) {
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Falha ao carregar notificações.");
        }
      } finally {
        if (!silent) {
          setLoadingNotifications(false);
        }
      }
    },
    [notifyBrowser, session],
  );

  React.useEffect(() => {
    void loadNotifications();

    const intervalId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, 60_000);

    const handleFocus = () => void loadNotifications({ silent: true });
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadNotifications]);

  async function requestBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      toast.error("Este navegador não suporta notificações.");
      return;
    }

    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);

    if (permission === "granted") {
      toast.success("Notificações do navegador ativadas.");
      notifyBrowser(notifications);
    }
  }

  async function completeTask(task: CrmLeadTask) {
    setUpdatingTaskId(task.id);

    try {
      await readJson<TaskResponse>(
        await fetch("/api/crm/tasks", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskId: task.id, status: "done" }),
        }),
      );

      setNotifications((current) => current.filter((item) => item.id !== task.id));
      toast.success("Tarefa concluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao concluir tarefa.");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between px-4 md:left-auto md:right-4 md:top-4 md:h-auto md:w-auto md:px-0 md:pointer-events-auto">
      <div className="pointer-events-auto flex items-center gap-2">
        <SidebarTrigger className="h-11 w-11 rounded-xl border-border/80 bg-white/90 shadow-card backdrop-blur hover:bg-accent hover:text-accent-foreground md:hidden" />
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        {canShowCrmFinancial ? (
          <div className="flex items-center rounded-xl border border-border/80 bg-white/90 p-1 shadow-card backdrop-blur">
            <Button
              asChild
              size="sm"
              variant={isCrm ? "default" : "ghost"}
              className={cn("rounded-lg px-2.5 sm:px-3", isCrm && "bg-gradient-primary")}
            >
              <Link to="/">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">CRM</span>
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant={isFinancial ? "default" : "ghost"}
              className={cn("rounded-lg px-2.5 sm:px-3", isFinancial && "bg-gradient-primary")}
            >
              <Link to="/financeiro">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Financeiro</span>
              </Link>
            </Button>
            {canShowStudent ? (
              <Button
                asChild
                size="sm"
                variant={isStudent ? "default" : "ghost"}
                className={cn("rounded-lg px-2.5 sm:px-3", isStudent && "bg-gradient-primary")}
              >
                <Link to="/aluno">
                  <GraduationCap className="h-4 w-4" />
                  <span className="hidden sm:inline">Aluno</span>
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative rounded-xl border-border/80 bg-white/90 shadow-card backdrop-blur hover:bg-accent hover:text-accent-foreground"
            >
              <Bell className="h-5 w-5" />
              {notifications.length ? (
                <Badge className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-gold p-0 px-1 text-[10px] text-gold-foreground">
                  {notifications.length}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
            <div className="border-b bg-[linear-gradient(135deg,#F4B728_0%,#F4B728_58%,#D99A10_100%)] p-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Notificações</div>
                  <p className="mt-1 text-xs text-white/70">
                    Tarefas do CRM próximas ou atrasadas.
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => loadNotifications()}
                  disabled={loadingNotifications}
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  {loadingNotifications ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-3">
              {notifications.length ? (
                <div className="space-y-2">
                  {notifications.map((task) => (
                    <div key={task.id} className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-bold">{task.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{task.leadName}</div>
                          <div
                            className={cn(
                              "mt-2 flex items-center gap-1 text-xs font-semibold",
                              new Date(task.dueAt).getTime() < Date.now()
                                ? "text-destructive"
                                : "text-primary",
                            )}
                          >
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatNotificationDate(task.dueAt)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="shrink-0 gap-1.5 bg-gradient-primary"
                          onClick={() => void completeTask(task)}
                          disabled={updatingTaskId === task.id}
                        >
                          {updatingTaskId === task.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Feita
                        </Button>
                      </div>
                      {task.notes ? (
                        <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                          {task.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-32 flex-col items-center justify-center text-center">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                  <div className="mt-2 text-sm font-semibold">Nenhuma tarefa próxima</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O sino avisa quando uma tarefa estiver a 15 minutos.
                  </p>
                </div>
              )}
            </div>

            {browserPermission === "default" ? (
              <div className="border-t p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void requestBrowserNotifications()}
                >
                  Ativar alertas do navegador
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
