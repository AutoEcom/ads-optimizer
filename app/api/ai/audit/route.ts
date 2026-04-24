import { NextResponse } from "next/server";

import { createHealthAudit } from "@/lib/claude";
import { CampaignMetrics } from "@/types";

type AuditBody = {
  campaign?: CampaignMetrics;
  campaigns?: CampaignMetrics[];
  targetCpa?: number;
  targetRoas?: number;
  businessContext?: string;
};

export async function POST(request: Request) {
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

  return NextResponse.json({
    campaignId: body.campaign?.id,
    ...result
  });
}
