import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewManagement } from "@/lib/auth-types";
import type { CommercialStatus, CourseRecord } from "@/lib/commercial-types";
import {
  ensureCommercialSchema,
  getUnitFromBody,
  getUnitFromRequest,
  isUniqueError,
} from "@/lib/server/commercial-schema";
import { getSessionFromRequest } from "@/lib/server/auth";
import { ensureCourseAttendanceSchema } from "@/lib/server/course-attendances";
import { queryDb } from "@/lib/server/db";

type CourseRow = QueryResultRow & {
  id: string;
  unit_id: string;
  name: string;
  value: string;
  category: string | null;
  status: CommercialStatus;
  created_at: string;
};

type AttendanceOptionRow = QueryResultRow & {
  id: string;
  unit_id: string;
  course_id: string;
  city: string;
  state: string;
  class_date: string;
  status: CommercialStatus;
  display_name: string;
};

function mapCourse(row: CourseRow): CourseRecord {
  return {
    id: row.id,
    unitId: row.unit_id,
    name: row.name,
    value: Number(row.value),
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parseCoursePayload(body: unknown) {
  const data = body as {
    name?: unknown;
    value?: unknown;
    category?: unknown;
    status?: unknown;
    unitId?: unknown;
  };
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const rawValue =
    typeof data?.value === "number"
      ? data.value
      : Number(String(data?.value ?? "").replace(",", "."));
  const category = typeof data?.category === "string" ? data.category.trim() : "";
  const status = data?.status === "inactive" ? "inactive" : "active";

  return {
    name,
    value: rawValue,
    category,
    status,
    unitId: data?.unitId,
  };
}

export const Route = createFileRoute("/api/gestao/courses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const unit = getUnitFromRequest(session, request);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        await ensureCommercialSchema();
        await ensureCourseAttendanceSchema();

        const [result, attendances] = await Promise.all([
          queryDb<CourseRow>(
            `
            select id, unit_id, name, value::text, category, status, created_at::text
            from app_courses
            where unit_id = $1
            order by
              case status when 'active' then 1 else 2 end,
              name asc
          `,
            [unit.id],
          ),
          queryDb<AttendanceOptionRow>(
            `
            select a.id, a.unit_id, a.course_id, a.city, a.state, a.class_date::text,
              a.status,
              concat(c.name, ' · ', a.city, '/', a.state, ' · ', to_char(a.class_date, 'DD/MM/YYYY')) as display_name
            from app_course_attendances a
            inner join app_courses c on c.id = a.course_id
            where a.unit_id = $1
            order by case a.status when 'active' then 1 else 2 end, a.class_date, c.name, a.city
          `,
            [unit.id],
          ),
        ]);

        return Response.json(
          {
            courses: result.rows.map(mapCourse),
            attendances: attendances.rows.map((attendance) => ({
              id: attendance.id,
              unitId: attendance.unit_id,
              courseId: attendance.course_id,
              city: attendance.city,
              state: attendance.state,
              classDate: attendance.class_date,
              status: attendance.status,
              displayName: attendance.display_name,
            })),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!canViewManagement(session.user.role)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const payload = parseCoursePayload(body);
        const unit = getUnitFromBody(session, payload.unitId);

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!payload.name || Number.isNaN(payload.value) || payload.value < 0) {
          return Response.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
        }

        await ensureCommercialSchema();

        try {
          const result = await queryDb<CourseRow>(
            `
              insert into app_courses (unit_id, name, value, category, status, created_by)
              values ($1, $2, $3, nullif($4, ''), $5, $6)
              returning id, unit_id, name, value::text, category, status, created_at::text
            `,
            [
              unit.id,
              payload.name,
              payload.value,
              payload.category,
              payload.status,
              session.user.id,
            ],
          );

          return Response.json({ course: mapCourse(result.rows[0]) }, { status: 201 });
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Curso já cadastrado." }, { status: 409 });
          }

          throw error;
        }
      },
    },
  },
});
