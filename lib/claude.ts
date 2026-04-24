import { AdVariation, AuditInsight, CampaignMetrics, PrioritizedAction, SkillType } from "@/types";
import { buildHeuristicActions, buildKillList, computeHealthScore } from "@/lib/audit-rules";

const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

type ClaudeMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
};

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 700,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
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

export async function createAdVariations(productDescription: string): Promise<AdVariation[]> {
  const fallback: AdVariation[] = [
    {
      headline: "Спри разхищението на бюджет още днес",
      primaryText: `Открий скритите течове в кампаниите си с AdGuard AI. ${productDescription}`,
      hook: "Всеки изгубен лев е пропусната печалба."
    },
    {
      headline: "По-нисък CPA без догадки",
      primaryText: `Виж кои реклами изяждат резултатите и получи ясни действия за подобрение. ${productDescription}`,
      hook: "Решения за 5 минути, не за 5 дни."
    },
    {
      headline: "Дай шанс на работещите криейтиви",
      primaryText: `Превърни слабите кампании в печеливши с AI одити и нови послания. ${productDescription}`,
      hook: "Твоята следваща печеливша реклама започва тук."
    }
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallback;
  }

  const systemPrompt =
    "Ти си Senior Direct Response Copywriter за Meta/Google Ads. " +
    "Върни валиден JSON масив с точно 3 обекта {headline, primaryText, hook} на български.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 900,
        temperature: 0.6,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Продуктово описание: ${productDescription}`
          }
        ]
      })
    });

    if (!response.ok) return fallback;

    const payload = (await response.json()) as ClaudeMessageResponse;
    const text = payload.content?.find((entry) => entry.type === "text")?.text ?? "";
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) return fallback;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AdVariation[];
    if (!Array.isArray(parsed) || parsed.length !== 3) return fallback;

    return parsed.map((item) => ({
      headline: item.headline ?? "",
      primaryText: item.primaryText ?? "",
      hook: item.hook ?? ""
    }));
  } catch {
    return fallback;
  }
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
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      healthScore: computeHealthScore({
        campaigns,
        targetCpa,
        killCount: killList.length,
        actionCount: heuristicActions.length
      }),
      prioritizedActions: heuristicActions.slice(0, 6),
      killList
    };
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

  return {
    healthScore: computeHealthScore({
      campaigns,
      targetCpa,
      killCount: killList.length,
      actionCount: merged.length
    }),
    prioritizedActions: merged.slice(0, 8),
    killList
  };
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
      "Използвай type: SCALING_STRATEGY или BUDGET_SUFFICIENCY.",
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
      "Използвай type: AUCTION_OVERLAP или BID_STRATEGY_AUDITOR.",
    Strategy:
      "Meta: провери Funnel Alignment и предложи Audience Builder (Interest/LAL) разширения. " +
      "Google: направи Keyword Mining от search terms и funnel fit. " +
      "Използвай type: FUNNEL_ALIGNMENT, AUDIENCE_BUILDER или KEYWORD_MINING."
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 650,
      temperature: 0.1,
      system:
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
                "Върни JSON масив max 3 обекта: { task, impactScore, reason, platform, type, campaignId?, actionType?, isKillRule? }.",
              context: {
                targetCpa,
                targetRoas,
                businessContext: businessContext ?? "Без допълнителен контекст"
              },
              campaigns
            },
            null,
            2
          )
        }
      ]
    })
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
    }>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry.task && entry.reason)
      .map((entry) => ({
        task: entry.task ?? "",
        impactScore: Math.max(1, Math.min(100, Number(entry.impactScore ?? 60))),
        reason: entry.reason ?? "",
        platform: normalizePlatform(entry.platform),
        type: normalizeSkillType(entry.type),
        campaignId: entry.campaignId,
        actionType: entry.actionType,
        isKillRule: Boolean(entry.isKillRule)
      }));
  } catch {
    return [];
  }
}

function normalizePlatform(value?: string): "Meta" | "Google" | "Общо" {
  if (value === "Meta" || value === "Google" || value === "Общо") return value;
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
    }
  }
  return Array.from(map.values());
}
