import { NextResponse } from "next/server";

import { createHealthAudit } from "@/lib/claude";
import { CREDIT_COSTS, deductCredits, getCreditsBalance } from "@/lib/credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CampaignMetrics } from "@/types";

type AuditBody = {
  campaign?: CampaignMetrics;
  campaigns?: CampaignMetrics[];
  targetCpa?: number;
  targetRoas?: number;
  businessContext?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
  }

  const { balance } = await getCreditsBalance(supabase, user.id);
  if (balance < CREDIT_COSTS.FULL_ACCOUNT_AUDIT) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", creditsBalance: balance },
      { status: 402 }
    );
  }

  const body = (await request.json()) as AuditBody;
  const campaigns = body.campaigns ?? (body.campaign ? [body.campaign] : []);

  if (campaigns.length === 0) {
    return NextResponse.json({ error: "Липсват кампании за одит." }, { status: 400 });
  }

  const result = await createHealthAudit({
    campaigns,
    targetCpa: body.targetCpa ?? 20,
    targetRoas: body.targetRoas ?? 2.5,
    businessContext: body.businessContext
  });

  const deducted = await deductCredits(supabase, user.id, CREDIT_COSTS.FULL_ACCOUNT_AUDIT, "FULL_ACCOUNT_AUDIT");
  const creditsBalance = deducted.success ? deducted.newBalance ?? balance : balance;

  return NextResponse.json({
    campaignId: body.campaign?.id,
    creditsBalance,
    ...result
  });
}
