import { logAction } from "@/lib/logger";
import {
  attachMetaAuthToPayload,
  attachMetaAuthToUrl,
  fetchCampaignAdAccountId,
  metaAdAccountsMatch,
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
  adset_id?: string;
  creative?: { id?: string; object_story_spec?: Record<string, unknown> };
};

function isActiveOrPausedEffective(effectiveStatus?: string, status?: string): boolean {
  const es = (effectiveStatus ?? "").toUpperCase();
  const s = (status ?? "").toUpperCase();
  return es === "ACTIVE" || es === "PAUSED" || s === "ACTIVE" || s === "PAUSED";
}

function hasUsableStorySpec(ad: MetaAdListRow): boolean {
  const spec = ad.creative?.object_story_spec;
  return Boolean(spec && typeof spec === "object" && Object.keys(spec).length > 0);
}

function pickSourceAdFromList(ads: MetaAdListRow[]): MetaAdListRow | undefined {
  const usable = ads.filter(hasUsableStorySpec);
  if (usable.length === 0) return undefined;
  const preferred = usable.filter((a) => isActiveOrPausedEffective(a.effective_status, a.status));
  return preferred[0] ?? usable[0];
}

function sortAdsetsForTemplate(rows: MetaAdsetListRow[]): MetaAdsetListRow[] {
  return [...rows].sort((a, b) => {
    const rank = (r: MetaAdsetListRow) => {
      const es = (r.effective_status ?? "").toUpperCase();
      const s = (r.status ?? "").toUpperCase();
      if (es === "ACTIVE" || s === "ACTIVE") return 0;
      if (es === "PAUSED" || s === "PAUSED") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
}

async function fetchAdsForAdSet(accessToken: string, adSetId: string): Promise<MetaAdListRow[]> {
  const adsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${adSetId}/ads`);
  adsUrl.searchParams.set("fields", "id,name,status,effective_status,adset_id,creative{id,object_story_spec}");
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
  return adsPayload.data ?? [];
}

async function fetchCampaignLevelAds(accessToken: string, campaignId: string): Promise<MetaAdListRow[]> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}/ads`);
  url.searchParams.set("fields", "id,name,status,effective_status,adset_id,creative{id,object_story_spec}");
  url.searchParams.set("limit", "250");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(await readMetaGraphFailureMessage(res));
  const json = (await res.json()) as { data?: MetaAdListRow[] };
  return json.data ?? [];
}

/** Ред от `/{campaign_id}/ads` с пълен `creative` за debug / fallback. */
export type MetaAdDebugRow = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  creative?: unknown;
};

/**
 * Всички редове от `GET /{campaign_id}/ads` (с пагинация) с поле `creative` — за fallback, когато няма шаблон с object_story_spec.
 */
export async function fetchCampaignAdsForFallback(
  accessToken: string,
  campaignId: string
): Promise<MetaAdDebugRow[]> {
  const cid = campaignId.trim();
  if (!cid) return [];

  const ads: MetaAdDebugRow[] = [];
  let next: string | null = null;
  const first = new URL(`https://graph.facebook.com/${META_API_VERSION}/${cid}/ads`);
  first.searchParams.set("fields", "id,name,status,effective_status,adset_id,creative");
  first.searchParams.set("limit", "250");
  attachMetaAuthToUrl(first, accessToken);

  for (;;) {
    const target = next ? new URL(next) : first;
    if (next) attachMetaAuthToUrl(target, accessToken);
    const res = await fetch(target.toString(), { cache: "no-store" });
    if (res.status === 401) {
      const err = new Error("TOKEN_EXPIRED");
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    const json = (await res.json()) as {
      data?: MetaAdDebugRow[];
      paging?: { next?: string };
    };
    for (const row of json.data ?? []) {
      ads.push(row);
    }
    const n = json.paging?.next;
    if (!n || !res.ok) break;
    next = n;
  }

  return ads;
}

/** Първа обява в списъка с ACTIVE/PAUSED (status или effective_status), без филтър по ad set / creative. */
export function pickFirstActivePausedAdIdFromList(ads: MetaAdDebugRow[]): string | null {
  for (const a of ads) {
    if (!isActiveOrPausedEffective(a.effective_status, a.status)) continue;
    const id = String(a.id ?? "").trim();
    if (id) return id;
  }
  return null;
}

async function fetchAdsetIdForAd(accessToken: string, adId: string): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${adId.trim()}`);
  url.searchParams.set("fields", "adset_id");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { adset_id?: string };
  const id = typeof j.adset_id === "string" ? j.adset_id.trim() : "";
  return id || null;
}

function normalizeActIdForPath(accountId: string): string {
  const t = accountId.trim();
  if (t.startsWith("act_")) return t;
  return `act_${t.replace(/^act_/, "")}`;
}

/** Извлича заглавие и основен текст от Meta `object_story_spec` (link, carousel, видео). */
export function parseObjectStorySpecToHeadlineBody(spec: Record<string, unknown>): {
  headline: string;
  bodyText: string;
} {
  const ld = spec.link_data as Record<string, unknown> | undefined;
  const vd = spec.video_data as Record<string, unknown> | undefined;

  if (ld && typeof ld === "object") {
    const child = ld.child_attachments;
    if (Array.isArray(child) && child.length > 0) {
      const first = child[0] as Record<string, unknown>;
      const headline = String(first.name ?? first.title ?? ld.name ?? ld.caption ?? "").trim();
      const bodyText = String(
        first.description ?? first.link_description ?? first.message ?? ld.message ?? ld.description ?? ""
      ).trim();
      if (headline || bodyText) {
        return { headline, bodyText };
      }
    }
    return {
      headline: String(ld.name ?? ld.caption ?? "").trim(),
      bodyText: String(ld.message ?? ld.description ?? "").trim()
    };
  }
  if (vd && typeof vd === "object") {
    return {
      headline: String(vd.title ?? "").trim(),
      bodyText: String(vd.message ?? vd.description ?? "").trim()
    };
  }

  const msg = String(spec.message ?? "").trim();
  const nm = String(spec.name ?? "").trim();
  if (msg || nm) {
    return { headline: nm, bodyText: msg };
  }

  return { headline: "", bodyText: "" };
}

/**
 * Първа обява с непразен `object_story_spec` в активен Ad Set на кампанията (шаблон за клониране / бриф).
 * @throws Същите грешки като `createAdVariant` при липса на активен ad set или подходяща обява.
 */
export async function fetchTemplateSourceFromCampaign(
  accessToken: string,
  campaignId: string
): Promise<{ adId: string; adSetId: string; accountId: string; object_story_spec: Record<string, unknown> }> {
  const cid = campaignId.trim();
  if (!cid) throw new Error("Липсва campaign_id.");

  const { accountId, errorMessage } = await fetchCampaignAdAccountId(accessToken, cid);
  if (!accountId || errorMessage) {
    throw new Error(errorMessage ?? "Неуспешно определяне на рекламен акаунт за кампанията.");
  }

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
  const eligible = sortAdsetsForTemplate(
    adsets.filter((a) => isActiveOrPausedEffective(a.effective_status, a.status))
  );
  if (eligible.length === 0) {
    throw new Error("Няма Ad Set в състояние ACTIVE или PAUSED в тази кампания.");
  }

  for (const set of eligible) {
    if (!set.id) continue;
    const ads = await fetchAdsForAdSet(accessToken, set.id);
    const sourceAd = pickSourceAdFromList(ads);
    if (
      sourceAd?.id &&
      sourceAd.creative?.object_story_spec &&
      typeof sourceAd.creative.object_story_spec === "object"
    ) {
      const adId = String(sourceAd.id).trim();
      if (!adId) continue;
      return {
        adId,
        adSetId: set.id,
        accountId,
        object_story_spec: sourceAd.creative.object_story_spec as Record<string, unknown>
      };
    }
  }

  const campaignAds = await fetchCampaignLevelAds(accessToken, cid);
  const sourceAd = pickSourceAdFromList(campaignAds);
  if (!sourceAd?.creative?.object_story_spec || typeof sourceAd.creative.object_story_spec !== "object") {
    throw new Error("Не намерихме обява с копируем object_story_spec (линк или видео формат).");
  }
  const adId = String(sourceAd.id ?? "").trim();
  if (!adId) throw new Error("Meta не върна id на изходната обява.");

  const adSetFromRow = String(sourceAd.adset_id ?? "").trim();
  const resolvedAdSetId =
    adSetFromRow || (await fetchAdsetIdForAd(accessToken, adId)) || "";
  if (!resolvedAdSetId) {
    throw new Error("Не намерихме adset_id за избраната обява — не можем да клонираме към същия Ad Set.");
  }

  return {
    adId,
    adSetId: resolvedAdSetId,
    accountId,
    object_story_spec: sourceAd.creative.object_story_spec as Record<string, unknown>
  };
}

/** ID на основната (първа подходяща) обява за креативен шаблон; при грешка връща `null`. */
export async function findPrimaryTemplateAdIdForCampaign(
  accessToken: string,
  campaignId: string
): Promise<string | null> {
  try {
    const row = await fetchTemplateSourceFromCampaign(accessToken, campaignId);
    return row.adId;
  } catch {
    return null;
  }
}

type MetaAdCreativeNode = {
  id?: string;
  name?: string;
  object_story_spec?: Record<string, unknown>;
  effective_object_story_id?: string;
  asset_feed_spec?: Record<string, unknown>;
  body?: string;
  title?: string;
};

type MetaAdGraphDetail = {
  id?: string;
  name?: string;
  campaign?: { id?: string; account_id?: string };
  creative?: MetaAdCreativeNode;
};

/** Хвърля се когато не извлечем копие — носи raw `creative` за сървърни логове. */
export class CreativeExtractionError extends Error {
  readonly rawCreative: unknown;
  readonly adName: string;
  readonly adId: string;

  constructor(message: string, rawCreative: unknown, adName: string, adId: string) {
    super(message);
    this.name = "CreativeExtractionError";
    this.rawCreative = rawCreative;
    this.adName = adName;
    this.adId = adId;
  }
}

/** Dynamic Creative / Advantage+: първи налични titles/bodies/descriptions. */
export function parseAssetFeedSpecForHeadlineBody(asset: unknown): { headline: string; bodyText: string } {
  if (!asset || typeof asset !== "object") return { headline: "", bodyText: "" };
  const a = asset as Record<string, unknown>;

  const pickText = (arr: unknown, keys: string[]): string => {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const first = arr[0] as Record<string, unknown>;
    for (const k of keys) {
      const v = first[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const headline = pickText(a.titles, ["text", "name", "title"]) || pickText(a.headlines, ["text", "name"]);
  let bodyText = pickText(a.bodies, ["text", "message"]);
  if (!bodyText) bodyText = pickText(a.descriptions, ["text"]);
  if (!bodyText) bodyText = pickText(a.link_urls, ["display_url", "website_url"]);

  return { headline, bodyText };
}

async function fetchCreativeNodeExpanded(
  accessToken: string,
  creative: MetaAdCreativeNode | undefined
): Promise<MetaAdCreativeNode | undefined> {
  if (!creative?.id?.trim()) return creative;
  const hasInline =
    (creative.object_story_spec &&
      typeof creative.object_story_spec === "object" &&
      Object.keys(creative.object_story_spec).length > 0) ||
    (creative.asset_feed_spec && typeof creative.asset_feed_spec === "object") ||
    (typeof creative.effective_object_story_id === "string" && creative.effective_object_story_id.trim()) ||
    (typeof creative.body === "string" && creative.body.trim()) ||
    (typeof creative.title === "string" && creative.title.trim());

  if (hasInline) return creative;

  const cid = creative.id.trim();
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${cid}`);
  url.searchParams.set(
    "fields",
    "id,name,object_story_spec,effective_object_story_id,asset_feed_spec,body,title"
  );
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return creative;
  const extra = (await res.json()) as MetaAdCreativeNode;
  return { ...creative, ...extra };
}

async function fetchEffectiveObjectStoryNode(
  accessToken: string,
  storyId: string
): Promise<{ headline: string; bodyText: string }> {
  const sid = storyId.trim();
  if (!sid) return { headline: "", bodyText: "" };

  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${sid}`);
  url.searchParams.set("fields", "id,message,name,description,story");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!res.ok) return { headline: "", bodyText: "" };

  const j = (await res.json()) as {
    message?: string;
    name?: string;
    description?: string;
    story?: string;
  };
  const headline = String(j.name ?? "").trim();
  const parts = [j.message, j.story, j.description].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const bodyText = parts.map((p) => p.trim()).join("\n\n");
  return { headline, bodyText };
}

/**
 * Зарежда заглавие и основен текст от Meta за дадена обява; проверява `account_id` на кампанията.
 * Опити по ред: object_story_spec → title/body на creative → asset_feed_spec → effective_object_story_id (отделен Graph node).
 */
export async function fetchAdCreativeContentForGraphAd(
  accessToken: string,
  userAdAccountId: string,
  adId: string
): Promise<{ adName: string; headline: string; bodyText: string }> {
  const aid = adId.trim();
  if (!aid) throw new Error("Липсва ad id.");

  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${aid}`);
  url.searchParams.set(
    "fields",
    "id,name,campaign{id,account_id},creative{id,name,object_story_spec,effective_object_story_id,asset_feed_spec,body,title}"
  );
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const err = new Error("TOKEN_EXPIRED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(await readMetaGraphFailureMessage(res));

  const row = (await res.json()) as MetaAdGraphDetail;
  const campaignAccountId = row.campaign?.account_id ?? null;
  if (!metaAdAccountsMatch(userAdAccountId, campaignAccountId)) {
    throw new Error("Обявата не принадлежи на свързания Meta рекламен акаунт.");
  }

  const adName = String(row.name ?? "").trim();
  let creative = await fetchCreativeNodeExpanded(accessToken, row.creative);
  const rawForLog = creative ?? null;

  if (!creative) {
    throw new CreativeExtractionError("Липсва creative за обявата.", null, adName, aid);
  }

  const spec = creative.object_story_spec;
  if (spec && typeof spec === "object" && Object.keys(spec).length > 0) {
    const parsed = parseObjectStorySpecToHeadlineBody(spec);
    if (parsed.headline.trim() || parsed.bodyText.trim()) {
      return { adName, headline: parsed.headline, bodyText: parsed.bodyText };
    }
  }

  const titleDirect = String(creative.title ?? creative.name ?? "").trim();
  const bodyDirect = String(creative.body ?? "").trim();
  if (titleDirect || bodyDirect) {
    return { adName, headline: titleDirect, bodyText: bodyDirect };
  }

  const fromFeed = parseAssetFeedSpecForHeadlineBody(creative.asset_feed_spec);
  if (fromFeed.headline || fromFeed.bodyText) {
    return { adName, headline: fromFeed.headline, bodyText: fromFeed.bodyText };
  }

  const eid = typeof creative.effective_object_story_id === "string" ? creative.effective_object_story_id.trim() : "";
  if (eid) {
    const fromStory = await fetchEffectiveObjectStoryNode(accessToken, eid);
    if (fromStory.headline.trim() || fromStory.bodyText.trim()) {
      return { adName, headline: fromStory.headline, bodyText: fromStory.bodyText };
    }
  }

  throw new CreativeExtractionError(
    "Липсва извличимо копие след всички опити (object_story_spec, title/body, asset_feed_spec, effective_object_story).",
    rawForLog,
    adName,
    aid
  );
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

  const template = await fetchTemplateSourceFromCampaign(accessToken, cid);
  const adSetId = template.adSetId;
  const actPath = normalizeActIdForPath(template.accountId);
  const patched = patchObjectStorySpec(template.object_story_spec, h, b);
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
      sourceAdId: template.adId
    }
  });

  return {
    adId,
    creativeId,
    adSetId,
    sourceAdId: template.adId
  };
}
