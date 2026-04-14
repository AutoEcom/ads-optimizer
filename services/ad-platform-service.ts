import { campaigns } from "@/services/mock-data";

export async function fetchUnifiedCampaigns() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return campaigns;
}
