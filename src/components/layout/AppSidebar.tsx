import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  ChartNoAxesCombined,
  ClipboardPenLine,
  ContactRound,
  FileUp,
  Gauge,
  LibraryBig,
  LogOut,
  MapPinned,
  Megaphone,
  MessageCircleMore,
  MessagesSquare,
  UserRoundCheck,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import starLogo from "@/assets/star-profissoes-logo.png";
import { useAuth } from "@/lib/auth";
import {
  canAccessSystemFeedback,
  canManageUnits,
  canSwitchActiveUnit,
  canViewGrowth,
  canViewManagement,
  canViewMetaAds,
  canViewSalesAi,
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
  salesAiOnly?: boolean;
  devOnly?: boolean;
  whatsappOnly?: boolean;
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
      { title: "IA Comercial", url: "/ia-comercial", icon: WandSparkles, salesAiOnly: true },
      {
        title: "Conversas WhatsApp",
        url: "/conversas-whatsapp",
        icon: MessageCircleMore,
        whatsappOnly: true,
      },
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
  const { logout, session, setActiveUnit } = useAuth();
  const [switchingUnit, setSwitchingUnit] = React.useState(false);
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const user = session?.user;
  const activeUnit = session?.activeUnit;
  const isActive = (url: string) => (url === "/" ? path === "/" : path.startsWith(url));
  const canViewManagementArea = user ? canViewManagement(user.role) : false;
  const canViewStudentList = user ? canViewStudents(user.role) : false;
  const canViewSystemFeedback = user ? canAccessSystemFeedback(user.role) : false;
  const canSeeSalesAi = user ? canViewSalesAi(user.role) : false;
  const canSwitchUnit = user ? canSwitchActiveUnit(user.role) : false;
  const handleUnitChange = async (unitId: string) => {
    if (!activeUnit || unitId === activeUnit.id || switchingUnit) {
      return;
    }

    const nextUnit = session?.units.find((unit) => unit.id === unitId);

    try {
      setSwitchingUnit(true);
      await setActiveUnit(unitId);
      toast.success(nextUnit ? `Unidade alterada para ${nextUnit.name}.` : "Unidade alterada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível trocar a unidade.");
    } finally {
      setSwitchingUnit(false);
    }
  };
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
          (!item.salesAiOnly || canSeeSalesAi) &&
          (!item.whatsappOnly ||
            user?.role === "CONSULTOR" ||
            Boolean(session?.features.whatsappSupervision)) &&
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
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/[0.14] via-white/[0.08] to-[#377DFE]/20 p-3 shadow-[0_18px_42px_-28px_rgba(0,0,0,0.75)]">
              <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#377DFE]/20 blur-2xl" />
              <Link
                to="/perfil"
                title="Editar perfil"
                onClick={closeMobileSidebar}
                className="relative flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
              >
                <Avatar className="h-10 w-10 border-2 border-[#F4B728]/80 shadow-[0_8px_22px_-12px_rgba(244,183,40,0.95)]">
                  <AvatarImage
                    src={user?.avatarUrl ?? undefined}
                    alt={user?.name ?? "Perfil"}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-primary text-xs font-bold text-primary-foreground">
                    {user ? getInitials(user.name) : "PG"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-semibold text-white">
                    {user?.name ?? "Star Profissões"}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-medium text-white/65">
                    {user ? ROLE_LABELS[user.role] : "Star Profissões"}
                  </div>
                </div>
              </Link>

              {activeUnit ? (
                canSwitchUnit ? (
                  <Select
                    value={activeUnit.id}
                    onValueChange={(unitId) => void handleUnitChange(unitId)}
                    disabled={switchingUnit}
                  >
                    <SelectTrigger
                      aria-label="Selecionar unidade ativa"
                      className="relative mt-3 h-9 border-white/15 bg-[#0B1A55]/65 px-2.5 text-xs font-medium text-white shadow-none transition hover:border-[#F4B728]/50 hover:bg-[#0B1A55]/85 focus:ring-[#F4B728] disabled:opacity-70 [&>svg]:text-[#F4B728]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-[#F4B728]" />
                        <SelectValue placeholder="Selecione a unidade" />
                      </span>
                    </SelectTrigger>
                    <SelectContent className="border-[#224C99]/20 bg-white text-[#07154C]">
                      {session?.units.map((unit) => (
                        <SelectItem
                          key={unit.id}
                          value={unit.id}
                          className="focus:bg-[#EAF1FF] focus:text-[#16006C]"
                        >
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="relative mt-3 flex items-center gap-2 truncate rounded-lg border border-white/12 bg-[#0B1A55]/55 px-2.5 py-2 text-xs font-medium text-white/80">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-[#F4B728]" />
                    <span className="truncate">{activeUnit.name}</span>
                  </div>
                )
              ) : null}
            </div>
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
