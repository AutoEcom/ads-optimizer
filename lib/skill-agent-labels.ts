import type { SkillType } from "@/types";

/** UI: препоръка от leading indicators (CTR/CPC/frequency/CPM), не от продажби/ROAS. */
export const ENGAGEMENT_INSIGHT_LABEL = "Based on Engagement Trends";

/** Визуална тема за агент (Tailwind utility класове). */
export type SkillAgentVisualTheme = {
  /** Текст „Анализ от:“ + име */
  agentLineClass: string;
  /** Обвивка около икона до агента */
  iconWrapClass: string;
  /** Класове за иконата (lucide) */
  iconClass: string;
  /** Рамка + фон за секцията с reasoning (AI proposal) */
  proposalSectionClass: string;
};

const HEURISTIC_THEME: SkillAgentVisualTheme = {
  agentLineClass: "text-zinc-300",
  iconWrapClass: "rounded-lg border border-zinc-500/35 bg-zinc-500/10 p-1.5",
  iconClass: "h-4 w-4 text-zinc-200",
  proposalSectionClass: "rounded-lg border border-zinc-500/30 bg-zinc-500/[0.07] p-4 ring-1 ring-zinc-500/15"
};

const AMBER_BUDGET: SkillAgentVisualTheme = {
  agentLineClass: "text-amber-200",
  iconWrapClass: "rounded-lg border border-amber-500/40 bg-amber-500/15 p-1.5",
  iconClass: "h-4 w-4 text-amber-300",
  proposalSectionClass: "rounded-lg border border-amber-500/35 bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/20"
};

const PURPLE_CREATIVE: SkillAgentVisualTheme = {
  agentLineClass: "text-purple-200",
  iconWrapClass: "rounded-lg border border-purple-500/40 bg-purple-500/15 p-1.5",
  iconClass: "h-4 w-4 text-purple-300",
  proposalSectionClass: "rounded-lg border border-purple-500/35 bg-purple-500/[0.08] p-4 ring-1 ring-purple-500/20"
};

const EMERALD_PERFORMANCE: SkillAgentVisualTheme = {
  agentLineClass: "text-emerald-200",
  iconWrapClass: "rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-1.5",
  iconClass: "h-4 w-4 text-emerald-300",
  proposalSectionClass: "rounded-lg border border-emerald-500/35 bg-emerald-500/[0.08] p-4 ring-1 ring-emerald-500/20"
};

const BLUE_BIDDING: SkillAgentVisualTheme = {
  agentLineClass: "text-sky-200",
  iconWrapClass: "rounded-lg border border-sky-500/40 bg-sky-500/15 p-1.5",
  iconClass: "h-4 w-4 text-sky-300",
  proposalSectionClass: "rounded-lg border border-sky-500/35 bg-sky-500/[0.08] p-4 ring-1 ring-sky-500/20"
};

const SLATE_TECHNICAL: SkillAgentVisualTheme = {
  agentLineClass: "text-slate-200",
  iconWrapClass: "rounded-lg border border-slate-500/40 bg-slate-500/15 p-1.5",
  iconClass: "h-4 w-4 text-slate-300",
  proposalSectionClass: "rounded-lg border border-slate-500/35 bg-slate-500/[0.08] p-4 ring-1 ring-slate-500/20"
};

function themeForSkill(type: SkillType | undefined): SkillAgentVisualTheme {
  if (!type) return HEURISTIC_THEME;
  switch (type) {
    case "BUDGET_SUFFICIENCY":
      return AMBER_BUDGET;
    case "CREATIVE_FATIGUE":
    case "AD_COPY_RELEVANCE":
      return PURPLE_CREATIVE;
    case "SCALING_STRATEGY":
    case "FUNNEL_ALIGNMENT":
    case "AUDIENCE_BUILDER":
    case "AUDIENCE_SIGNALS":
      return EMERALD_PERFORMANCE;
    case "KEYWORD_MINING":
      return PURPLE_CREATIVE;
    case "BID_STRATEGY_AUDITOR":
    case "AUCTION_OVERLAP":
    case "NEGATIVE_KEYWORD_GUARD":
      return BLUE_BIDDING;
    case "EVENT_MATCH_QUALITY":
      return SLATE_TECHNICAL;
    default:
      return HEURISTIC_THEME;
  }
}

/** Име на субагента / слоя за UI (оркестрация). */
export function skillTypeToAgentLabel(type: SkillType | undefined): string {
  if (!type) return "Heuristic Audit Engine";
  const map: Record<SkillType, string> = {
    SCALING_STRATEGY: "Scaling Strategy Agent",
    BUDGET_SUFFICIENCY: "Budget Strategy Agent",
    CREATIVE_FATIGUE: "Creative Fatigue Agent",
    AD_COPY_RELEVANCE: "Ad Copy Relevance Agent",
    AUDIENCE_BUILDER: "Audience Builder Agent",
    AUDIENCE_SIGNALS: "Audience Signals Agent",
    EVENT_MATCH_QUALITY: "Event Match Quality Agent",
    NEGATIVE_KEYWORD_GUARD: "Negative Keyword Guard Agent",
    AUCTION_OVERLAP: "Auction Overlap Agent",
    BID_STRATEGY_AUDITOR: "Bid Strategy Auditor Agent",
    FUNNEL_ALIGNMENT: "Funnel Alignment Agent",
    KEYWORD_MINING: "Keyword Mining Agent"
  };
  return map[type];
}

/** Цветова тема за ред „Анализ от…“, икона и AI proposal блок. */
export function getSkillAgentVisualTheme(type: SkillType | undefined): SkillAgentVisualTheme {
  return themeForSkill(type);
}
