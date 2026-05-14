import type { PrioritizedAction } from "@/types";

/** FNV-1a 32-bit — еднакъв в браузър и в Node (publish route). */
function fnv1aHash32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Стабилен идентификатор за препоръка в `ai_strategy_cache.priority_actions`.
 * Ползва се в URL (`actionId`) и при маркиране `resolved` след успешен publish.
 */
export function getPrioritizedActionStableId(action: PrioritizedAction): string {
  const explicit = typeof action.id === "string" ? action.id.trim() : "";
  if (explicit) return explicit;
  const campaignId = (action.campaignId ?? "").trim();
  const type = String(action.type ?? "").trim();
  const task = (action.task ?? "").trim();
  const reason = (action.reason ?? "").slice(0, 220);
  const basis = `${campaignId}\u241e${type}\u241e${task}\u241e${reason}`;
  const h1 = fnv1aHash32(basis);
  const h2 = fnv1aHash32(`${basis}\u241e:end`);
  return `pa_${h1}${h2}`;
}

export function filterUnresolvedPrioritizedActions(actions: PrioritizedAction[]): PrioritizedAction[] {
  return actions.filter((a) => a.status !== "resolved");
}
