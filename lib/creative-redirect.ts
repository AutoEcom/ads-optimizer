import { getPrioritizedActionStableId } from "@/lib/prioritized-action-id";
import type { CampaignMetrics, PrioritizedAction } from "@/types";

/** Резолвира основната обява (шаблон) за кампанията преди преход към `/creative`. */
export async function fetchCampaignPrimaryAdId(campaignId: string): Promise<string | null> {
  const cid = campaignId.trim();
  if (!cid) return null;
  try {
    const q = new URLSearchParams();
    q.set("campaign_id", cid);
    const res = await fetch(`/api/meta/campaign-primary-ad?${q.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { adId?: string | number | null };
    if (j.adId == null) return null;
    const s = String(j.adId).trim();
    return s || null;
  } catch {
    return null;
  }
}

/** URL към `/creative` с контекст от препоръка (query се кодира през URLSearchParams). */
export function buildCreativePageHref(
  action: PrioritizedAction,
  campaign: CampaignMetrics | null,
  adId?: string | null
): string | null {
  const campaignId = (action.campaignId ?? "").trim();
  const recommendation = (action.recommendation ?? action.reason ?? "").trim();
  if (!campaignId || !recommendation) return null;
  const campaignName = (action.campaignName ?? campaign?.campaignName ?? "").trim();
  const q = new URLSearchParams();
  q.set("campaignId", campaignId);
  q.set("actionId", getPrioritizedActionStableId(action));
  // adId преди дългия `context` — иначе при много дълъг URL браузърът/навигацията може да отреже края и да изгуби adId.
  if (adId?.trim()) q.set("adId", adId.trim());
  if (campaignName) q.set("campaignName", campaignName);
  q.set("context", recommendation);
  return `/creative?${q.toString()}`;
}
