import { NextResponse } from "next/server";

import { createAdVariations } from "@/lib/claude";

type GenerateBody = {
  productDescription: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateBody;
  const variants = await createAdVariations(body.productDescription);
  return NextResponse.json(variants);
}
