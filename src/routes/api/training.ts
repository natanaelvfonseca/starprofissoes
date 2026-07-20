import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import {
  canManageTraining,
  canViewLeadershipTraining,
  type AuthSession,
  type UnitSummary,
  type UserRole,
} from "@/lib/auth-types";
import {
  TRAINING_TRAILS,
  type TrainingLesson,
  type TrainingLessonScope,
  type TrainingTrailId,
  type TrainingVideoSource,
} from "@/lib/training-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromBody, getUnitFromRequest } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";

type TrainingLessonRow = QueryResultRow & {
  id: string;
  unit_id: string | null;
  trail: TrainingTrailId;
  title: string;
  description: string;
  duration_label: string;
  order_index: number;
  thumbnail_data_url: string | null;
  video_source: TrainingVideoSource;
  video_url: string | null;
  video_file_name: string;
  video_mime_type: string;
  created_by_name: string | null;
  created_at: string;
  completed_at: string | null;
};

type TrainingLessonInput = {
  unitId: string | null;
  trail: TrainingTrailId;
  title: string;
  description: string;
  durationLabel: string;
  orderIndex: number;
  thumbnailDataUrl: string | null;
  videoSource: TrainingVideoSource;
  videoUrl: string;
  videoFileName: string;
  videoMimeType: string;
  videoDataUrl: string | null;
};

const MAX_VIDEO_FILE_SIZE = 60 * 1024 * 1024;
const MAX_THUMBNAIL_FILE_SIZE = 6 * 1024 * 1024;
const MAX_TEXT_LENGTH = 1200;
const MAX_TITLE_LENGTH = 140;
const MAX_MEDIA_URL_LENGTH = 4000;

let trainingSchemaPromise: Promise<void> | null = null;

function ensureTrainingSchema() {
  trainingSchemaPromise ??= queryDb(`
    create table if not exists app_training_lessons (
      id uuid primary key default gen_random_uuid(),
      unit_id uuid references app_units(id) on delete cascade,
      trail text not null,
      title text not null,
      description text not null default '',
      duration_label text not null default '',
      order_index integer not null default 0,
      thumbnail_data_url text,
      video_source text not null default 'upload' check (video_source in ('upload', 'url')),
      video_url text,
      video_file_name text not null default '',
      video_mime_type text not null default 'video/mp4',
      video_data_url text,
      status text not null default 'published' check (status in ('published', 'archived')),
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table app_training_lessons add column if not exists unit_id uuid references app_units(id) on delete cascade;
    alter table app_training_lessons add column if not exists trail text;
    alter table app_training_lessons add column if not exists title text;
    alter table app_training_lessons add column if not exists description text not null default '';
    alter table app_training_lessons add column if not exists duration_label text not null default '';
    alter table app_training_lessons add column if not exists order_index integer not null default 0;
    alter table app_training_lessons add column if not exists thumbnail_data_url text;
    alter table app_training_lessons add column if not exists video_source text not null default 'upload';
    alter table app_training_lessons add column if not exists video_url text;
    alter table app_training_lessons add column if not exists video_file_name text not null default '';
    alter table app_training_lessons add column if not exists video_mime_type text not null default 'video/mp4';
    alter table app_training_lessons add column if not exists video_data_url text;
    alter table app_training_lessons add column if not exists status text not null default 'published';
    alter table app_training_lessons add column if not exists created_by uuid references app_users(id) on delete set null;
    alter table app_training_lessons add column if not exists created_at timestamptz not null default now();
    alter table app_training_lessons add column if not exists updated_at timestamptz not null default now();

    create index if not exists app_training_lessons_visibility_idx
      on app_training_lessons (unit_id, status, trail, order_index);

    create table if not exists app_training_progress (
      lesson_id uuid not null references app_training_lessons(id) on delete cascade,
      user_id uuid not null references app_users(id) on delete cascade,
      completed_at timestamptz not null default now(),
      primary key (lesson_id, user_id)
    );

    create index if not exists app_training_progress_user_idx
      on app_training_progress (user_id, completed_at desc);
  `)
    .then(() => undefined)
    .catch((error) => {
      trainingSchemaPromise = null;
      throw error;
    });

  return trainingSchemaPromise;
}

function readString(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isTrainingTrail(value: unknown): value is TrainingTrailId {
  return typeof value === "string" && TRAINING_TRAILS.some((trail) => trail.id === value);
}

function isVideoSource(value: unknown): value is TrainingVideoSource {
  return value === "upload" || value === "url";
}

function getFile(value: FormDataEntryValue | null) {
  return typeof File !== "undefined" && value instanceof File ? value : null;
}

function assertManageTraining(session: AuthSession) {
  return canManageTraining(session.user.role);
}

function getRequestedUnit(session: AuthSession, unitId: unknown) {
  return getUnitFromBody(session, unitId);
}

function mapLesson(row: TrainingLessonRow): TrainingLesson {
  return {
    id: row.id,
    unitId: row.unit_id,
    scope: row.unit_id ? "unit" : "global",
    trail: row.trail,
    title: row.title,
    description: row.description,
    durationLabel: row.duration_label,
    orderIndex: row.order_index,
    thumbnailDataUrl: row.thumbnail_data_url,
    videoSource: row.video_source,
    videoUrl: row.video_url,
    videoFileName: row.video_file_name,
    videoMimeType: row.video_mime_type,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function fileToDataUrl(file: File, maxSize: number, acceptedPrefix: string) {
  if (!file.type.startsWith(acceptedPrefix) || file.size <= 0 || file.size > maxSize) {
    return null;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

function normalizeVideoUrl(value: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeMediaReference(value: string) {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:image/")) {
    return value;
  }

  return normalizeVideoUrl(value) || null;
}

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

async function listLessons(unit: UnitSummary, userId: string, role: UserRole) {
  const result = await queryDb<TrainingLessonRow>(
    `
      select
        l.id,
        l.unit_id,
        l.trail,
        l.title,
        l.description,
        l.duration_label,
        l.order_index,
        l.thumbnail_data_url,
        l.video_source,
        l.video_url,
        l.video_file_name,
        l.video_mime_type,
        u.name as created_by_name,
        l.created_at::text,
        p.completed_at::text
      from app_training_lessons l
      left join app_users u on u.id = l.created_by
      left join app_training_progress p on p.lesson_id = l.id and p.user_id = $2
      where l.status = 'published'
        and (l.unit_id is null or l.unit_id = $1)
        and ($3::boolean or l.trail <> 'lideranca')
      order by
        array_position(array['plataforma','vendas','escola','lideranca'], l.trail),
        l.order_index asc,
        l.created_at desc
    `,
    [unit.id, userId, canViewLeadershipTraining(role)],
  );

  return result.rows.map(mapLesson);
}

async function assertLessonVisible(id: string, unit: UnitSummary, role: UserRole) {
  const result = await queryDb<{ id: string } & QueryResultRow>(
    `
      select id
      from app_training_lessons
      where id = $1
        and status = 'published'
        and (unit_id is null or unit_id = $2)
        and ($3::boolean or trail <> 'lideranca')
      limit 1
    `,
    [id, unit.id, canViewLeadershipTraining(role)],
  );

  return Boolean(result.rows[0]);
}

async function insertLesson(input: TrainingLessonInput, session: AuthSession) {
  const result = await queryDb<TrainingLessonRow>(
    `
      insert into app_training_lessons (
        unit_id,
        trail,
        title,
        description,
        duration_label,
        order_index,
        thumbnail_data_url,
        video_source,
        video_url,
        video_file_name,
        video_mime_type,
        video_data_url,
        created_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, nullif($9, ''), $10, $11, $12, $13)
      returning
        id,
        unit_id,
        trail,
        title,
        description,
        duration_label,
        order_index,
        thumbnail_data_url,
        video_source,
        video_url,
        video_file_name,
        video_mime_type,
        $14::text as created_by_name,
        created_at::text,
        null::text as completed_at
    `,
    [
      input.unitId,
      input.trail,
      input.title,
      input.description,
      input.durationLabel,
      input.orderIndex,
      input.thumbnailDataUrl,
      input.videoSource,
      input.videoUrl,
      input.videoFileName,
      input.videoMimeType,
      input.videoDataUrl,
      session.user.id,
      session.user.name,
    ],
  );

  return mapLesson(result.rows[0]);
}

export const Route = createFileRoute("/api/training")({
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

        await ensureTrainingSchema();

        const lessons = await listLessons(unit, session.user.id, session.user.role);
        const completedLessons = lessons.filter((lesson) => lesson.completedAt).length;

        return Response.json(
          {
            lessons,
            summary: {
              totalLessons: lessons.length,
              completedLessons,
              progressPercent: lessons.length
                ? Math.round((completedLessons / lessons.length) * 100)
                : 0,
            },
            canManage: canManageTraining(session.user.role),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!assertManageTraining(session)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        let input: TrainingLessonInput;

        if (isJsonRequest(request)) {
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

          if (!body) {
            return Response.json({ ok: false, error: "Envio inválido." }, { status: 400 });
          }

          const requestedUnit = getRequestedUnit(session, body.unitId);
          const scope: TrainingLessonScope = body.scope === "unit" ? "unit" : "global";
          const title = readString(body.title, MAX_TITLE_LENGTH);
          const description = readString(body.description);
          const durationLabel = readString(body.durationLabel, 40);
          const orderIndex = Number.parseInt(readString(body.orderIndex, 12), 10) || 0;
          const trail = isTrainingTrail(body.trail) ? body.trail : "plataforma";
          const videoUrl = normalizeVideoUrl(readString(body.videoUrl, MAX_MEDIA_URL_LENGTH));
          const thumbnailDataUrl = normalizeMediaReference(
            readString(body.thumbnailDataUrl ?? body.thumbnailUrl, MAX_MEDIA_URL_LENGTH),
          );

          if (scope === "unit" && !requestedUnit) {
            return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
          }

          if (!title || !description || !durationLabel) {
            return Response.json(
              { ok: false, error: "Preencha título, descrição e duração." },
              { status: 400 },
            );
          }

          if (!videoUrl) {
            return Response.json(
              { ok: false, error: "Informe uma URL HTTPS direta do vídeo." },
              { status: 400 },
            );
          }

          input = {
            unitId: scope === "unit" ? (requestedUnit?.id ?? null) : null,
            trail,
            title,
            description,
            durationLabel,
            orderIndex,
            thumbnailDataUrl,
            videoSource: "url",
            videoUrl,
            videoFileName: readString(body.videoFileName, 240) || "video-url",
            videoMimeType: readString(body.videoMimeType, 120) || "video/mp4",
            videoDataUrl: null,
          };
        } else {
          const form = await request.formData().catch(() => null);

          if (!form) {
            return Response.json({ ok: false, error: "Envio inválido." }, { status: 400 });
          }

          const requestedUnit = getRequestedUnit(session, form.get("unitId"));
          const scope: TrainingLessonScope = form.get("scope") === "unit" ? "unit" : "global";
          const unitId = scope === "unit" ? (requestedUnit?.id ?? null) : null;
          const title = readString(form.get("title"), MAX_TITLE_LENGTH);
          const description = readString(form.get("description"));
          const durationLabel = readString(form.get("durationLabel"), 40);
          const orderIndex = Number.parseInt(readString(form.get("orderIndex"), 12), 10) || 0;
          const trailValue = form.get("trail");
          const trail: TrainingTrailId = isTrainingTrail(trailValue) ? trailValue : "plataforma";
          const videoSourceValue = form.get("videoSource");
          const videoSource: TrainingVideoSource = isVideoSource(videoSourceValue)
            ? videoSourceValue
            : "upload";
          const videoFile = getFile(form.get("video"));
          const thumbnailFile = getFile(form.get("thumbnail"));
          const videoUrl = normalizeVideoUrl(readString(form.get("videoUrl"), 1000));

          if (scope === "unit" && !requestedUnit) {
            return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
          }

          if (!title || !description || !durationLabel) {
            return Response.json(
              { ok: false, error: "Preencha título, descrição e duração." },
              { status: 400 },
            );
          }

          let videoDataUrl: string | null = null;
          let videoFileName = "";
          let videoMimeType = "video/mp4";

          if (videoSource === "upload") {
            if (!videoFile) {
              return Response.json({ ok: false, error: "Envie um vídeo válido." }, { status: 400 });
            }

            videoDataUrl = await fileToDataUrl(videoFile, MAX_VIDEO_FILE_SIZE, "video/");

            if (!videoDataUrl) {
              return Response.json(
                { ok: false, error: "O vídeo precisa ser MP4/WebM e ter até 60 MB." },
                { status: 400 },
              );
            }

            videoFileName = videoFile.name;
            videoMimeType = videoFile.type || "video/mp4";
          } else {
            if (!videoUrl) {
              return Response.json(
                { ok: false, error: "Informe uma URL HTTPS direta do vídeo." },
                { status: 400 },
              );
            }

            videoFileName = "video-url";
            videoMimeType = "video/mp4";
          }

          let thumbnailDataUrl: string | null = null;

          if (thumbnailFile) {
            thumbnailDataUrl = await fileToDataUrl(
              thumbnailFile,
              MAX_THUMBNAIL_FILE_SIZE,
              "image/",
            );

            if (!thumbnailDataUrl) {
              return Response.json(
                { ok: false, error: "A capa precisa ser uma imagem de até 6 MB." },
                { status: 400 },
              );
            }
          }

          input = {
            unitId,
            trail,
            title,
            description,
            durationLabel,
            orderIndex,
            thumbnailDataUrl,
            videoSource,
            videoUrl,
            videoFileName,
            videoMimeType,
            videoDataUrl,
          };
        }

        await ensureTrainingSchema();

        const lesson = await insertLesson(input, session);

        return Response.json({ lesson }, { status: 201 });
      },
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as {
          action?: unknown;
          unitId?: unknown;
          lessonId?: unknown;
          completed?: unknown;
          title?: unknown;
          description?: unknown;
          durationLabel?: unknown;
          orderIndex?: unknown;
          trail?: unknown;
          scope?: unknown;
        } | null;
        const lessonId = readString(body?.lessonId, 80);

        if (!lessonId) {
          return Response.json({ ok: false, error: "Aula inválida." }, { status: 400 });
        }

        await ensureTrainingSchema();

        if (body?.action === "updateLesson") {
          if (!assertManageTraining(session)) {
            return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
          }

          const requestedUnit = getRequestedUnit(session, body.unitId);
          const scope: TrainingLessonScope = body.scope === "unit" ? "unit" : "global";
          const title = readString(body.title, MAX_TITLE_LENGTH);
          const description = readString(body.description);
          const durationLabel = readString(body.durationLabel, 40);
          const orderIndex = Math.max(0, Number.parseInt(readString(body.orderIndex, 12), 10) || 0);
          const trail = isTrainingTrail(body.trail) ? body.trail : "plataforma";

          if (scope === "unit" && !requestedUnit) {
            return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
          }

          if (!title || !description || !durationLabel) {
            return Response.json(
              { ok: false, error: "Preencha título, descrição e duração." },
              { status: 400 },
            );
          }

          const updated = await queryDb<{ id: string } & QueryResultRow>(
            `
              update app_training_lessons
              set unit_id = $2,
                  trail = $3,
                  title = $4,
                  description = $5,
                  duration_label = $6,
                  order_index = $7,
                  updated_at = now()
              where id = $1 and status = 'published'
              returning id
            `,
            [
              lessonId,
              scope === "unit" ? (requestedUnit?.id ?? null) : null,
              trail,
              title,
              description,
              durationLabel,
              orderIndex,
            ],
          );

          if (!updated.rows[0]) {
            return Response.json({ ok: false, error: "Aula não encontrada." }, { status: 404 });
          }

          const unit = requestedUnit ?? session.activeUnit;

          if (!unit) {
            return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
          }

          const lessons = await listLessons(unit, session.user.id, session.user.role);
          const completedLessons = lessons.filter((lesson) => lesson.completedAt).length;

          return Response.json({
            lesson: lessons.find((lesson) => lesson.id === lessonId) ?? null,
            lessons,
            summary: {
              totalLessons: lessons.length,
              completedLessons,
              progressPercent: lessons.length
                ? Math.round((completedLessons / lessons.length) * 100)
                : 0,
            },
          });
        }

        const unit = getUnitFromBody(session, body?.unitId);
        const completed = body?.completed !== false;

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!(await assertLessonVisible(lessonId, unit, session.user.role))) {
          return Response.json({ ok: false, error: "Aula não encontrada." }, { status: 404 });
        }

        if (completed) {
          await queryDb(
            `
              insert into app_training_progress (lesson_id, user_id)
              values ($1, $2)
              on conflict (lesson_id, user_id) do update set completed_at = now()
            `,
            [lessonId, session.user.id],
          );
        } else {
          await queryDb(
            `
              delete from app_training_progress
              where lesson_id = $1 and user_id = $2
            `,
            [lessonId, session.user.id],
          );
        }

        const lessons = await listLessons(unit, session.user.id, session.user.role);
        const completedLessons = lessons.filter((lesson) => lesson.completedAt).length;

        return Response.json({
          lessons,
          summary: {
            totalLessons: lessons.length,
            completedLessons,
            progressPercent: lessons.length
              ? Math.round((completedLessons / lessons.length) * 100)
              : 0,
          },
        });
      },
      DELETE: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        if (!assertManageTraining(session)) {
          return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });
        }

        const body = (await request.json().catch(() => null)) as {
          lessonId?: unknown;
        } | null;
        const lessonId = readString(body?.lessonId, 80);

        if (!lessonId) {
          return Response.json({ ok: false, error: "Aula inválida." }, { status: 400 });
        }

        await ensureTrainingSchema();
        await queryDb(
          `
            update app_training_lessons
            set status = 'archived',
                updated_at = now()
            where id = $1
          `,
          [lessonId],
        );

        return Response.json({ ok: true });
      },
    },
  },
});
