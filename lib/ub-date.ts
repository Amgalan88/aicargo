// Админы сонгосон огноо (YYYY-MM-DD) — Улаанбаатарын цагаар бүтэн өдөр.
// Сервер (Vercel) UTC-ээр ажилладаг тул `${date}T00:00:00` гэвэл өдөр 08:00-аас эхэлдэг байсан.
export function ubDayRange(date: unknown): { start: Date; end: Date } | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const start = new Date(`${date}T00:00:00+08:00`)
  if (isNaN(start.getTime())) return null
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) }
}
