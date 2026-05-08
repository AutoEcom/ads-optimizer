import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { attachMetaAuthToUrl, readMetaGraphFailureMessage } from "@/lib/meta-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const META_API_VERSION = process.env.META_MARKETING_API_VERSION ?? "v21.0";

type MetaAdAccountNode = {
  id?: string;
  account_id?: string;
  name?: string;
};

function normalizeToActId(rawId: string): string {
  const trimmed = rawId.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Няма активна сесия.", accounts: [] }, { status: 401 });
    }

    const tokenRow = await getAdPlatformTokenRow(supabase, user.id, "Meta");
    if (tokenRow.error || !tokenRow.accessToken) {
      return NextResponse.json({
        accounts: [],
        warning: "Няма активна Meta връзка. Свържете Facebook акаунт първо."
      });
    }

    const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`);
    url.searchParams.set("fields", "name,account_id,id");
    url.searchParams.set("limit", "200");
    attachMetaAuthToUrl(url, tokenRow.accessToken);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (res.status === 401) {
      return NextResponse.json(
        { error: "Връзката с Meta изтече. Моля, свържете се отново.", code: "TOKEN_EXPIRED", accounts: [] },
        { status: 401 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Неуспешно зареждане на рекламните акаунти: ${await readMetaGraphFailureMessage(res)}`, accounts: [] },
        { status: 422 }
      );
    }

    const payload = (await res.json()) as { data?: MetaAdAccountNode[] };
    const accounts = (payload.data ?? [])
      .map((item) => {
        const rawId = item.account_id ?? item.id ?? "";
        const actId = normalizeToActId(rawId);
        return {
          id: actId,
          name: item.name?.trim() || actId
        };
      })
      .filter((a) => a.id)
      .sort((a, b) => a.name.localeCompare(b.name, "bg"));

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("[api/settings/meta-adaccounts]", error);
    return NextResponse.json(
      { error: "Временен проблем при зареждане на Meta акаунтите.", accounts: [] },
      { status: 500 }
    );
  }
}
