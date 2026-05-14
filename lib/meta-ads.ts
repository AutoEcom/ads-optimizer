import { logAction } from "@/lib/logger";
import {
  attachMetaAuthToPayload,
  attachMetaAuthToUrl,
  fetchCampaignAdAccountId,
  metaPost,
  readMetaGraphFailureMessage
} from "@/lib/meta-api";

const META_API_VERSION = process.env.META_MARKETING_API_VERSION ?? "v21.0";

type MetaAdsetListRow = { id?: string; name?: string; status?: string; effective_status?: string };
type MetaAdListRow = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  creative?: { id?: string; object_story_spec?: Record<string, unknown> };
};

function normalizeActIdForPath(accountId: string): string {
  const t = accountId.trim();
  if (t.startsWith("act_")) return t;
  return `act_${t.replace(/^act_/, "")}`;
}

/** Клонира `object_story_spec` и подменя основния текст и заглавието (link или видео). */
function patchObjectStorySpec(
  spec: Record<string, unknown>,
  headline: string,
  bodyText: string
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
  const ld = next.link_data as Record<string, unknown> | undefined;
  if (ld && typeof ld === "object") {
    ld.message = bodyText;
    ld.name = headline;
  }
  const vd = next.video_data as Record<string, unknown> | undefined;
  if (vd && typeof vd === "object") {
    vd.title = headline;
    vd.message = bodyText;
  }
  return next;
}

/**
 * a) Активен Ad Set за кампанията.
 * b) Шаблон от съществуваща обява (`object_story_spec` — линк/видео, tracking остава в JSON).
 * c) Нов AdCreative + нова обява под същия Ad Set (PAUSED).
 */
export async function createAdVariant(
  accessToken: string,
  campaignId: string,
  headline: string,
  bodyText: string
): Promise<{ adId: string; creativeId: string; adSetId: string; sourceAdId: string }> {
  const cid = campaignId.trim();
  const h = headline.trim();
  const b = bodyText.trim();
  if (!cid) throw new Error("Липсва campaign_id.");
  if (!h || !b) throw new Error("Липсват заглавие или основен текст за обявата.");

  const { accountId, errorMessage } = await fetchCampaignAdAccountId(accessToken, cid);
  if (!accountId || errorMessage) {
    throw new Error(errorMessage ?? "Неуспешно определяне на рекламен акаунт за кампанията.");
  }
  const actPath = normalizeActIdForPath(accountId);

  const adsetsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${cid}/adsets`);
  adsetsUrl.searchParams.set("fields", "id,name,status,effective_status");
  adsetsUrl.searchParams.set("limit", "200");
  attachMetaAuthToUrl(adsetsUrl, accessToken);
  const adsetsRes = await fetch(adsetsUrl.toString(), { cache: "no-store" });
  if (adsetsRes.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!adsetsRes.ok) throw new Error(await readMetaGraphFailureMessage(adsetsRes));
  const adsetsPayload = (await adsetsRes.json()) as { data?: MetaAdsetListRow[] };
  const adsets = adsetsPayload.data ?? [];
  const activeAdset = adsets.find((a) => {
    const es = (a.effective_status ?? "").toUpperCase();
    const s = (a.status ?? "").toUpperCase();
    return es === "ACTIVE" || s === "ACTIVE";
  });
  if (!activeAdset?.id) {
    throw new Error("Няма активен Ad Set в тази кампания — не можем да клонираме структурата.");
  }
  const adSetId = activeAdset.id;

  const adsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${adSetId}/ads`);
  adsUrl.searchParams.set("fields", "id,name,status,effective_status,creative{id,object_story_spec}");
  adsUrl.searchParams.set("limit", "100");
  attachMetaAuthToUrl(adsUrl, accessToken);
  const adsRes = await fetch(adsUrl.toString(), { cache: "no-store" });
  if (adsRes.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!adsRes.ok) throw new Error(await readMetaGraphFailureMessage(adsRes));
  const adsPayload = (await adsRes.json()) as { data?: MetaAdListRow[] };
  const ads = adsPayload.data ?? [];
  const sourceAd = ads.find((x) => {
    const spec = x.creative?.object_story_spec;
    return spec && typeof spec === "object" && Object.keys(spec).length > 0;
  });
  if (!sourceAd?.creative?.object_story_spec || typeof sourceAd.creative.object_story_spec !== "object") {
    throw new Error("Не намерихме обява с копируем object_story_spec (линк или видео формат).");
  }
  const patched = patchObjectStorySpec(sourceAd.creative.object_story_spec, h, b);
  const ld = patched.link_data as Record<string, unknown> | undefined;
  const vd = patched.video_data as Record<string, unknown> | undefined;
  if (!ld && !vd) {
    throw new Error("Неподдържан тип creative (липсват link_data / video_data в object_story_spec).");
  }

  const creativeUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${actPath}/adcreatives`);
  const creativePayload = new URLSearchParams();
  creativePayload.set("object_story_spec", JSON.stringify(patched));
  attachMetaAuthToPayload(creativePayload, accessToken);
  const creativeRes = await metaPost(creativeUrl, creativePayload);
  if (creativeRes.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!creativeRes.ok) throw new Error(await readMetaGraphFailureMessage(creativeRes));
  const creativeJson = (await creativeRes.json()) as { id?: string };
  const creativeId = creativeJson.id;
  if (!creativeId) throw new Error("Meta не върна creative id след създаване.");

  const adUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${actPath}/ads`);
  const adPayload = new URLSearchParams();
  adPayload.set("name", `AI · ${h.slice(0, 72)}`);
  adPayload.set("adset_id", adSetId);
  adPayload.set("creative", JSON.stringify({ creative_id: creativeId }));
  adPayload.set("status", "PAUSED");
  attachMetaAuthToPayload(adPayload, accessToken);
  const adRes = await metaPost(adUrl, adPayload);
  if (adRes.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!adRes.ok) throw new Error(await readMetaGraphFailureMessage(adRes));
  const adJson = (await adRes.json()) as { id?: string };
  const adId = adJson.id;
  if (!adId) throw new Error("Meta не върна ad id след създаване.");

  logAction("meta_ad_variant_created", {
    campaignId: cid,
    actionType: "DIRECT_META_PUBLISH",
    agentName: "createAdVariant",
    payload: {
      adId,
      creativeId,
      adSetId,
      sourceAdId: String(sourceAd.id ?? "")
    }
  });

  return {
    adId,
    creativeId,
    adSetId,
    sourceAdId: String(sourceAd.id ?? "")
  };
}
