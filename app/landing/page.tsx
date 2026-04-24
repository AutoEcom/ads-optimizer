import { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "AdGuard AI | AI Ads Manager за Meta и Google",
  description:
    "AI Ads Manager, който спира губещите кампании в Meta и Google Ads. Автоматизация за Google Ads и Meta Ads с фокус върху ROI.",
  keywords: ["AI Ads Manager", "Google Ads Automation", "Meta Ads AI", "PPC optimization", "AdGuard AI"]
};

export default function MarketingLandingRoute() {
  return <LandingPage />;
}
