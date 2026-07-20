import type { ReactNode } from "react";

export function PageHeader({
  eyebrow, title, description, actions,
}: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
