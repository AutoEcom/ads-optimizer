/**
 * Един ред JSON за Vercel / сървърни логове (grep-friendly).
 * Полета: timestamp, type, + data (campaignId, actionType, agentName, payload, …).
 */
export function logAction(type: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    ...data
  });
  console.log(line);
}
