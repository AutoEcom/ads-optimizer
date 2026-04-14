import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { campaigns } from "@/services/mock-data";
import { DailySnapshot } from "@/types";

export type DigestTrend = {
  spendYesterday: number;
  campaignsToFix: number;
  cpaDeltaPercent: number | null;
  topMessage: string;
};

export async function getDigestTrend(): Promise<DigestTrend> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return buildFallbackDigest();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return buildFallbackDigest();

  const { data, error } = await supabase
    .from("daily_snapshots")
    .select(
      "id,user_id,snapshot_date,total_spend,total_conversions,avg_cpa,avg_roas,campaign_count,campaigns_with_issues"
    )
    .eq("user_id", user.id)
    .order("snapshot_date", { ascending: false })
    .limit(2);

  if (error || !data || data.length === 0) {
    return buildFallbackDigest();
  }

  const latest = mapSnapshot(data[0]);
  const previous = data[1] ? mapSnapshot(data[1]) : null;

  const cpaDeltaPercent =
    previous && previous.avgCpa > 0
      ? Number((((latest.avgCpa - previous.avgCpa) / previous.avgCpa) * 100).toFixed(1))
      : null;

  const trendText =
    cpaDeltaPercent === null
      ? "Липсва предходна снимка за тренд."
      : cpaDeltaPercent > 0
        ? `CPA се е вдигнал с ${cpaDeltaPercent}% спрямо вчера.`
        : `CPA е по-нисък с ${Math.abs(cpaDeltaPercent)}% спрямо вчера.`;

  return {
    spendYesterday: latest.totalSpend,
    campaignsToFix: latest.campaignsWithIssues,
    cpaDeltaPercent,
    topMessage: trendText
  };
}

function mapSnapshot(row: Record<string, unknown>): DailySnapshot {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    snapshotDate: String(row.snapshot_date),
    totalSpend: Number(row.total_spend),
    totalConversions: Number(row.total_conversions),
    avgCpa: Number(row.avg_cpa),
    avgRoas: Number(row.avg_roas),
    campaignCount: Number(row.campaign_count),
    campaignsWithIssues: Number(row.campaigns_with_issues)
  };
}

function buildFallbackDigest(): DigestTrend {
  const totalSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const totalConversions = campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const campaignsToFix = campaigns.filter(
    (campaign) => campaign.conversions === 0 || campaign.cpa > campaign.targetCpa
  ).length;

  return {
    spendYesterday: Number(totalSpend.toFixed(0)),
    campaignsToFix,
    cpaDeltaPercent: null,
    topMessage: `Имаш ${campaignsToFix} кампании за преглед днес.`
  };
}
