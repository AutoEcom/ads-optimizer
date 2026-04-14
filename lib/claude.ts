import { AdVariation, CampaignMetrics } from "@/types";

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
    `Проблем: CPA е ${campaign.cpa.toFixed(1)} лв. при цел ${targetCpa.toFixed(1)} лв., което означава, че губиш пари.`,
    campaign.ctr < 1
      ? "Възможност: CTR е под 1% - смени първия ред и визуалния hook с конкретна полза + силен CTA."
      : "Възможност: CTR е приемлив, но ROAS е слаб - тествай оферта с по-ясна стойност и краен срок.",
    campaign.conversions === 0 && campaign.spend > 100
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
