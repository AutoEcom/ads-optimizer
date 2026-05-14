import type { SupabaseClient } from "@supabase/supabase-js";

/** Разход на кредити по тип действие (архитектура — виж `profiles.credits_balance`). */
export const CREDIT_COSTS = {
  FULL_ACCOUNT_AUDIT: 1,
  AI_CREATIVE_GENERATION: 3,
  DIRECT_META_PUBLISH: 5
} as const;

export type CreditActionType = keyof typeof CREDIT_COSTS;

export async function getCreditsBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<{ balance: number; error?: string }> {
  const { data, error } = await supabase.from("profiles").select("credits_balance").eq("id", userId).maybeSingle();
  if (error) return { balance: 0, error: error.message };
  return { balance: typeof data?.credits_balance === "number" ? data.credits_balance : 0 };
}

/**
 * Намалява кредити при достатъчен баланс и записва ред в `credit_transactions`.
 * При състезание при concurrent updates връща `success: false` с `Insufficient credits`.
 */
export async function deductCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  actionType: string
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Invalid credit amount" };
  }

  const { data: row, error: selErr } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    return { success: false, error: selErr.message };
  }

  const current = typeof row?.credits_balance === "number" ? row.credits_balance : 0;
  if (current < amount) {
    return { success: false, error: "Insufficient credits" };
  }

  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update({ credits_balance: current - amount })
    .eq("id", userId)
    .eq("credits_balance", current)
    .select("credits_balance")
    .maybeSingle();

  if (updErr) {
    return { success: false, error: updErr.message };
  }
  if (updated?.credits_balance === undefined) {
    return { success: false, error: "Insufficient credits" };
  }

  const newBalance = updated.credits_balance;

  const { error: txErr } = await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    balance_after: newBalance,
    action_type: actionType
  });

  if (txErr) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: "credit_transaction_insert_failed",
        error: txErr.message,
        userId,
        actionType
      })
    );
  }

  return { success: true, newBalance };
}

/** Възстановяване на кредити при неуспешна операция след удръжка (напр. Meta грешка). */
export async function addCredits(supabase: SupabaseClient, userId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const { data: row } = await supabase.from("profiles").select("credits_balance").eq("id", userId).maybeSingle();
  const cur = typeof row?.credits_balance === "number" ? row.credits_balance : 0;
  await supabase.from("profiles").update({ credits_balance: cur + amount }).eq("id", userId);
}
