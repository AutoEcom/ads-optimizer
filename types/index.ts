export type Platform = "Meta" | "Google";

/** За Meta: доминираща мрежа по разход (insights breakdown publisher_platform). */
export type MetaPlacement = "facebook" | "instagram" | "mixed" | "other";

export type CampaignMetrics = {
  id: string;
  platform: Platform;
  campaignName: string;
  currencyCode: string;
  spend: number;
  /** Meta: дневен бюджет в основна валута на акаунта (от Graph `daily_budget` / 100). */
  dailyBudgetMajor?: number;
  /** Meta / Google: статус на кампанията от платформата (напр. PAUSED, ACTIVE). */
  campaignStatus?: string;
  conversions: number;
  cpa: number;
  roas: number;
  ctr: number;
  impressions: number;
  /** Среден CPC в основна валута (от insights или spend/clicks). */
  cpcMajor?: number;
  /** CPM в основна валута: spend / impressions * 1000. */
  cpmMajor?: number;
  /** Meta insights `last_7_days` — frequency за audience health (без дневен шум). */
  last7DaysFrequency?: number;
  /** Meta insights `last_7_days` — CPM в основна валута. */
  last7DaysCpm?: number;
  frequency?: number;
  impressionShare?: number;
  searchTerms?: string[];
  targetCpa: number;
  metaPlacement?: MetaPlacement;
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
  /** Връща се от /api/ai/audit след успешен одит. */
  creditsBalance?: number;
};

export type ExecutableMetaToolName = "adjust_budget" | "pause_campaign" | "rename_campaign";

/** Meta MCP: изпълним инструмент, върнат от Claude под поле `executable_tool`. */
export type ExecutableMetaTool = {
  name: ExecutableMetaToolName;
  parameters: {
    campaign_id: string;
    [key: string]: unknown;
  };
  /** Защо AI препоръчва извикване на инструмента. */
  explanation: string;
};

export type PrioritizedAction = {
  task: string;
  impactScore: number;
  reason: string;
  platform: Platform | "Общо";
  /** Наследено от кампанията (Meta placement), за икони в UI. */
  metaPlacement?: MetaPlacement;
  campaignId?: string;
  actionType?: "PAUSE" | "ACTIVATE";
  type?: SkillType;
  isKillRule?: boolean;
  /** Когато препоръката съвпада с Meta MCP инструмент — пази се в ai_strategy_cache.priority_actions. */
  executable_tool?: ExecutableMetaTool;
  /** Опционално от AI одит за по-точен UI (иначе се ползва кампанията). */
  currentCpa?: number;
  targetCpa?: number;
  /**
   * `engagement` — препоръката е водена от CTR/CPC/frequency/CPM (leading indicators).
   * `conversion` — базирана главно на CPA/ROAS/конверсии.
   */
  insightBasis?: "engagement" | "conversion";
  /** UI: изпълнение без Meta MCP (напр. пренасочване към креатив генератор). */
  executable?: boolean;
  /** UI шаблон за primary бутон. */
  actionUiTemplate?: "redirect_creative";
  /** Текст за query `context` при redirect_creative (обикновено обобщение на препоръката). */
  recommendation?: string;
  /** Име на кампания за query параметри, ако липсва live обект в клиента. */
  campaignName?: string;
};

/** Виртуална група от ≥3 препоръки с един и същ `type` (виж `groupActionsByType`). */
export type PrioritizedActionGroup = {
  isGroup: true;
  type: SkillType;
  children: PrioritizedAction[];
};

export type PrioritizedActionListItem = PrioritizedAction | PrioritizedActionGroup;

export type SkillType =
  | "SCALING_STRATEGY"
  | "BUDGET_SUFFICIENCY"
  | "CREATIVE_FATIGUE"
  | "AD_COPY_RELEVANCE"
  | "AUDIENCE_BUILDER"
  | "AUDIENCE_SIGNALS"
  | "EVENT_MATCH_QUALITY"
  | "NEGATIVE_KEYWORD_GUARD"
  | "AUCTION_OVERLAP"
  | "BID_STRATEGY_AUDITOR"
  | "FUNNEL_ALIGNMENT"
  | "KEYWORD_MINING";

export type KillListItem = {
  campaignId: string;
  campaignName: string;
  platform: Platform;
  metaPlacement?: MetaPlacement;
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
  /** Баланс кредити (AI одит, генерация, Meta публикуване). */
  creditsBalance?: number;
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
