/**
 * US-style M/D/YYYY в текст (често от AI/Meta) → DD.MM.YYYY за български UI.
 * Третира първото число като месец, второто като ден (като в US локала).
 */
export function formatSlashDatesToBulgarian(text: string): string {
  return text.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_m, monthStr: string, dayStr: string, year: string) => {
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      return `${monthStr}/${dayStr}/${year}`;
    }
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
  });
}
