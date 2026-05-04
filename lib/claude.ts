import { buildHeuristicActions, buildKillList, computeHealthScore } from "@/lib/audit-rules";
import { parseExecutableToolFromAgentJson, sanitizeAuditInsightMcp } from "@/lib/executable-meta-tool";
import { AdVariation, AuditInsight, CampaignMetrics, PrioritizedAction, SkillType } from "@/types";

/** Аудит / sub-agents — най-мощният слой (според Workbench). Алтернатива: claude-haiku-4-5-20251001 за скорост. */
const CLAUDE_MODEL = "claude-opus-4-7";

/** Генератор реклами — Sonnet 4.6 („новият Sonnet“). */
const CLAUDE_CREATIVE_MODEL = "claude-sonnet-4-6";

type ClaudeMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
};

/** Идентичен на официалния Messages endpoint (без query). */
const ANTHROPIC_MESSAGES_BASE_URL = "https://api.anthropic.com/v1/messages";

function anthropicMessagesUrl(): string {
  return ANTHROPIC_MESSAGES_BASE_URL;
}

/** От мрежови променливи: trim и премахва единични/двойни кавички около целия стринг в .env. */
function anthropicApiKeyFromEnv(): string {
  let k = process.env.ANTHROPIC_API_KEY ?? "";
  k = k.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

/** Фиксирана версия на HTTP API към Claude (Anthropic документация). */
const ANTHROPIC_VERSION_HEADER = "2023-06-01";

function anthropicJsonHeaders(apiKey: string): Record<string, string> {
  const key = apiKey.trim();
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION_HEADER,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0"
  };
}

function anthropicOutboundHeadersSafeForLog(headers: Record<string, string>): Record<string, string> {
  const apiKeySent = headers["x-api-key"] ?? "";
  const masked =
    apiKeySent.length === 0
      ? "(empty)"
      : apiKeySent.length <= 14
        ? `(only ${apiKeySent.length} chars — check .env)`
        : `${apiKeySent.slice(0, 12)}…${apiKeySent.slice(-4)} (len=${apiKeySent.length})`;
  return { ...headers, "x-api-key": masked };
}

function shouldLogAnthropicTransport(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ADS_DEBUG_ANTHROPIC === "1";
}

/** Пълният URL и хедъри (ключът замаскиран) точно преди fetch. */
function logAnthropicOutbound(context: string, url: string, headers: Record<string, string>): void {
  const baseNoQuery = url.split("?")[0];
  const alwaysForCreative =
    context === "createAdVariations" ||
    context.startsWith("createAdVariations:") ||
    process.env.ADS_LOG_ANTHROPIC_TRANSPORT === "1";
  if (!alwaysForCreative && !shouldLogAnthropicTransport()) return;

  console.log(
    "[Anthropic OUTBOUND]",
    JSON.stringify(
      {
        context,
        fullUrl: url,
        pathnameCheck:
          baseNoQuery === ANTHROPIC_MESSAGES_BASE_URL
            ? "OK"
            : `WRONG (got ${baseNoQuery}, expected ${ANTHROPIC_MESSAGES_BASE_URL})`,
        headersSent: anthropicOutboundHeadersSafeForLog(headers),
        anthropic_version_expected: ANTHROPIC_VERSION_HEADER,
        anthropic_version_sent: headers["anthropic-version"]
      },
      null,
      2
    )
  );
}

export async function createCampaignAudit(args: {
  campaign: CampaignMetrics;
  targetCpa: number;
  targetRoas: number;
}) {
  const { campaign, targetCpa, targetRoas } = args;

  const fallback = [
    campaign.impressions < 500
      ? "Проблем: Кампанията е в Learning фаза (под 500 импресии), данните са още рано за агресивни промени."
      : `Проблем: CPA е ${campaign.cpa.toFixed(1)} лв. при цел ${targetCpa.toFixed(1)} лв., което означава, че губиш пари.`,
    campaign.ctr < 1
      ? "Възможност: CTR е под 1% - смени първия ред и визуалния hook с конкретна полза + силен CTA."
      : "Възможност: CTR е приемлив, но ROAS е слаб - тествай оферта с по-ясна стойност и краен срок.",
    campaign.impressions < 500
      ? "Следваща стъпка: Кампанията е нова - изчакай още 48 часа за стабилни сигнали преди да режеш бюджета."
      : campaign.conversions === 0 && campaign.spend > 100
      ? "Следваща стъпка: Спри тази кампания веднага и пусни нов текст/крийтив с различен ъгъл."
      : `Следваща стъпка: Пренасочи 20% бюджет към вариант с цел ROAS ${targetRoas.toFixed(1)}+.`
  ];

  const apiKey = anthropicApiKeyFromEnv();
  if (!apiKey) {
    return fallback;
  }

  const systemPrompt =
    "Ти си Senior Media Buyer. Анализираш JSON данни от Google/Meta Ads. " +
    "Сравнявай CPA с целевия CPA на клиента. " +
    "Ако импресиите са под 500, маркирай кампанията като Learning и препоръчай изчакване 48 часа. " +
    "Ако CTR е под 1%, предложи конкретна промяна в криейтива. " +
    "Говори директно и остро, когато клиентът губи пари. " +
    "Върни точно 3 bullets на български: Проблем, Възможност, Следваща стъпка.";

  const userPrompt = JSON.stringify(
    {
      campaign,
      targets: { targetCpa, targetRoas }
    },
    null,
    2
  );

  try {
    const url = anthropicMessagesUrl();
    const headers = anthropicJsonHeaders(apiKey);
    logAnthropicOutbound("createCampaignAudit", url, headers);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 700,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = (await response.json()) as ClaudeMessageResponse;
    const text = payload.content?.find((entry) => entry.type === "text")?.text ?? "";
    const bullets = text
      .split("\n")
      .map((line) => line.replace(/^[-*•\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    return bullets.length === 3 ? bullets : fallback;
  } catch {
    return fallback;
  }
}

const URL_IN_INPUT_REGEX = /\bhttps?:\/\/[^\s<>"']+/i;

const GENERATE_ADS_FEW_SHOT_BLOCK =
  "\n### ПРИМЕР ЗА ИЗХОД (НЕ повтаряш входа — това е главният режим):\n" +
  "EXAMPLE OF WHAT TO AVOID:\n" +
  'Input: "Колаген за стави"\n' +
  'Output headline idea: "Още ли те боли от Колаген за стави?" (ГРЕШНО — преписване на входа)\n' +
  "\n" +
  "EXAMPLE OF WHAT TO DO:\n" +
  'Input: "Колаген за стави"\n' +
  'Output headline idea: "Върни се към активния живот без болка още днес." (ПРАВИЛНО — креативна интерпретация на ползата)\n';

const GENERATE_ADS_SYSTEM_PROMPT =
  "Ти си световноизвестен Direct Response Copywriter, специализиран в Meta и Google Ads. Твоята задача е да превърнеш сурови технически данни в магнетично рекламно копи.\n" +
  GENERATE_ADS_FEW_SHOT_BLOCK +
  "\n" +
  "### СТРИКТНИ ЗАБРАНИ (CRITICAL):\n" +
  '1. НИКОГА не включвай думи като "Входни бележки", "Контекст", "Продукт", "Платформа" или "Оферта" в резултата.\n' +
  "2. НИКОГА не преписвай суровия текст от входа. Използвай го само за информация.\n" +
  '3. НИКОГА не започвай изреченията с "От клиента:" или подобни фрази.\n' +
  "\n" +
  "### ТВОЯТ СТИЛ:\n" +
  '- Пиши директно на "Ти". \n' +
  "- Използвай емоционални спусъци: болка, желание, страх от пропуснати ползи (FOMO).\n" +
  '- Фокусирай се върху РЕЗУЛТАТА, а не върху съставките (напр. не "Колаген 11000мг", а "Забрави за болката в ставите и върни свободата на движенията си").\n' +
  "\n" +
  "### СТРУКТУРА НА ВАРЯНТИТЕ:\n" +
  "Вариант 1 (Pain): Започни с въпрос за болката/проблема.\n" +
  "Вариант 2 (Benefit): Започни с обещание за трансформация.\n" +
  "Вариант 3 (Urgency): Започни със силен кука (hook) и ограничено количество/време.\n" +
  "\n" +
  "### ФОРМАТ НА ИЗХОДА (JSON):\n" +
  "Върни обекта точно в този формат:\n" +
  "{\n" +
  '  "variants": [\n' +
  '    { "headline": "...", "body": "...", "hook": "..." },\n' +
  '    { "headline": "...", "body": "...", "hook": "..." },\n' +
  '    { "headline": "...", "body": "...", "hook": "..." }\n' +
  "  ]\n" +
  "}";

/** Single-turn only: задача ясно отделена от DATA, за да не се ползва user като copy-paste. */
function buildGenerateAdsStructuredUserMessage(dataPlain: string): string {
  const data = collapseWhitespace(dataPlain).slice(0, 12_000);
  return [
    "TASK: Write exactly 3 creative advertising variants based on the information below.",
    "RULES: Do NOT repeat or lightly repurpose the DATA as finished ad copy.",
    "Do NOT use forbidden meta scaffolding (see system prompt). Interpret and sell the benefit.",
    "All headline, body, and hook strings in the JSON must be in Bulgarian.",
    "OUTPUT: Respond with JSON ONLY, matching the system schema ({ variants: [...] }).",
    "",
    "DATA:",
    data || "(no structured notes — infer a plausible wellness-style angle in Bulgarian)."
  ].join("\n");
}

/**
 * Strip technical wrappers before Claude user message (`createAdVariations` input pipeline).
 */
function sanitizeCreativeBriefForClaude(raw: string): string {
  let s = raw.replace(/\s*---+[\s-]*\s*/g, "\n").trim();
  const lines = s.split(/\n/).map((line) => {
    const t = line.trim();
    return t
      .replace(
        /^(Входни\s+бележки|Input|INPUT|От\s+клиента|CONTEXT|Контекст|Допълнително\s+от\s+страницата|Подадена\s+информация|Информация\s+за\s+писане)\s*[:\.]?\s*/i,
        ""
      )
      .trim();
  });
  s = collapseWhitespace(lines.filter(Boolean).join("\n"));
  return s.trim();
}

function buildCreativeBriefForApi(rawInput: string, fetchedPagePlain: string | null): string {
  const parts: string[] = [];
  let userBlock = rawInput.trim();
  if (fetchedPagePlain && URL_IN_INPUT_REGEX.test(userBlock)) {
    userBlock = userBlock.replace(URL_IN_INPUT_REGEX, " ").trim();
    userBlock = collapseWhitespace(userBlock);
  }
  if (userBlock) parts.push(userBlock);
  if (fetchedPagePlain?.trim()) parts.push(collapseWhitespace(fetchedPagePlain));
  return sanitizeCreativeBriefForClaude(parts.filter(Boolean).join("\n\n"));
}

/** Strips wrappers like Input:/От клиента: before calling Claude (`sanitizeCreativeBriefForClaude`). */
export async function createAdVariations(productDescription: string): Promise<AdVariation[]> {
  const rawInput = productDescription.trim();
  const urlContext =
    typeof rawInput === "string" && rawInput.length > 0 ? await tryFetchCreativePageContext(rawInput) : null;

  const creativeUserPayload = buildCreativeBriefForApi(rawInput, urlContext?.plainProse ?? null);

  const apiKey = anthropicApiKeyFromEnv();
  if (!apiKey) {
    throw new Error("Липсва ANTHROPIC_API_KEY — не мога да извикам Claude.");
  }

  const dataForModel =
    creativeUserPayload.trim() ||
    "Няма въведени данни за конкретна ниша. Генерирай 3 силни Direct Response примера на български за активен здравословен начин на живот като временен запълващ текст.";

  /** Единствен user turn — без chat history към Messages API. */
  const finalUserMessage = buildGenerateAdsStructuredUserMessage(dataForModel);

  const anthropicCreativeRequestBody = {
    model: CLAUDE_CREATIVE_MODEL,
    max_tokens: 1400,
    temperature: 0.8,
    system: GENERATE_ADS_SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: finalUserMessage }]
  };

  if (process.env.NODE_ENV !== "production" || process.env.ADS_DEBUG_ANTHROPIC === "1") {
    console.log("FINAL PROMPT SENT TO CLAUDE:", JSON.stringify(anthropicCreativeRequestBody, null, 2));
  }

  let response: Response;
  try {
    const url = anthropicMessagesUrl();
    const headers = anthropicJsonHeaders(apiKey);
    logAnthropicOutbound("createAdVariations", url, headers);

    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(anthropicCreativeRequestBody),
      cache: "no-store"
    });
  } catch (err) {
    throw new Error(
      `Неуспешна мрежова заявка към Anthropic: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    if (process.env.NODE_ENV !== "production" || process.env.ADS_DEBUG_ANTHROPIC === "1") {
      console.warn("[createAdVariations] Anthropic HTTP error:", response.status, errBody.slice(0, 800));
    }
    throw new Error(
      `Anthropic върна ${response.status}. ${errBody.slice(0, 400)}`.trim()
    );
  }

  let payload: ClaudeMessageResponse;
  try {
    payload = (await response.json()) as ClaudeMessageResponse;
  } catch (err) {
    throw new Error(`Невалиден отговор JSON от Anthropic: ${err instanceof Error ? err.message : String(err)}`);
  }

  const text = payload.content?.find((entry) => entry.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = extractAdVariantsPayload(text);
  } catch (err) {
    throw new Error(`Непарсируем AI изход за реклами: ${err instanceof Error ? err.message : String(err)}`);
  }

  const validated = sanitizeAdVariations(parsed);
  if (!validated || validated.length !== 3) {
    throw new Error("Отговорът няма 3 валидни variant-а headline/body/hook.");
  }

  const looksGeneric =
    validated.some((v) => /adguard|оптимизатор|health audit|CPA без догадки/i.test(`${v.headline} ${v.primaryText}`)) ||
    validated.every((v) => v.primaryText.length < 40);
  if (looksGeneric) {
    throw new Error("Моделът върна твърде генерично копие — промени входа или temperature и опитай пак.");
  }

  return validated;
}

async function tryFetchCreativePageContext(
  inputText: string
): Promise<{ plainProse: string | null; blockedReason?: string } | null> {
  const rawUrlMatch = inputText.match(URL_IN_INPUT_REGEX);
  if (!rawUrlMatch) return null;
  let urlRaw = rawUrlMatch[0].replace(/[),.;]+$/, "");
  try {
    const u = new URL(urlRaw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { plainProse: null, blockedReason: "Неподдържана схема на линка" };
    }
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return { plainProse: null, blockedReason: "Локални линкове не се зареждат" };
    }
    urlRaw = u.toString();
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(urlRaw, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "AdsOptimizerCreativeFetcher/1.0"
      }
    });
    if (!res.ok) {
      return { plainProse: null, blockedReason: `Страницата върна HTTP ${res.status}` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().includes("text/html")) {
      return { plainProse: null, blockedReason: "Не е HTML страница" };
    }
    const truncated = scrubHtmlSnippet(await res.text()).slice(0, 380_000);
    const ogTitle = pickHtmlMeta(truncated, "og:title");
    const ogDesc = pickHtmlMeta(truncated, "og:description");
    const mdDesc = pickNameMeta(truncated, "description");
    const titleMatch = truncated.match(/<title[^>]*>([^<]{1,400})<\/title>/i);
    const docTitle = titleMatch?.[1] ? decodeBasicHtmlEntities(titleMatch[1]).trim() : null;
    const plain = collapseWhitespace(decodeBasicHtmlEntities(truncated.replace(/<[^>]+>/g, " ")));

    const prosePieces = [docTitle ?? ogTitle, ogDesc ?? mdDesc, plain.slice(0, 3200)].filter(
      (p): p is string => typeof p === "string" && p.length > 0
    );

    const plainProse = collapseWhitespace(prosePieces.join(" "));
    return plainProse ? { plainProse } : { plainProse: null };
  } catch {
    return { plainProse: null, blockedReason: "Неуспешно зареждане на линка" };
  } finally {
    clearTimeout(timer);
  }
}

function scrubHtmlSnippet(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
}

function pickHtmlMeta(html: string, property: string): string | null {
  const direct = html.match(new RegExp(`property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i"));
  if (direct?.[1]) return collapseWhitespace(decodeBasicHtmlEntities(direct[1].trim()));
  const reverse = html.match(new RegExp(`content=["']([^"']+)["'][^>]*property=["']${property}["']`, "i"));
  if (reverse?.[1]) return collapseWhitespace(decodeBasicHtmlEntities(reverse[1].trim()));
  return null;
}

function pickNameMeta(html: string, nameAttr: string): string | null {
  const direct = html.match(new RegExp(`name=["']${nameAttr}["'][^>]*content=["']([^"']+)["']`, "i"));
  if (direct?.[1]) return collapseWhitespace(decodeBasicHtmlEntities(direct[1].trim()));
  const reverse = html.match(new RegExp(`content=["']([^"']+)["'][^>]*name=["']${nameAttr}["']`, "i"));
  if (reverse?.[1]) return collapseWhitespace(decodeBasicHtmlEntities(reverse[1].trim()));
  return null;
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function unwrapJsonFence(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  return text;
}

/** Parses `{ "variants": [...] }` or legacy top-level array. */
function extractAdVariantsPayload(raw: string): unknown {
  const text = unwrapJsonFence(raw);
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const obj = JSON.parse(text.slice(objStart, objEnd + 1)) as Record<string, unknown>;
      if (obj && Array.isArray(obj.variants)) return obj.variants;
    } catch {
      /* try array fallback */
    }
  }
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("missing variants");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function sanitizeAdVariations(data: unknown): AdVariation[] | null {
  if (!Array.isArray(data)) return null;
  const out: AdVariation[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const headline = String(r.headline ?? r["заглавие"] ?? "").trim();
    const primaryText = String(r.primaryText ?? r.body ?? r["текст"] ?? r["text"] ?? "").trim();
    const hook = String(r.hook ?? r["кука"] ?? "").trim();
    if (!headline || !primaryText || !hook) continue;
    out.push({ headline, primaryText, hook });
  }
  if (out.length < 3) return null;
  return out.slice(0, 3).map((v) => ({
    headline: trimForHeadline(v.headline),
    primaryText: v.primaryText,
    hook: v.hook
  }));
}

function trimForHeadline(s: string, max = 72): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

/** Подравнява platform/metaPlacement с реалните кампании (източник на истина: campaign.platform + metaPlacement). */
function attachCampaignPlatformTruth(
  actions: PrioritizedAction[],
  campaigns: CampaignMetrics[]
): PrioritizedAction[] {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  return actions.map((a) => {
    if (!a.campaignId) return a;
    const c = byId.get(a.campaignId);
    if (!c) return a;
    return {
      ...a,
      platform: c.platform,
      metaPlacement: c.platform === "Meta" ? c.metaPlacement : undefined
    };
  });
}

export async function createHealthAudit(args: {
  campaigns: CampaignMetrics[];
  targetCpa: number;
  targetRoas: number;
  businessContext?: string;
}): Promise<AuditInsight> {
  const { campaigns, targetCpa, targetRoas, businessContext } = args;
  const killList = buildKillList(campaigns, targetCpa);
  const heuristicActions = buildHeuristicActions(campaigns, targetCpa);
  const apiKey = anthropicApiKeyFromEnv();

  if (!apiKey) {
    return sanitizeAuditInsightMcp({
      healthScore: computeHealthScore({
        campaigns,
        targetCpa,
        killCount: killList.length,
        actionCount: heuristicActions.length
      }),
      prioritizedActions: attachCampaignPlatformTruth(heuristicActions.slice(0, 6), campaigns),
      killList
    });
  }

  const domains = [
    "Budget",
    "Creative",
    "Audience",
    "Technical",
    "Bidding",
    "Strategy"
  ] as const;

  const subAgentActions = await Promise.all(
    domains.map((domain) =>
      runSubAgentAudit({
        apiKey,
        domain,
        campaigns,
        targetCpa,
        targetRoas,
        businessContext
      })
    )
  );

  const merged = dedupeActions([...heuristicActions, ...subAgentActions.flat()]).sort(
    (a, b) => b.impactScore - a.impactScore
  );

  return sanitizeAuditInsightMcp({
    healthScore: computeHealthScore({
      campaigns,
      targetCpa,
      killCount: killList.length,
      actionCount: merged.length
    }),
    prioritizedActions: attachCampaignPlatformTruth(merged.slice(0, 8), campaigns),
    killList
  });
}

async function runSubAgentAudit(args: {
  apiKey: string;
  domain: "Budget" | "Creative" | "Audience" | "Technical" | "Bidding" | "Strategy";
  campaigns: CampaignMetrics[];
  targetCpa: number;
  targetRoas: number;
  businessContext?: string;
}) {
  const { apiKey, domain, campaigns, targetCpa, targetRoas, businessContext } = args;
  const domainPlaybook: Record<typeof domain, string> = {
    Budget:
      "Meta: приложи Scaling Roadmap (поетапно вдигане на бюджет при стабилен CPA/ROAS). " +
      "Google: анализирай Budget Sufficiency (дали бюджетът ограничава Impression Share и конверсии). " +
      "Използвай type: SCALING_STRATEGY или BUDGET_SUFFICIENCY. " +
      "Budget agent / Meta: при конкретна препоръка за дневен бюджет ЗАДЪЛЖИТЕЛНО включи executable_tool с name adjust_budget, parameters.campaign_id и parameters.new_budget (положително число).",
    Creative:
      "Meta: провери Creative Fatigue и hook стратегия при висока frequency/нисък CTR. " +
      "Google: провери Ad Copy Relevance и Quality сигналите. " +
      "Използвай type: CREATIVE_FATIGUE или AD_COPY_RELEVANCE.",
    Audience:
      "Meta: предложи Audience Builder идеи (LAL, interests, broad+advantage). " +
      "Google: използвай Audience Signals за PMax/Display. " +
      "Използвай type: AUDIENCE_BUILDER или AUDIENCE_SIGNALS.",
    Technical:
      "Meta: анализирай Event Match Quality и tracking quality. " +
      "Google: приложи Negative Keyword Guard за wasted spend от нерелевантни search terms. " +
      "Използвай type: EVENT_MATCH_QUALITY или NEGATIVE_KEYWORD_GUARD.",
    Bidding:
      "Meta: търси Auction Overlap/вътрешна конкуренция между ad sets. " +
      "Google: провери Bid Strategy Auditor (tCPA/tROAS mismatch). " +
      "Използвай type: AUCTION_OVERLAP или BID_STRATEGY_AUDITOR. " +
      "Performance / Meta: ако препоръчаш пауза на кампания, включи executable_tool с name pause_campaign.",
    Strategy:
      "Meta: провери Funnel Alignment и предложи Audience Builder (Interest/LAL) разширения. " +
      "Google: направи Keyword Mining от search terms и funnel fit. " +
      "Използвай type: FUNNEL_ALIGNMENT, AUDIENCE_BUILDER или KEYWORD_MINING. " +
      "Performance agent / Meta: при препоръка за спиране/пауза заради загуби или 3x Kill риск включи executable_tool с name pause_campaign."
  };

  const url = anthropicMessagesUrl();
  const headers = anthropicJsonHeaders(apiKey);
  logAnthropicOutbound(`runSubAgentAudit:${domain}`, url, headers);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 650,
      temperature: 0.1,
      system:
        META_MCP_ORCHESTRATOR_RULES +
        "Ти си Senior Media Buyer sub-agent. Работиш само по даден домейн и връщаш валиден JSON масив. " +
        "Фокус: рентабилност, спиране на money leaks, директен тон. Отговаряй само на български. " +
        "Критично правило: ако кампанията има под 500 импресии, маркирай я като Learning и препоръчай изчакване 48 часа, без драстични промени. " +
        "Добавяй actionType='PAUSE' и isKillRule=true само при ясен 3x Kill Rule риск.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              mode: "sub-agent-audit",
              domain,
              domainPlaybook: domainPlaybook[domain],
              requiredOutput:
                "Върни JSON масив max 3 обекта. Всеки обект: { task, impactScore, reason, platform, type, campaignId?, actionType?, isKillRule?, executable_tool? }. " +
                "campaignId: задължително копирай от campaigns[].id на съответната кампания, когато препоръката е за конкретна кампания. " +
                "executable_tool: { name: 'adjust_budget'|'pause_campaign'|'rename_campaign', parameters: { campaign_id (същото като campaignId), new_budget?, new_name? }, explanation }. " +
                "Ако препоръката съвпада с инструмент по правилата на оркестратора — ЗАДЪЛЖИТЕЛНО попълни executable_tool.",
              context: {
                targetCpa,
                targetRoas,
                businessContext: businessContext ?? "Без допълнителен контекст",
                campaignIdRule:
                  "campaigns[].id е Meta/Google campaign id — използвай го 1:1 в campaignId и в executable_tool.parameters.campaign_id за Meta."
              },
              campaigns
            },
            null,
            2
          )
        }
      ]
    }),
    cache: "no-store"
  });

  if (!response.ok) return [];
  const payload = (await response.json()) as ClaudeMessageResponse;
  const text = payload.content?.find((entry) => entry.type === "text")?.text ?? "";
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1) return [];

  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Array<{
      task?: string;
      impactScore?: number;
      reason?: string;
      platform?: string;
      type?: string;
      campaignId?: string;
      actionType?: "PAUSE" | "ACTIVATE";
      isKillRule?: boolean;
      executable_tool?: unknown;
    }>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry.task && entry.reason)
      .map((entry) => {
        const tool = parseExecutableToolFromAgentJson(entry.executable_tool);
        return {
          task: entry.task ?? "",
          impactScore: Math.max(1, Math.min(100, Number(entry.impactScore ?? 60))),
          reason: entry.reason ?? "",
          platform: normalizePlatform(entry.platform),
          type: normalizeSkillType(entry.type),
          campaignId: entry.campaignId,
          actionType: entry.actionType,
          isKillRule: Boolean(entry.isKillRule),
          ...(tool ? { executable_tool: tool } : {})
        };
      });
  } catch {
    return [];
  }
}

function normalizePlatform(value?: string): "Meta" | "Google" | "Общо" {
  if (!value) return "Общо";
  const v = value.trim();
  if (v === "Meta" || v === "Google" || v === "Общо") return v;
  const lower = v.toLowerCase();
  if (lower.includes("google") || lower === "gads" || lower === "google ads") return "Google";
  if (
    lower.includes("facebook") ||
    lower.includes("instagram") ||
    lower === "meta" ||
    lower.includes("fb") ||
    lower.includes("ig ads") ||
    lower.includes("meta ads")
  ) {
    return "Meta";
  }
  return "Общо";
}

function normalizeSkillType(value?: string): SkillType | undefined {
  const allowed: SkillType[] = [
    "SCALING_STRATEGY",
    "BUDGET_SUFFICIENCY",
    "CREATIVE_FATIGUE",
    "AD_COPY_RELEVANCE",
    "AUDIENCE_BUILDER",
    "AUDIENCE_SIGNALS",
    "EVENT_MATCH_QUALITY",
    "NEGATIVE_KEYWORD_GUARD",
    "AUCTION_OVERLAP",
    "BID_STRATEGY_AUDITOR",
    "FUNNEL_ALIGNMENT",
    "KEYWORD_MINING"
  ];
  if (!value) return undefined;
  return allowed.includes(value as SkillType) ? (value as SkillType) : undefined;
}

function dedupeActions(actions: PrioritizedAction[]) {
  const map = new Map<string, PrioritizedAction>();
  for (const action of actions) {
    const key = `${action.platform}:${action.task.trim().toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || existing.impactScore < action.impactScore) {
      map.set(key, action);
    } else if (existing.impactScore === action.impactScore && action.executable_tool && !existing.executable_tool) {
      map.set(key, { ...existing, executable_tool: action.executable_tool });
    }
  }
  return Array.from(map.values());
}

/** Оркестратор + Meta MCP: инструкции към всички sub-agents (Claude). */
const META_MCP_ORCHESTRATOR_RULES =
  "Оркестрация / Meta MCP: Разполагаш с три изпълними инструмента само за платформа Meta и реални campaign id от входния JSON: " +
  "adjust_budget (campaign_id + new_budget дневен бюджет в основна валута на акаунта), " +
  "pause_campaign (campaign_id), rename_campaign (campaign_id + new_name за тест). " +
  "Критично: ако препоръчаш действие, което директно съответства на някой от тези три инструмента, " +
  "ЗАДЪЛЖИТЕЛНО включи в същия JSON обект от масива поле executable_tool с точна структура: " +
  '{ "executable_tool": { "name": "adjust_budget"|"pause_campaign"|"rename_campaign", ' +
  '"parameters": { "campaign_id": "<копирай точно от campaigns[].id>", "new_budget"?: number, "new_name"?: string }, ' +
  '"explanation": "кратко защо извикваш инструмента" } }. ' +
  "За Google или общи препоръки без тези инструменти — пропусни executable_tool или го задай на null. " +
  "campaign_id в parameters трябва да съвпада с campaignId на същия обект, когато има campaignId.";
