import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import starLogo from "@/assets/star-profissoes-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Login - Star Profissões" }] }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((response) => {
        if (active && response.ok) {
          window.location.replace("/");
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível entrar.");
      }

      window.location.assign("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-elegant md:p-8"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex max-w-[290px] items-center justify-center">
            <img
              src={starLogo}
              alt="Star Profissões"
              className="block max-h-64 w-full object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold">Fazer Login</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="px-9"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="h-10 w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </div>
      </form>
    </main>
  );
}
