import { NextResponse } from "next/server";

import { createAdVariations } from "@/lib/claude";
import { addCredits, CREDIT_COSTS, deductCredits, getCreditsBalance } from "@/lib/credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GenerateBody = {
  productDescription: string;
  currentAd?: { headline?: string; bodyText?: string };
  optimizationReason?: string;
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

  const body = (await request.json()) as GenerateBody;
  const productDescription = String(body.productDescription ?? "");
  const optimizationReason =
    typeof body.optimizationReason === "string" ? body.optimizationReason.trim() : "";
  const currentAdRaw = body.currentAd;
  const currentAd =
    currentAdRaw &&
    (typeof currentAdRaw.headline === "string" || typeof currentAdRaw.bodyText === "string")
      ? {
          headline: String(currentAdRaw.headline ?? "").trim(),
          bodyText: String(currentAdRaw.bodyText ?? "").trim()
        }
      : undefined;

  if (!productDescription.trim()) {
    return NextResponse.json({ error: "Липсва productDescription." }, { status: 400 });
  }

  const { balance } = await getCreditsBalance(supabase, user.id);
  if (balance < CREDIT_COSTS.AI_CREATIVE_GENERATION) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", creditsBalance: balance },
      { status: 402 }
    );
  }

  const deducted = await deductCredits(
    supabase,
    user.id,
    CREDIT_COSTS.AI_CREATIVE_GENERATION,
    "AI_CREATIVE_GENERATION"
  );
  if (!deducted.success) {
    const { balance: fresh } = await getCreditsBalance(supabase, user.id);
    return NextResponse.json(
      {
        error: "INSUFFICIENT_CREDITS",
        code: "INSUFFICIENT_CREDITS",
        creditsBalance: fresh,
        detail: deducted.error
      },
      { status: 402 }
    );
  }

  const creditsAfterDeduct = deducted.newBalance ?? balance - CREDIT_COSTS.AI_CREATIVE_GENERATION;

  try {
    const useStructured =
      Boolean(currentAd?.headline || currentAd?.bodyText || optimizationReason);
    const variants = await createAdVariations(
      useStructured
        ? {
            productDescription,
            ...(currentAd ? { currentAd } : {}),
            ...(optimizationReason ? { optimizationReason } : {})
          }
        : productDescription
    );
    return NextResponse.json(
      { variants, creditsBalance: creditsAfterDeduct },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  } catch (error) {
    await addCredits(supabase, user.id, CREDIT_COSTS.AI_CREATIVE_GENERATION);
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
