export type Platform = "Meta" | "Google";

export type CampaignMetrics = {
  id: string;
  platform: Platform;
  campaignName: string;
  currencyCode: string;
  spend: number;
  conversions: number;
  cpa: number;
  roas: number;
  ctr: number;
  impressions: number;
  frequency?: number;
  impressionShare?: number;
  targetCpa: number;
};

export type CriticalIssue = {
  id: string;
  severity: "Критично" | "Висок риск";
  title: string;
  description: string;
  platform: Platform;
  campaignId: string;
};

export type AlertRule = {
  id: string;
  name: string;
  metric: "CTR" | "CPA" | "ROAS" | "Разход";
  operator: "<" | ">" | "=";
  threshold: number;
  active: boolean;
};

export type MorningDigest = {
  spendYesterday: number;
  campaignsToFix: number;
  topMessage: string;
};

export type AuditInsight = {
  campaignId?: string;
  healthScore: number;
  prioritizedActions: PrioritizedAction[];
  killList: KillListItem[];
};

export type PrioritizedAction = {
  task: string;
  impactScore: number;
  reason: string;
  platform: Platform | "Общо";
  campaignId?: string;
  actionType?: "PAUSE" | "ACTIVATE";
};

export type KillListItem = {
  campaignId: string;
  campaignName: string;
  platform: Platform;
  cpa: number;
  targetCpa: number;
  spend: number;
  reason: string;
};

export type AdVariation = {
  headline: string;
  primaryText: string;
  hook: string;
};

export type UserProfile = {
  userId: string;
  targetCpa: number;
  targetRoas: number;
  businessName: string | null;
};

export type Profile = {
  id: string;
  email: string;
  fullName: string;
  subscriptionTier: "free" | "beta" | "pro";
  aiRequestsCount: number;
};

export type PlatformToken = {
  id: string;
  userId: string;
  platform: Platform;
  accessToken: string;
  adAccountId?: string | null;
  isActive: boolean;
  createdAt: string;
};

export type RuleSettings = {
  cpaAboveTargetEnabled: boolean;
  ctrBelowThresholdEnabled: boolean;
  ctrThreshold: number;
  targetCpaValue: number;
};

export type DailySnapshot = {
  id: string;
  userId: string;
  snapshotDate: string;
  totalSpend: number;
  totalConversions: number;
  avgCpa: number;
  avgRoas: number;
  campaignCount: number;
  campaignsWithIssues: number;
};
