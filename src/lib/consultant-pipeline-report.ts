import type { LeadStage, PipelineColumn } from "./commercial-types.ts";
import { resolveLeadPipelineColumn } from "./pipeline-configuration.ts";

export type PipelineCountGroup = {
  owner_id: string | null;
  shared_queue: boolean;
  pipeline_column_id: string | null;
  stage: LeadStage;
  total: string | number;
  period_total: string | number;
};
export type PipelineCounts = { current: Record<string, number>; period: Record<string, number> };
export function summarizeConsultantPipeline(unitId: string, columns: PipelineColumn[], groups: PipelineCountGroup[], consultantIds: string[]) {
  const empty = (): PipelineCounts => ({current: Object.fromEntries(columns.map(c=>[c.id,0])),period: Object.fromEntries(columns.map(c=>[c.id,0]))});
  const consultants = new Map(consultantIds.map(id=>[id,empty()]));
  const shared = empty();
  const other = empty();
  for (const group of groups) {
    const column = resolveLeadPipelineColumn({unitId,stage:group.stage,pipelineColumnId:group.pipeline_column_id},columns);
    if (!column) continue;
    const counts = group.shared_queue ? shared : consultants.get(group.owner_id ?? "") ?? other;
    counts.current[column.id] += Number(group.total);
    counts.period[column.id] += Number(group.period_total);
  }
  return {consultants,shared,other};
}
