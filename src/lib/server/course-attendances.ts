import type { PoolClient, QueryResultRow } from "pg";
import { isUuid } from "@/lib/server/commercial-schema";
import { ensureRuntimeSchema, queryDb, withTransaction } from "@/lib/server/db";

export type CourseAttendanceStatus = "active" | "inactive";

export type CourseAttendanceRecord = {
  id: string;
  unitId: string;
  unitName: string;
  courseId: string;
  courseName: string;
  city: string;
  state: string;
  classDate: string;
  displayName: string;
  status: CourseAttendanceStatus;
  consultantIds: Array<string>;
  consultantNames: Array<string>;
  roundRobinCursor: number;
};

type AttendanceRow = QueryResultRow & {
  id: string;
  unit_id: string;
  unit_name: string;
  course_id: string;
  course_name: string;
  city: string;
  state: string;
  class_date: string;
  status: CourseAttendanceStatus;
  consultant_ids: Array<string> | null;
  consultant_names: Array<string> | null;
  round_robin_cursor: number;
};

type CandidateRow = QueryResultRow & {
  id: string;
  name: string;
};

type CampaignAttendanceRow = QueryResultRow & {
  id: string;
  unit_id: string;
  course_id: string;
  course_name: string;
  city: string;
  state: string;
  round_robin_cursor: number;
};

let schemaPromise: Promise<void> | null = null;

export function normalizeRoutingText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function formatCourseAttendanceName(input: {
  courseName: string;
  city: string;
  state: string;
  classDate: string;
}) {
  const [year, month, day] = input.classDate.slice(0, 10).split("-");
  const formattedDate = year && month && day ? `${day}/${month}/${year}` : input.classDate;
  return `${input.courseName} · ${input.city}/${input.state} · ${formattedDate}`;
}

export async function ensureCourseAttendanceSchema() {
  schemaPromise ??= ensureRuntimeSchema(
    "course-attendances",
    `
    create table if not exists app_course_attendances (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid not null references app_units(id) on delete cascade,
      course_id uuid not null references app_courses(id) on delete cascade,
      city text not null,
      city_normalized text not null,
      state text not null,
      class_date date not null default current_date,
      round_robin_cursor integer not null default 0 check (round_robin_cursor >= 0),
      status text not null default 'active' check (status in ('active', 'inactive')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (unit_id, course_id, city_normalized, state, class_date)
    );

    alter table app_course_attendances add column if not exists class_date date;
    update app_course_attendances
    set class_date = coalesce(class_date, created_at::date, current_date)
    where class_date is null;
    alter table app_course_attendances alter column class_date set not null;
    alter table app_course_attendances
      drop constraint if exists app_course_attendances_unit_id_course_id_city_normalized_st_key;
    drop index if exists app_course_attendances_unit_id_course_id_city_normalized_st_key;
    create unique index if not exists app_course_attendances_identity_idx
      on app_course_attendances (unit_id, course_id, city_normalized, state, class_date);

    create index if not exists app_course_attendances_unit_idx
      on app_course_attendances (unit_id, status);

    create table if not exists app_course_attendance_consultants (
      attendance_id uuid not null references app_course_attendances(id) on delete cascade,
      user_id uuid not null references app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (attendance_id, user_id)
    );

    create index if not exists app_course_attendance_consultants_user_idx
      on app_course_attendance_consultants (user_id);

    alter table app_leads add column if not exists attendance_id uuid
      references app_course_attendances(id) on delete set null;
    alter table app_leads add column if not exists shared_queue boolean not null default false;
    create index if not exists app_leads_attendance_idx on app_leads (attendance_id);
    create index if not exists app_leads_shared_queue_idx
      on app_leads (attendance_id, created_at desc)
      where shared_queue = true and stage = 'Novo lead';

    update app_leads lead
    set shared_queue = true,
        created_by = null,
        updated_at = now()
    where lead.stage = 'Novo lead'
      and lead.attendance_id is not null
      and not lead.shared_queue
      and exists (
        select 1
        from app_course_attendance_consultants attendance_consultant
        inner join app_users consultant on consultant.id = attendance_consultant.user_id
        where attendance_consultant.attendance_id = lead.attendance_id
          and consultant.role = 'CONSULTOR'
          and consultant.status = 'active'
      );
  `,
  )
    .then(() => undefined)
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });

  await schemaPromise;
}

function mapAttendance(row: AttendanceRow): CourseAttendanceRecord {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    courseId: row.course_id,
    courseName: row.course_name,
    city: row.city,
    state: row.state,
    classDate: row.class_date,
    displayName: formatCourseAttendanceName({
      courseName: row.course_name,
      city: row.city,
      state: row.state,
      classDate: row.class_date,
    }),
    status: row.status,
    consultantIds: row.consultant_ids ?? [],
    consultantNames: row.consultant_names ?? [],
    roundRobinCursor: Number(row.round_robin_cursor) || 0,
  };
}

export async function listCourseAttendances(unitId: string) {
  await ensureCourseAttendanceSchema();

  const [attendances, consultants] = await Promise.all([
    queryDb<AttendanceRow>(
      `
        select
          a.id,
          a.unit_id,
          u.name as unit_name,
          a.course_id,
          c.name as course_name,
          a.city,
          a.state,
          a.class_date::text,
          a.status,
          a.round_robin_cursor,
          coalesce(
            array_agg(ac.user_id::text order by consultant.name)
              filter (where ac.user_id is not null),
            '{}'
          ) as consultant_ids,
          coalesce(
            array_agg(consultant.name order by consultant.name)
              filter (where consultant.id is not null),
            '{}'
          ) as consultant_names
        from app_course_attendances a
        inner join app_units u on u.id = a.unit_id
        inner join app_courses c on c.id = a.course_id
        left join app_course_attendance_consultants ac on ac.attendance_id = a.id
        left join app_users consultant on consultant.id = ac.user_id
        where a.unit_id = $1
        group by a.id, u.id, c.id
        order by a.class_date asc, c.name asc, a.state asc, a.city asc
      `,
      [unitId],
    ),
    queryDb<CandidateRow>(
      `
        select u.id, u.name
        from app_users u
        where u.role in ('CONSULTOR', 'GERENTE', 'DIRETOR')
          and u.status = 'active'
          and (
            u.primary_unit_id = $1
            or exists (
              select 1
              from app_user_units uu
              where uu.user_id = u.id and uu.unit_id = $1
            )
          )
        order by u.name asc
      `,
      [unitId],
    ),
  ]);

  return {
    attendances: attendances.rows.map(mapAttendance),
    consultants: consultants.rows,
  };
}

type AttendanceInput = {
  id?: unknown;
  unitId?: unknown;
  courseId?: unknown;
  city?: unknown;
  state?: unknown;
  classDate?: unknown;
  status?: unknown;
  consultantIds?: unknown;
};

function parseInput(input: AttendanceInput) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const unitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
  const courseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
  const city = typeof input.city === "string" ? input.city.trim().replace(/\s+/g, " ") : "";
  const state = typeof input.state === "string" ? input.state.trim().toUpperCase() : "";
  const classDate = typeof input.classDate === "string" ? input.classDate.trim() : "";
  const consultantIds = Array.isArray(input.consultantIds)
    ? Array.from(
        new Set(
          input.consultantIds.filter(
            (value): value is string => typeof value === "string" && isUuid(value),
          ),
        ),
      )
    : [];

  if (id && !isUuid(id)) {
    throw new Error("Atendimento inválido.");
  }

  if (
    !isUuid(unitId) ||
    !isUuid(courseId) ||
    city.length < 2 ||
    !/^[A-Z]{2}$/.test(state) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(classDate)
  ) {
    throw new Error("Informe curso, cidade, UF e data válidos.");
  }

  if (!consultantIds.length) {
    throw new Error("Selecione ao menos um responsável.");
  }

  return {
    id,
    unitId,
    courseId,
    city,
    cityNormalized: normalizeRoutingText(city),
    state,
    classDate,
    status: input.status === "inactive" ? ("inactive" as const) : ("active" as const),
    consultantIds,
  };
}

export async function saveCourseAttendance(input: AttendanceInput) {
  await ensureCourseAttendanceSchema();
  const data = parseInput(input);

  return withTransaction(async (client) => {
    const course = await client.query(
      `select id from app_courses where id = $1 and unit_id = $2 limit 1`,
      [data.courseId, data.unitId],
    );

    if (!course.rows[0]) {
      throw new Error("Curso indisponível para esta unidade.");
    }

    const validConsultants = await client.query<{ id: string }>(
      `
        select u.id
        from app_users u
        where u.id = any($2::uuid[])
          and u.role in ('CONSULTOR', 'GERENTE', 'DIRETOR')
          and u.status = 'active'
          and (
            u.primary_unit_id = $1
            or exists (
              select 1
              from app_user_units uu
              where uu.user_id = u.id and uu.unit_id = $1
            )
          )
      `,
      [data.unitId, data.consultantIds],
    );

    if (validConsultants.rows.length !== data.consultantIds.length) {
      throw new Error("Há responsáveis inválidos ou fora da unidade.");
    }

    const result = data.id
      ? await client.query<{ id: string }>(
          `
            update app_course_attendances
            set course_id = $2,
                city = $3,
                city_normalized = $4,
                state = $5,
                class_date = $6::date,
                status = $7,
                updated_at = now()
            where id = $1 and unit_id = $8
            returning id
          `,
          [
            data.id,
            data.courseId,
            data.city,
            data.cityNormalized,
            data.state,
            data.classDate,
            data.status,
            data.unitId,
          ],
        )
      : await client.query<{ id: string }>(
          `
            insert into app_course_attendances (
              unit_id, course_id, city, city_normalized, state, class_date, status
            )
            values ($1, $2, $3, $4, $5, $6::date, $7)
            returning id
          `,
          [
            data.unitId,
            data.courseId,
            data.city,
            data.cityNormalized,
            data.state,
            data.classDate,
            data.status,
          ],
        );
    const attendance = result.rows[0];

    if (!attendance) {
      throw new Error("Atendimento não encontrado.");
    }

    await client.query(`delete from app_course_attendance_consultants where attendance_id = $1`, [
      attendance.id,
    ]);

    for (const consultantId of data.consultantIds) {
      await client.query(
        `
          insert into app_course_attendance_consultants (attendance_id, user_id)
          values ($1, $2)
        `,
        [attendance.id, consultantId],
      );
    }

    if (data.status === "inactive") {
      await client.query(
        `update app_meta_forms set status = 'inactive', updated_at = now() where attendance_id = $1 and status = 'active'`,
        [attendance.id],
      );
    }

    return attendance;
  });
}

export async function deleteCourseAttendance(id: string, unitId: string) {
  await ensureCourseAttendanceSchema();

  if (!isUuid(id) || !isUuid(unitId)) {
    throw new Error("Atendimento inválido.");
  }

  await withTransaction(async (client) => {
    await client.query(
      `update app_course_attendances set status = 'inactive', updated_at = now() where id = $1 and unit_id = $2`,
      [id, unitId],
    );
    await client.query(
      `update app_meta_forms set status = 'inactive', updated_at = now() where attendance_id = $1 and status = 'active'`,
      [id],
    );
  });
}

export function parseCampaignRoute(campaignName: string) {
  const groups = Array.from(campaignName.matchAll(/\[([^\]]+)\]/g))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  const locationIndex = groups.findIndex((group) => /^.+-\s*[A-Za-z]{2}$/.test(group));

  if (locationIndex <= 0) {
    return { error: "Nome fora do padrão [Curso] [Cidade-UF]." } as const;
  }

  const location = groups[locationIndex];
  const separator = location.lastIndexOf("-");
  const city = location.slice(0, separator).trim();
  const state = location
    .slice(separator + 1)
    .trim()
    .toUpperCase();
  const courseName = groups[locationIndex - 1]?.trim() ?? "";

  if (!courseName || city.length < 2 || !/^[A-Z]{2}$/.test(state)) {
    return { error: "Curso, cidade ou UF não puderam ser identificados." } as const;
  }

  return {
    courseName,
    city,
    state,
    normalizedCourse: normalizeRoutingText(courseName),
    normalizedCity: normalizeRoutingText(city),
  } as const;
}

function textContainsNormalized(haystack: string, needle: string) {
  return ` ${haystack} `.includes(` ${needle} `);
}

function findRegisteredCampaignMatches<
  T extends {
    course_name: string;
    city: string;
    state: string;
  },
>(campaignName: string, rows: Array<T>) {
  const normalizedCampaign = normalizeRoutingText(campaignName);

  return rows.filter((row) => {
    const normalizedCourse = normalizeRoutingText(row.course_name);
    const normalizedCity = normalizeRoutingText(row.city);
    const normalizedState = normalizeRoutingText(row.state);

    return (
      textContainsNormalized(normalizedCampaign, normalizedCourse) &&
      textContainsNormalized(normalizedCampaign, normalizedCity) &&
      textContainsNormalized(normalizedCampaign, normalizedState)
    );
  });
}

export async function findCampaignAttendance(client: PoolClient, campaignName: string | null) {
  if (!campaignName) {
    return { attendance: null, error: "Campanha sem nome." } as const;
  }

  const parsed = parseCampaignRoute(campaignName);

  await ensureCourseAttendanceSchema();
  const selectAttendanceSql = `
    select
      a.id,
      a.unit_id,
      a.course_id,
      c.name as course_name,
      a.city,
      a.state,
      a.round_robin_cursor
    from app_course_attendances a
    inner join app_courses c on c.id = a.course_id
    where a.status = 'active'
      and c.status = 'active'
  `;

  let matches: Array<CampaignAttendanceRow> = [];

  if (!("error" in parsed)) {
    const result = await client.query<CampaignAttendanceRow>(
      `
        ${selectAttendanceSql}
          and a.city_normalized = $1
          and a.state = $2
        for update of a
      `,
      [parsed.normalizedCity, parsed.state],
    );
    matches = result.rows.filter(
      (row) => normalizeRoutingText(row.course_name) === parsed.normalizedCourse,
    );
  }

  if (!matches.length) {
    const registeredResult = await client.query<CampaignAttendanceRow>(
      `
        ${selectAttendanceSql}
        for update of a
      `,
    );
    matches = findRegisteredCampaignMatches(campaignName, registeredResult.rows);
  }

  if (matches.length !== 1) {
    return {
      attendance: null,
      error:
        matches.length > 1
          ? "Mais de um atendimento corresponde à campanha."
          : "Atendimento não encontrado para a campanha.",
    } as const;
  }

  return { attendance: matches[0], error: null } as const;
}

export async function getAttendanceConsultants(
  client: PoolClient,
  attendance: {
    id: string;
    unit_id: string;
  },
) {
  const candidates = await client.query<CandidateRow>(
    `
      select u.id, u.name
      from app_course_attendance_consultants ac
      inner join app_users u on u.id = ac.user_id
      where ac.attendance_id = $1
        and u.role = 'CONSULTOR'
        and u.status = 'active'
        and (
          u.primary_unit_id = $2
          or exists (
            select 1
            from app_user_units uu
            where uu.user_id = u.id and uu.unit_id = $2
          )
        )
      order by u.name asc
    `,
    [attendance.id, attendance.unit_id],
  );

  return candidates.rows;
}
