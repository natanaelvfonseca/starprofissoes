import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/conversas-whatsapp")({
  component: () => (
    <Navigate to="/ia-comercial" search={{ tab: "conversas", consultantId: undefined }} replace />
  ),
});
