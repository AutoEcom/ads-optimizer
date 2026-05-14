/** Отговор от GET /api/meta/ad-content (клиент). */
export type FetchedAdContent = {
  adName: string;
  headline: string;
  bodyText: string;
};

const AD_CONTENT_CACHE_MS = 20_000;
const inflightAdContent = new Map<string, Promise<FetchedAdContent | null>>();
const recentAdContent = new Map<string, { value: FetchedAdContent | null; at: number }>();

function parseAdContentJson(j: {
  headline?: string;
  bodyText?: string;
  body_text?: string;
  adName?: string;
  ad_name?: string;
}): FetchedAdContent {
  const headline = typeof j.headline === "string" ? j.headline : "";
  const bodyTextRaw =
    typeof j.bodyText === "string" ? j.bodyText : typeof j.body_text === "string" ? j.body_text : "";
  const adName = typeof j.adName === "string" ? j.adName : typeof j.ad_name === "string" ? j.ad_name : "";
  return { adName, headline, bodyText: bodyTextRaw };
}

/**
 * Зарежда текущо заглавие и основен текст на обява от Meta (чрез сървърен API с потребителския токен).
 * Дедупликация: еднакъв `adId` по време на in-flight заявка или до изтичане на кратък кеш → една HTTP заявка.
 */
export async function fetchAdContent(adId: string): Promise<FetchedAdContent | null> {
  const id = adId.trim();
  if (!id) return null;

  const now = Date.now();
  const cached = recentAdContent.get(id);
  if (cached && now - cached.at < AD_CONTENT_CACHE_MS) {
    return cached.value;
  }

  const pending = inflightAdContent.get(id);
  if (pending) return pending;

  const promise = (async (): Promise<FetchedAdContent | null> => {
    try {
      const res = await fetch(`/api/meta/ad-content?ad_id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) {
        recentAdContent.set(id, { value: null, at: Date.now() });
        return null;
      }
      const j = (await res.json()) as Parameters<typeof parseAdContentJson>[0];
      const value = parseAdContentJson(j);
      recentAdContent.set(id, { value, at: Date.now() });
      return value;
    } catch {
      recentAdContent.set(id, { value: null, at: Date.now() });
      return null;
    } finally {
      inflightAdContent.delete(id);
    }
  })();

  inflightAdContent.set(id, promise);
  return promise;
}
