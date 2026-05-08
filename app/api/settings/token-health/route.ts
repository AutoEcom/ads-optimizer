import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Platform } from "@/types";

const META_API_VERSION = process.env.META_MARKETING_API_VERSION ?? "v21.0";

async function validateMetaToken(accessToken: string): Promise<boolean> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/me`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  return res.ok;
}

async function validateGoogleToken(accessToken: string): Promise<boolean> {
  const url = new URL("https://www.googleapis.com/oauth2/v3/tokeninfo");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  return res.ok;
}

export async function GET(request: Request) {
  try {
    const platform = new URL(request.url).searchParams.get("platform") as Platform | null;
    if (platform !== "Meta" && platform !== "Google") {
      return NextResponse.json({ ok: false, valid: false, error: "Невалидна платформа." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, valid: false, error: "Няма активна сесия." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ad_platform_tokens")
      .select("access_token,token_expires_at,is_active")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, valid: false, error: "Неуспешно зареждане на токена." }, { status: 500 });
    }
    if (!data?.is_active || !data.access_token) {
      return NextResponse.json({ ok: true, valid: false, expiresSoon: false });
    }

    const valid =
      platform === "Meta"
        ? await validateMetaToken(data.access_token)
        : await validateGoogleToken(data.access_token);

    let expiresSoon = false;
    if (data.token_expires_at) {
      const expiresAtMs = new Date(data.token_expires_at).getTime();
      if (Number.isFinite(expiresAtMs)) {
        expiresSoon = expiresAtMs - Date.now() < 10 * 60 * 1000;
      }
    }

    return NextResponse.json({ ok: true, valid, expiresSoon });
  } catch {
    return NextResponse.json({ ok: false, valid: false, error: "Временен проблем при проверка на токена." }, { status: 500 });
  }
}
