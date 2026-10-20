import type { ConsultantPipelineScope, LeadRecord } from "./commercial-types.ts";
import { leadMatchesConsultantScope } from "./commercial-types.ts";
import { leadDateFilterValue, parseLeadDate } from "./lead-time.ts";

export const PIPELINE_FILTER_ALL = "__all__";

export type PipelineFilters = {
  attendanceId: string;
  courseId: string;
  channelId: string;
  ownerId: string;
  city: string;
  startDate: string;
  endDate: string;
};

export function emptyPipelineFilters(): PipelineFilters {
  return {
    attendanceId: PIPELINE_FILTER_ALL,
    courseId: PIPELINE_FILTER_ALL,
    channelId: PIPELINE_FILTER_ALL,
    ownerId: PIPELINE_FILTER_ALL,
    city: PIPELINE_FILTER_ALL,
    startDate: "",
    endDate: "",
  };
}

export function countActivePipelineFilters(
  filters: PipelineFilters,
  canViewAcquisitionChannel: boolean,
) {
  return (
    [filters.attendanceId, filters.courseId, filters.ownerId, filters.city].filter(
      (value) => value !== PIPELINE_FILTER_ALL,
    ).length +
    (canViewAcquisitionChannel && filters.channelId !== PIPELINE_FILTER_ALL ? 1 : 0) +
    (filters.startDate || filters.endDate ? 1 : 0)
  );
}

export function filterPipelineLeads(
  leads: Array<LeadRecord>,
  filters: PipelineFilters,
  context: {
    search: string;
    consultantId?: string;
    consultantScope: ConsultantPipelineScope;
    canViewAcquisitionChannel: boolean;
  },
) {
  const query = context.search.trim().toLowerCase();
  return leads.filter((lead) => {
    if (
      context.consultantId !== undefined &&
      !leadMatchesConsultantScope(lead, context.consultantId, context.consultantScope)
    )
      return false;

    if (
      (filters.attendanceId !== PIPELINE_FILTER_ALL &&
        lead.attendanceId !== filters.attendanceId) ||
      (filters.courseId !== PIPELINE_FILTER_ALL && lead.courseId !== filters.courseId) ||
      // The API redacts acquisition data for consultants. A hidden/stale filter must not reject every lead.
      (context.canViewAcquisitionChannel &&
        filters.channelId !== PIPELINE_FILTER_ALL &&
        lead.acquisitionChannelId !== filters.channelId) ||
      (filters.ownerId !== PIPELINE_FILTER_ALL && lead.createdById !== filters.ownerId) ||
      (filters.city !== PIPELINE_FILTER_ALL && lead.city !== filters.city)
    )
      return false;

    if (filters.startDate || filters.endDate) {
      const date = parseLeadDate(lead.createdAt);
      if (Number.isNaN(date.getTime())) return false;
      const day = leadDateFilterValue(date);
      if (
        (filters.startDate && day < filters.startDate) ||
        (filters.endDate && day > filters.endDate)
      )
        return false;
    }

    return (
      !query ||
      [
        lead.fullName,
        lead.phone,
        lead.phone2,
        lead.email,
        lead.city,
        lead.attendanceName,
        lead.courseName,
        lead.acquisitionChannelName,
        lead.createdByName,
        lead.unitName,
        lead.stage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  });
}
