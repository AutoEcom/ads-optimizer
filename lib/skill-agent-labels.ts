import type { SkillType } from "@/types";

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
