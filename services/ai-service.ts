import { AdVariation, AuditInsight, CampaignMetrics } from "@/types";

export async function runDeepAudit(
  campaign: CampaignMetrics,
  targetCpa = 20,
  targetRoas = 2.5
): Promise<AuditInsight> {
  const response = await fetch("/api/ai/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ campaign, targetCpa, targetRoas })
  });

  if (!response.ok) {
    throw new Error("Неуспешен AI одит.");
  }

  return (await response.json()) as AuditInsight;
}

export async function generateAdVariations(
  productDescription: string
): Promise<AdVariation[]> {
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ productDescription })
  });

  if (!response.ok) {
    throw new Error("Неуспешно генериране на рекламни варианти.");
  }

  return (await response.json()) as AdVariation[];
}
