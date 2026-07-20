import type { UnitSummary } from "@/lib/auth-types";
import type { LeadStage } from "@/lib/commercial-types";

export type GrowthScope = {
  mode: "network" | "unit" | "individual";
  label: string;
  unit: UnitSummary | null;
};

export type GrowthMetrics = {
  leadsReceived: number;
  newLeads: number;
  qualifiedLeads: number;
  enrollments: number;
  proposals: number;
  pendingPayments: number;
  uncontactedLeads: number;
  overdueFollowUps: number;
  todayFollowUps: number;
  conversionRate: number;
  followUpRate: number;
  averageTicket: number;
  leadsWithSource: number;
  sourceConversionRate: number;
  activeChannels: number;
  paidChannels: number;
  revenue: number;
  confirmedRevenue: number;
  pipelinePotential: number;
  proposalPotential: number;
  pendingPaymentPotential: number;
  leadsWithoutCourseValue: number;
  metaLeads: number;
  campaignCount: number;
  averageFirstContactHours: number;
};

export type GrowthSourceMetric = {
  source: string;
  leads: number;
  enrollments: number;
  confirmedRevenue: number;
  pipelinePotential: number;
  conversionRate: number;
};

export type GrowthCourseMetric = {
  course: string;
  leads: number;
  enrollments: number;
  confirmedRevenue: number;
  pipelinePotential: number;
  conversionRate: number;
};

export type GrowthCityMetric = {
  city: string;
  leads: number;
  enrollments: number;
  conversionRate: number;
};

export type GrowthUnitMetric = {
  id: string;
  name: string;
  leads: number;
  enrollments: number;
  confirmedRevenue: number;
  pipelinePotential: number;
  conversionRate: number;
};

export type GrowthFunnelMetric = {
  stage: LeadStage;
  leads: number;
};

export type GrowthTrendMetric = {
  date: string;
  leads: number;
  enrollments: number;
};

export type GrowthCampaignMetric = {
  campaign: string;
  leads: number;
  enrollments: number;
  conversionRate: number;
};

export type GrowthConsultantMetric = {
  id: string;
  name: string;
  leads: number;
  qualifiedLeads: number;
  enrollments: number;
  proposals: number;
  pendingPayments: number;
  confirmedRevenue: number;
  pipelinePotential: number;
  conversionRate: number;
  followUpRate: number;
};

export type GrowthResponse = {
  scope: GrowthScope;
  availableUnits: Array<UnitSummary>;
  periodDays: number;
  metrics: GrowthMetrics;
  sources: Array<GrowthSourceMetric>;
  courses: Array<GrowthCourseMetric>;
  cities: Array<GrowthCityMetric>;
  units: Array<GrowthUnitMetric>;
  funnel: Array<GrowthFunnelMetric>;
  trend: Array<GrowthTrendMetric>;
  campaigns: Array<GrowthCampaignMetric>;
  consultants: Array<GrowthConsultantMetric>;
};
