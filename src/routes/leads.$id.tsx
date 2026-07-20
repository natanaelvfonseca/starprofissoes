import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/leads/$id")({
  head: ({ params }) => ({ meta: [{ title: `Aluno ${params.id} · Star Profissões` }] }),
  component: LeadDetail,
  notFoundComponent: () => (
    <div className="p-8">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/leads">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para alunos
          </Link>
        </Button>
      </div>
      <EmptyState
        icon={Users}
        title="Aluno não encontrado"
        description="Ainda não há cadastro real para este registro."
      />
    </div>
  ),
});

function LeadDetail() {
  throw notFound();
}
