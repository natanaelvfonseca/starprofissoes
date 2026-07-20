import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, delta, icon: Icon, hint, accent,
}: {
  label: string;
  value: string | number;
  delta?: number;
  icon: LucideIcon;
  hint?: string;
  accent?: "primary" | "gold" | "success" | "warning";
}) {
  const positive = (delta ?? 0) >= 0;
  const accentBg = {
    primary: "bg-primary/10 text-primary",
    gold: "bg-gold/15 text-gold",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
  }[accent ?? "primary"];

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elegant">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accentBg)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
            positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-primary opacity-0 blur-2xl transition-opacity group-hover:opacity-20" />
    </div>
  );
}
