import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import {
  canViewAllUnitLeads,
  canViewAllUnitPipelineLeads,
  canViewStudents,
} from "@/lib/auth-types";
import { getSessionFromRequest } from "@/lib/server/auth";
import { getUnitFromRequest } from "@/lib/server/commercial-schema";
import { queryDb } from "@/lib/server/db";

type DashboardStatsRow = QueryResultRow & {
  open_leads: string;
  qualified_leads: string;
  students: string;
  pipeline_value: string;
};

type PipelineColumnRow = QueryResultRow & {
  id: string;
  unit_id: string;
  name: string;
  color: string;
  position: number;
  system_key: string | null;
  semantic_stage: string | null;
};

type StageBucketRow = QueryResultRow & {
  pipeline_column_id: string | null;
  stage: string;
  count: string;
};

type RecentLeadRow = QueryResultRow & {
  id: string;
  full_name: string;
  phone: string;
  course_name: string | null;
  stage: string;
  pipeline_column_id: string | null;
  created_at: string;
};

export const Route = createFileRoute("/api/crm/dashboard")({
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

        const canViewPipeline = canViewAllUnitPipelineLeads(session.user.role);
        const canSeeStudents = canViewStudents(session.user.role);
        const canViewAllStudents = canViewAllUnitLeads(session.user.role);
        const accessParams = [
          unit.id,
          session.user.id,
          canViewPipeline,
          canSeeStudents,
          canViewAllStudents,
        ] as const;

        const [stats, columns, buckets, recent] = await Promise.all([
          queryDb<DashboardStatsRow>(
            `
              select
                count(*) filter (
                  where l.stage <> 'Matriculado'
                    and ($3::boolean or l.created_by = $2 or l.shared_queue = true)
                )::text as open_leads,
                count(*) filter (
                  where l.stage in ('Qualificado', 'Proposta', 'Pagamento pendente', 'Confirmado')
                    and ($3::boolean or l.created_by = $2 or l.shared_queue = true)
                )::text as qualified_leads,
                count(*) filter (
                  where l.stage = 'Matriculado'
                    and $4::boolean
                    and ($5::boolean or l.created_by = $2)
                )::text as students,
                coalesce(sum(l.course_value_snapshot) filter (
                  where l.stage <> 'Matriculado'
                    and ($3::boolean or l.created_by = $2 or l.shared_queue = true)
                ), 0)::text as pipeline_value
              from app_leads l
              where l.unit_id = $1
            `,
            accessParams,
          ),
          queryDb<PipelineColumnRow>(
            `
              select id, unit_id, name, color, position, system_key, semantic_stage
              from app_pipeline_columns
              where unit_id = $1 and pipeline_type = 'leads'
              order by position, created_at, name
            `,
            [unit.id],
          ),
          queryDb<StageBucketRow>(
            `
              select l.pipeline_column_id, l.stage, count(*)::text as count
              from app_leads l
              where l.unit_id = $1
                and l.stage <> 'Matriculado'
                and ($3::boolean or l.created_by = $2 or l.shared_queue = true)
              group by l.pipeline_column_id, l.stage
            `,
            [unit.id, session.user.id, canViewPipeline],
          ),
          queryDb<RecentLeadRow>(
            `
              select id, full_name, phone, course_name_snapshot as course_name,
                stage, pipeline_column_id, created_at::text
              from app_leads l
              where l.unit_id = $1
                and l.stage <> 'Matriculado'
                and ($3::boolean or l.created_by = $2 or l.shared_queue = true)
              order by l.created_at desc
              limit 6
            `,
            [unit.id, session.user.id, canViewPipeline],
          ),
        ]);

        const row = stats.rows[0];
        return Response.json(
          {
            stats: {
              openLeads: Number(row?.open_leads ?? 0),
              qualifiedLeads: Number(row?.qualified_leads ?? 0),
              students: Number(row?.students ?? 0),
              pipelineValue: Number(row?.pipeline_value ?? 0),
            },
            pipelineColumns: columns.rows.map((column) => ({
              id: column.id,
              unitId: column.unit_id,
              pipelineType: "leads" as const,
              name: column.name,
              color: column.color,
              position: Number(column.position),
              systemKey: column.system_key,
              semanticStage: column.semantic_stage,
            })),
            stageBuckets: buckets.rows.map((bucket) => ({
              pipelineColumnId: bucket.pipeline_column_id,
              stage: bucket.stage,
              count: Number(bucket.count),
            })),
            recentLeads: recent.rows.map((lead) => ({
              id: lead.id,
              unitId: unit.id,
              fullName: lead.full_name,
              phone: lead.phone,
              courseName: lead.course_name,
              stage: lead.stage,
              pipelineColumnId: lead.pipeline_column_id,
              createdAt: lead.created_at,
            })),
          },
          { headers: { "Cache-Control": "private, no-cache" } },
        );
      },
    },
  },
});
