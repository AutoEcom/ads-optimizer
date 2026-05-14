import type { CampaignMetrics, PrioritizedAction } from "@/types";

/** URL към `/creative` с контекст от препоръка (query се кодира през URLSearchParams). */
export function buildCreativePageHref(action: PrioritizedAction, campaign: CampaignMetrics | null): string | null {
  const campaignId = (action.campaignId ?? "").trim();
  const recommendation = (action.recommendation ?? action.reason ?? "").trim();
  if (!campaignId || !recommendation) return null;
  const campaignName = (action.campaignName ?? campaign?.campaignName ?? "").trim();
  const q = new URLSearchParams();
  q.set("campaignId", campaignId);
  q.set("context", recommendation);
  if (campaignName) q.set("campaignName", campaignName);
  return `/creative?${q.toString()}`;
}
