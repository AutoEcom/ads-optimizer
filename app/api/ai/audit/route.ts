import { NextResponse } from "next/server";

import { createCampaignAudit } from "@/lib/claude";
import { CampaignMetrics } from "@/types";

type AuditBody = {
  campaign: CampaignMetrics;
  targetCpa?: number;
  targetRoas?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as AuditBody;

  const bullets = await createCampaignAudit({
    campaign: body.campaign,
    targetCpa: body.targetCpa ?? 20,
    targetRoas: body.targetRoas ?? 2.5
  });

  return NextResponse.json({
    campaignId: body.campaign.id,
    bullets
  });
}
