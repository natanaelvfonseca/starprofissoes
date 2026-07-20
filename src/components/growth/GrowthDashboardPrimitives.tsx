import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import type { AuthSession } from "@/lib/auth-types";
import { canViewNetworkGrowth } from "@/lib/auth-types";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

export function metricValue(loading: boolean, value: string | number) {
  return loading ? "..." : value;
}

export function GrowthScopeSelect({
  session,
  value,
  onValueChange,
}: {
  session: AuthSession;
  value: string;
  onValueChange: (value: string) => void;
}) {
  if (!canViewNetworkGrowth(session.user.role)) {
    return (
      <Badge variant="secondary" className="bg-primary/10 text-primary">
        {session.activeUnit?.name ?? "Unidade ativa"}
      </Badge>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full md:w-[240px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Toda rede</SelectItem>
        {session.units.map((unit) => (
          <SelectItem key={unit.id} value={unit.id}>
            {unit.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GrowthPeriodSelect({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(next) => onValueChange(Number(next))}>
      <SelectTrigger className="w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7">Últimos 7 dias</SelectItem>
        <SelectItem value="30">Últimos 30 dias</SelectItem>
        <SelectItem value="90">Últimos 90 dias</SelectItem>
        <SelectItem value="365">Últimos 12 meses</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function GrowthAccessDenied() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Os indicadores de crescimento estão disponíveis para gestores da unidade e liderança da
          rede.
        </p>
      </div>
    </div>
  );
}

export function GrowthDataBar({
  label,
  value,
  max,
  detail,
  accent = "primary",
}: {
  label: string;
  value: number;
  max: number;
  detail: string;
  accent?: "primary" | "gold" | "success";
}) {
  const width = max > 0 ? Math.max(5, Math.round((value / max) * 100)) : 0;
  const fillClass = {
    primary: "bg-primary",
    gold: "bg-gold",
    success: "bg-success",
  }[accent];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-muted-foreground">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function GrowthLoading() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-2 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-2 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function GrowthEmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
