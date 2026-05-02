import { NextResponse } from "next/server";

import { createAdVariations } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GenerateBody = {
  productDescription: string;
  /** Client-side cache bust; ignored by модела */
  _nonce?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateBody;
  // Няма Supabase/read-through cache тук — резултатът винаги идва от createAdVariations().
  const { productDescription } = body;

  try {
    const variants = await createAdVariations(String(productDescription ?? ""));
    return NextResponse.json(variants, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0"
      }
    });
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
