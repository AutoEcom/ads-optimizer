import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TEST_TOPUP = 50;

/** Safe test mode: локално `development` или сървърна променлива `ADS_DEV_CREDIT_FAUCET=1`. */
function devCreditFaucetEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ADS_DEV_CREDIT_FAUCET === "1";
}

/** Временно: +50 кредита за ръчно тестване на потока (без production по подразбиране). */
export async function POST() {
  if (!devCreditFaucetEnabled()) {
    return NextResponse.json({ error: "Dev faucet не е активен." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
  }

  const { data: row, error: selErr } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const cur = typeof row?.credits_balance === "number" ? row.credits_balance : 0;
  const next = cur + TEST_TOPUP;

  const { error: updErr } = await supabase.from("profiles").update({ credits_balance: next }).eq("id", user.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ creditsBalance: next, added: TEST_TOPUP });
}
