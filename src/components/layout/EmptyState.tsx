import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-accent/20 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="mt-4 max-w-md">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
