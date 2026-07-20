import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PremiumBlockedPopup() {
  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[5] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm md:left-(--sidebar-width)">
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-white p-6 text-center shadow-elegant">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-foreground">Area Premium Bloqueada</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Para liberar acesso total ao sistema entre em contato conosco.
        </p>
        <Button asChild className="mt-6 w-full bg-gradient-primary text-primary-foreground">
          <a href="https://wa.link/v5blum" target="_blank" rel="noreferrer">
            Fale Conosco
          </a>
        </Button>
      </div>
    </div>
  );
}
