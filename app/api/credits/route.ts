import { NextResponse } from "next/server";

import { CREDIT_COSTS, getCreditsBalance } from "@/lib/credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
    }
    const { balance, error } = await getCreditsBalance(supabase, user.id);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({
      creditsBalance: balance,
      costs: { ...CREDIT_COSTS }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Грешка при кредити.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
