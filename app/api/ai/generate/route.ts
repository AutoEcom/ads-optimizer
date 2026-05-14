import { NextResponse } from "next/server";

import { createAdVariations } from "@/lib/claude";
import { CREDIT_COSTS, deductCredits, getCreditsBalance } from "@/lib/credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GenerateBody = {
  productDescription: string;
  /** Client-side cache bust; ignored by модела */
  _nonce?: number;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
  }

  const { balance } = await getCreditsBalance(supabase, user.id);
  if (balance < CREDIT_COSTS.AI_CREATIVE_GENERATION) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", creditsBalance: balance },
      { status: 402 }
    );
  }

  const body = (await request.json()) as GenerateBody;
  const { productDescription } = body;

  try {
    const variants = await createAdVariations(String(productDescription ?? ""));
    const deducted = await deductCredits(supabase, user.id, CREDIT_COSTS.AI_CREATIVE_GENERATION, "AI_CREATIVE_GENERATION");
    const creditsBalance = deducted.success ? deducted.newBalance ?? balance : balance;
    return NextResponse.json(
      { variants, creditsBalance },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестна грешка при AI генерацията.";
    return NextResponse.json(
      { error: message },
      {
        status: 502,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  }
}
