export function normalizeDateOfBirth(value: string): string | null {
  const trimmed = value.trim();
  const parts = trimmed.includes("/") ? trimmed.split("/") : trimmed.split("-");
  if (parts.length !== 3) return null;

  const [first, second, third] = parts;
  const year = trimmed.includes("/") ? third : first;
  const month = trimmed.includes("/") ? second : second;
  const day = trimmed.includes("/") ? first : third;
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null;

  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === normalized ? normalized : null;
}