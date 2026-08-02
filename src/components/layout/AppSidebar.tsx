import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChartNoAxesCombined,
  ClipboardPenLine,
  ContactRound,
  FileUp,
  Gauge,
  LibraryBig,
  LogOut,
  MapPinned,
  Megaphone,
  MessagesSquare,
  UserRoundCheck,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import starLogo from "@/assets/star-profissoes-logo.png";
import { useAuth } from "@/lib/auth";
import {
  canAccessSystemFeedback,
  canManageUnits,
  canViewAttendances,
  canViewGrowth,
  canViewManagement,
  canViewMetaAds,
  canViewStudents,
  getInitials,
  ROLE_LABELS,
} from "@/lib/auth-types";
import { cn } from "@/lib/utils";

type NavigationItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  managementOnly?: boolean;
  studentViewOnly?: boolean;
  systemFeedbackOnly?: boolean;
  attendancesOnly?: boolean;
  devOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: Array<NavigationItem>;
};

const groups: Array<NavigationGroup> = [
  {
    label: "Visão geral",
    items: [{ title: "Dashboard", url: "/", icon: Gauge }],
  },
  {
    label: "Comercial",
    items: [
      { title: "Leads", url: "/crm", icon: ContactRound },
      { title: "Alunos", url: "/leads", icon: UserRoundCheck, studentViewOnly: true },
      { title: "IA Comercial", url: "/ia-comercial", icon: WandSparkles, attendancesOnly: true },
    ],
  },
  {
    label: "Crescimento",
    items: [{ title: "Relatórios", url: "/bi", icon: ChartNoAxesCombined }],
  },
  {
    label: "Área de Membros",
    items: [{ title: "Treinamentos", url: "/treinamentos", icon: LibraryBig }],
  },
  {
    label: "Gestão",
    items: [
      {
        title: "Cadastros e pipelines",
        url: "/gestao/cadastro",
        icon: ClipboardPenLine,
        managementOnly: true,
      },
      { title: "Importar leads", url: "/crm/importar", icon: FileUp, devOnly: true },
      { title: "Feedback", url: "/feedback", icon: MessagesSquare, systemFeedbackOnly: true },
    ],
  },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { logout, session } = useAuth();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const user = session?.user;
  const activeUnit = session?.activeUnit;
  const isActive = (url: string) => (url === "/" ? path === "/" : path.startsWith(url));
  const canViewManagementArea = user ? canViewManagement(user.role) : false;
  const canViewStudentList = user ? canViewStudents(user.role) : false;
  const canViewSystemFeedback = user ? canAccessSystemFeedback(user.role) : false;
  const canSeeAttendances = user ? canViewAttendances(user.role) : false;
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const visibleGroups = groups
    .filter(
      (group) =>
        (group.label !== "Crescimento" || (user ? canViewGrowth(user.role) : false)) &&
        (group.label !== "Gestão" || canViewManagementArea || canViewSystemFeedback),
    )
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.managementOnly || canViewManagementArea) &&
          (!item.studentViewOnly || canViewStudentList) &&
          (!item.systemFeedbackOnly || canViewSystemFeedback) &&
          (!item.attendancesOnly || canSeeAttendances) &&
          (!item.devOnly || user?.role === "DEV"),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const administrationItems: Array<NavigationItem> = [
    ...(user && canViewMetaAds(user.role)
      ? [{ title: "Meta Ads", url: "/meta-ads", icon: Megaphone }]
      : []),
    ...(session?.canRegisterUsers
      ? [
          { title: "Usuários", url: "/usuarios", icon: UsersRound },
          ...(user && canManageUnits(user.role)
            ? [{ title: "Unidades", url: "/unidades", icon: MapPinned }]
            : []),
        ]
      : []),
  ];
  const navGroups = administrationItems.length
    ? [...visibleGroups, { label: "Administração", items: administrationItems }]
    : visibleGroups;

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/80 shadow-[12px_0_36px_-34px_rgba(15,23,42,0.45)]"
    >
      <SidebarHeader className="border-b border-sidebar-border/80 bg-transparent">
        <div className="px-3 py-4">
          <div
            className={cn(
              "flex items-center gap-2",
              collapsed ? "justify-center" : "justify-between",
            )}
          >
            {!collapsed ? (
              <img
                src={starLogo}
                alt="Star Profissões"
                className="h-24 min-w-0 flex-1 object-contain"
              />
            ) : null}
            <SidebarTrigger className="shrink-0 rounded-lg border border-sidebar-border/80 bg-white/70 shadow-sm hover:bg-white" />
          </div>
          {!collapsed && <div className="sr-only">Star Profissões</div>}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.url);

                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="relative text-sidebar-foreground/82 transition-all duration-200 hover:translate-x-0.5 hover:bg-white/85 hover:text-sidebar-accent-foreground hover:shadow-[0_14px_34px_-30px_rgba(15,23,42,0.45)] data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[0_14px_32px_-24px_rgba(244,183,40,0.55)] data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1/2 data-[active=true]:before:h-5 data-[active=true]:before:w-[3px] data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-r data-[active=true]:before:bg-primary [&>svg]:text-sidebar-foreground/65 [&>svg]:transition-all [&>svg]:duration-200 hover:[&>svg]:scale-110 hover:[&>svg]:text-sidebar-accent-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground"
                      >
                        <Link to={item.url} onClick={closeMobileSidebar}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        {!collapsed ? (
          <div className="m-2 space-y-2">
            <Link
              to="/perfil"
              title="Editar perfil"
              onClick={closeMobileSidebar}
              className="block rounded-xl border border-sidebar-border/80 bg-white/72 p-3 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-sidebar-border">
                  <AvatarImage
                    src={user?.avatarUrl ?? undefined}
                    alt={user?.name ?? "Perfil"}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
                    {user ? getInitials(user.name) : "PG"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-semibold text-sidebar-foreground">
                    {user?.name ?? "Star Profissões"}
                  </div>
                  <div className="truncate text-xs text-sidebar-foreground/70">
                    {user ? ROLE_LABELS[user.role] : "Star Profissões"}
                  </div>
                </div>
              </div>
              {activeUnit ? (
                <div className="mt-2 truncate rounded-md border border-sidebar-border/70 bg-sidebar-accent/45 px-2 py-1 text-xs text-sidebar-foreground/75">
                  {activeUnit.name}
                </div>
              ) : null}
            </Link>
            <LogoutMenuItem onLogout={logout} />
          </div>
        ) : (
          <div className="m-2 space-y-2">
            <div className="flex justify-center">
              <Link
                to="/perfil"
                aria-label="Editar perfil"
                title="Editar perfil"
                onClick={closeMobileSidebar}
                className="rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Avatar className="h-8 w-8 border border-sidebar-border">
                  <AvatarImage
                    src={user?.avatarUrl ?? undefined}
                    alt={user?.name ?? "Perfil"}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
                    {user ? getInitials(user.name) : "PG"}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </div>
            <LogoutMenuItem onLogout={logout} />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function LogoutMenuItem({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => void onLogout()}
          className="text-sidebar-foreground/75 hover:bg-white/85 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
