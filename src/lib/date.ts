export function normalizeDateOfBirth(value: string): string | null {
  const trimmed = value.trim();
  const rawDigits = trimmed.replace(/\D/g, "");
  if (rawDigits.length === 8 && !/[\/\-.\s]/.test(trimmed)) {
    return normalizeDateParts(rawDigits.slice(0, 4), rawDigits.slice(4, 6), rawDigits.slice(6, 8));
  }
  const parts = trimmed.split(/[\/\-.\s]+/).filter(Boolean);
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return null;

  const [first, second, third] = parts;
  const year = first.length === 4 ? first : third.length === 4 ? third : "";
  const month = second;
  const day = first.length === 4 ? third : first;
  return normalizeDateParts(year, month, day);
}

function normalizeDateParts(year: string, month: string, day: string): string | null {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null;

  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === normalized ? normalized : null;
}