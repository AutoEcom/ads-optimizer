import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Profile } from "@/types";

export const PLAN_LIMITS: Record<Profile["subscriptionTier"], number> = {
  free: 20,
  beta: 20,
  pro: 999999
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, subscription_tier, ai_requests_count")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: data?.full_name ?? "",
    subscriptionTier: (data?.subscription_tier ?? "beta") as Profile["subscriptionTier"],
    aiRequestsCount: data?.ai_requests_count ?? 0
  };
}

export async function updateFullName(fullName: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Няма активна сесия.");

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: fullName.trim()
    },
    { onConflict: "id" }
  );

  if (error) throw error;
}
