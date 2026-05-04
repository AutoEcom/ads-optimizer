import type { PrioritizedAction, PrioritizedActionGroup, PrioritizedActionListItem, SkillType } from "@/types";

/** Повече от две действия с един и същ тип → една група (виртуална карта). */
const GROUP_THRESHOLD = 2;

function countBySkillType(actions: PrioritizedAction[]): Map<SkillType, number> {
  const counts = new Map<SkillType, number>();
  for (const a of actions) {
    if (!a.type) continue;
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }
  return counts;
}

/**
 * Обединява препоръки с един и същ `type` (SkillType), когато броят им е **по-голям от 2** (т.е. ≥ 3).
 * Запазва реда на първото срещане на всеки тип; останалите от същия тип се пропускат в потока.
 */
export function groupActionsByType(actions: PrioritizedAction[]): PrioritizedActionListItem[] {
  const counts = countBySkillType(actions);
  const groupedTypes = new Set<SkillType>();
  for (const [t, c] of counts) {
    if (c > GROUP_THRESHOLD) groupedTypes.add(t);
  }

  const emittedGroup = new Set<SkillType>();
  const out: PrioritizedActionListItem[] = [];

  for (const a of actions) {
    if (a.type && groupedTypes.has(a.type)) {
      if (!emittedGroup.has(a.type)) {
        const children = actions.filter((x) => x.type === a.type);
        out.push({ isGroup: true, type: a.type, children });
        emittedGroup.add(a.type);
      }
      continue;
    }
    out.push(a);
  }

  return out;
}

export function isPrioritizedActionGroup(item: PrioritizedActionListItem): item is PrioritizedActionGroup {
  return "isGroup" in item && item.isGroup === true;
}
