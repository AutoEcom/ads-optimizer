import type { FetchedAdContent } from "@/lib/creative-ad-fetch";

export type CreativeBriefFormatOptions = {
  campaignName?: string;
  campaignId?: string;
  currentAd?: FetchedAdContent | null;
  /** Текстът от `context` в URL (препоръка от одита). */
  optimizationReason?: string;
  /** Има `adId` в URL — очакваме копие от Meta. */
  requestedMetaAd?: boolean;
  /** Кратко предупреждение в блока „ТЕКУЩА РЕКЛАМА“, ако няма валидно копие от Meta. */
  adFetchWarning?: string | null;
  /** Първоначално състояние: зареждаме creative от Graph. */
  hydratingMetaAd?: boolean;
};

export function hasUsableAdCopy(ad: FetchedAdContent | null | undefined): boolean {
  return Boolean(ad?.headline?.trim() || ad?.bodyText?.trim());
}

/** Подразбираща се инструкция към AI (редактируема в UI). */
export const DEFAULT_TASK_FOR_AI =
  "На база на тези данни, генерирай 3 нови варианти, които да подобрят конверсиите, като запазиш печелившия ъгъл.";

/** Редактируеми части на брифа (UI карти). */
export type CreativeBriefSections = {
  /** Пълен ред „Кампания: … · Meta ID: …“ или празно. */
  campaignDisplay: string;
  /** Съдържание под „ТЕКУЩА РЕКЛАМА (META):“ без заглавния ред. */
  currentAdBlock: string;
  agentAnalysis: string;
  taskForAi: string;
};

function buildCurrentAdBlockInner(options: CreativeBriefFormatOptions): string {
  const requested = Boolean(options.requestedMetaAd);
  const hasAd = hasUsableAdCopy(options.currentAd);
  const warn = options.adFetchWarning?.trim() ?? "";

  if (options.hydratingMetaAd) {
    return "Зареждане на копието от Meta…";
  }

  if (hasAd && options.currentAd) {
    const ad = options.currentAd;
    const parts: string[] = [];
    if (ad.adName?.trim()) {
      parts.push(`Име в Ads Manager: ${ad.adName.trim()}`);
    }
    parts.push(`Заглавие: ${ad.headline.trim()}`);
    parts.push(`Текст: ${ad.bodyText.trim()}`);
    return parts.join("\n");
  }

  if (warn) {
    return warn;
  }

  if (requested) {
    return "Внимание: не успяхме да заредим оригиналното копие на обявата от Meta (мрежова грешка, права или формат).";
  }

  return "Няма автоматично заредена обява (липсва adId в линка). Добави тук заглавие и основен текст на текущата реклама ръчно за по-добър резултат от AI.";
}

/**
 * Структуриран бриф за карти/редактори в UI.
 * За обратна съвместимост с AI ползвай `composeCreativeBriefForApi`.
 */
export function buildCreativeBriefSections(options: CreativeBriefFormatOptions): CreativeBriefSections {
  const reason = options.optimizationReason?.trim() ?? "";
  const name = options.campaignName?.trim();
  const id = options.campaignId?.trim();

  let campaignDisplay = "";
  if (name || id) {
    const displayName = name || "—";
    campaignDisplay = `Кампания: ${displayName}${id ? ` · Meta ID: ${id}` : ""}`;
  }

  return {
    campaignDisplay,
    currentAdBlock: buildCurrentAdBlockInner(options),
    agentAnalysis: reason || "— (няма подаден контекст от одита)",
    taskForAi: DEFAULT_TASK_FOR_AI
  };
}

/** Сглобява същия текстов формат, който очаква AI пайплайнът. */
export function composeCreativeBriefForApi(s: CreativeBriefSections): string {
  const lines: string[] = ["---", ""];
  if (s.campaignDisplay.trim()) {
    lines.push(s.campaignDisplay.trim());
    lines.push("");
  }
  lines.push(
    "ТЕКУЩА РЕКЛАМА (META):",
    s.currentAdBlock.trim(),
    "",
    "АНАЛИЗ НА АГЕНТА:",
    s.agentAnalysis.trim(),
    "",
    "ЗАДАЧА ЗА AI:",
    s.taskForAi.trim(),
    "",
    "---"
  );
  return lines.join("\n").trim();
}

/**
 * Маркетингов бриф за полето „Генерирай“ — четим за човек и подходящ за подаване към модела.
 */
export function formatCreativeBriefForEditor(options: CreativeBriefFormatOptions): string {
  return composeCreativeBriefForApi(buildCreativeBriefSections(options));
}
