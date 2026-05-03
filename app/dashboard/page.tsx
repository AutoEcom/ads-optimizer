import { DashboardPage } from "@/components/dashboard/dashboard-page";

/** Клиентският `DashboardPage` синхронизира връзките: Supabase Realtime върху `ad_platform_tokens` + SWR mutate. */
export default function DashboardRoute() {
  return <DashboardPage />;
}
