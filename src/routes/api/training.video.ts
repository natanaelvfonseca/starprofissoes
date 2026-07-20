import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import { canViewLeadershipTraining } from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromRequest } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";

type TrainingVideoRow = QueryResultRow & {
  id: string;
  video_file_name: string;
  video_mime_type: string;
  video_data_url: string | null;
  video_source: "upload" | "url";
  video_url: string | null;
};

function parseDataUrl(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function parseRange(range: string | null, size: number) {
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= size) {
    return null;
  }

  return { start, end };
}

export const Route = createFileRoute("/api/training/video")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const unit = getUnitFromRequest(session, request);
        const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";

        if (!unit) {
          return Response.json({ ok: false, error: "Unidade indisponível." }, { status: 403 });
        }

        if (!id) {
          return Response.json({ ok: false, error: "Vídeo inválido." }, { status: 400 });
        }

        const result = await queryDb<TrainingVideoRow>(
          `
            select
              id,
              video_file_name,
              video_mime_type,
              video_data_url,
              video_source,
              video_url
            from app_training_lessons
            where id = $1
              and status = 'published'
              and (unit_id is null or unit_id = $2)
              and ($3::boolean or trail <> 'lideranca')
            limit 1
          `,
          [id, unit.id, canViewLeadershipTraining(session.user.role)],
        );
        const video = result.rows[0];

        if (!video) {
          return Response.json({ ok: false, error: "Vídeo não encontrado." }, { status: 404 });
        }

        if (video.video_source === "url" && video.video_url) {
          return Response.redirect(video.video_url, 302);
        }

        const parsed = parseDataUrl(video.video_data_url);

        if (!parsed) {
          return Response.json({ ok: false, error: "Vídeo indisponível." }, { status: 404 });
        }

        const size = parsed.buffer.length;
        const range = parseRange(request.headers.get("range"), size);
        const headers = new Headers({
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
          "Content-Type": video.video_mime_type || parsed.mimeType,
          "Content-Disposition": `inline; filename="${video.video_file_name || "aula.mp4"}"`,
        });

        if (range) {
          const chunk = parsed.buffer.subarray(range.start, range.end + 1);

          headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
          headers.set("Content-Length", String(chunk.length));

          return new Response(chunk, { status: 206, headers });
        }

        headers.set("Content-Length", String(size));

        return new Response(parsed.buffer, { headers });
      },
    },
  },
});
