import { createFileRoute } from "@tanstack/react-router";
import { canViewManagement, isExecutiveRole, isMasterRole } from "@/lib/auth-types";
import {
  deleteCourseAttendance,
  listCourseAttendances,
  saveCourseAttendance,
} from "@/lib/server/course-attendances";
import { getSessionFromRequest } from "@/lib/server/auth";

function attendanceError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    return "Já existe um atendimento para este curso, cidade e UF.";
  }

  return error instanceof Error ? error.message : "Falha ao salvar atendimento.";
}

async function authorize(request: Request, requestedUnitId: string) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return { response: Response.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  }

  if (!canViewManagement(session.user.role) || !session.activeUnit) {
    return { response: Response.json({ ok: false, error: "Acesso negado." }, { status: 403 }) };
  }

  const canChooseUnit = isMasterRole(session.user.role) || isExecutiveRole(session.user.role);
  const unitId = canChooseUnit ? requestedUnitId || session.activeUnit.id : session.activeUnit.id;

  if (!session.units.some((unit) => unit.id === unitId)) {
    return { response: Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 }) };
  }

  return { session, unitId };
}

export const Route = createFileRoute("/api/gestao/attendances")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const auth = await authorize(request, url.searchParams.get("unitId") ?? "");

        if ("response" in auth) {
          return auth.response;
        }

        return Response.json(await listCourseAttendances(auth.unitId), {
          headers: { "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const requestedUnitId = typeof body?.unitId === "string" ? body.unitId : "";
        const auth = await authorize(request, requestedUnitId);

        if ("response" in auth) {
          return auth.response;
        }

        try {
          await saveCourseAttendance({ ...(body ?? {}), unitId: auth.unitId });
          return Response.json({ ok: true }, { status: 201 });
        } catch (error) {
          const message = attendanceError(error);
          const status =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
              ? 409
              : 400;
          return Response.json({ ok: false, error: message }, { status });
        }
      },
      PATCH: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const requestedUnitId = typeof body?.unitId === "string" ? body.unitId : "";
        const auth = await authorize(request, requestedUnitId);

        if ("response" in auth) {
          return auth.response;
        }

        try {
          await saveCourseAttendance({ ...(body ?? {}), unitId: auth.unitId });
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json(
            { ok: false, error: attendanceError(error) },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const requestedUnitId = typeof body?.unitId === "string" ? body.unitId : "";
        const auth = await authorize(request, requestedUnitId);

        if ("response" in auth) {
          return auth.response;
        }

        try {
          await deleteCourseAttendance(String(body?.id ?? ""), auth.unitId);
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Falha ao excluir atendimento." },
            { status: 400 },
          );
        }
      },
    },
  },
});
