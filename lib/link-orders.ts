// Линкээр захиалга — хэрэглэгч барааны линк илгээж, карго үнэ тооцоод, төлбөр орсны дараа захиална.
// Client болон server хоёуланд ашиглана.

export const LINK_STATUSES = ['NEW', 'QUOTED', 'PAID', 'ORDERED', 'CANCELLED'] as const
export type LinkStatus = typeof LINK_STATUSES[number]

export const LINK_STATUS: Record<LinkStatus, { label: string; user: string; tone: 'muted' | 'blue' | 'yellow' | 'green' | 'red' }> = {
  NEW: { label: 'Шинэ', user: 'Үнэ тооцоолж байна', tone: 'blue' },
  QUOTED: { label: 'Үнэ илгээсэн', user: 'Төлбөр хүлээж байна', tone: 'yellow' },
  PAID: { label: 'Төлбөр орсон', user: 'Төлбөр баталгаажсан', tone: 'green' },
  ORDERED: { label: 'Захиалсан', user: 'Захиалагдсан', tone: 'green' },
  CANCELLED: { label: 'Цуцалсан', user: 'Цуцлагдсан', tone: 'red' },
}

export const MAX_ITEMS_PER_REQUEST = 10
export const MAX_ITEMS_PER_DAY = 50

export interface LinkItemInput { url: string; quantity: number; note: string }

// Линк: http(s) хаяг. Taobao аппаас хуулсан "【淘宝】… https://m.tb.cn/…" зэрэг текстээс хаягийг нь салгаж авна
export function extractUrl(raw: string): string | null {
  const m = raw.match(/https?:\/\/[^\s<>"'，。】）]+/i)
  if (!m) return null
  try {
    const u = new URL(m[0])
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString().slice(0, 1000) : null
  } catch {
    return null
  }
}

export function sanitizeItems(input: unknown): { items: LinkItemInput[]; error: string | null } {
  if (!Array.isArray(input) || input.length === 0) return { items: [], error: 'Линк оруулна уу' }
  if (input.length > MAX_ITEMS_PER_REQUEST) return { items: [], error: `Нэг удаад ${MAX_ITEMS_PER_REQUEST} хүртэл линк илгээнэ` }
  const items: LinkItemInput[] = []
  for (const [i, raw] of input.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>
    const url = extractUrl(String(r.url ?? ''))
    if (!url) return { items: [], error: `${i + 1}-р мөр: линк буруу байна (https://… хэлбэртэй)` }
    const q = Math.floor(Number(r.quantity))
    const quantity = Number.isFinite(q) && q >= 1 ? Math.min(q, 999) : 1
    const note = String(r.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
    items.push({ url, quantity, note })
  }
  return { items, error: null }
}

// Линкийн домэйн — жагсаалтад товч харуулна (item.taobao.com → taobao.com)
export function linkHost(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^(www|m|item|detail|mobile)\./, '')
    return h
  } catch {
    return url.slice(0, 40)
  }
}

export function money(v: number | string | null | undefined): string {
  return v == null || v === '' ? '—' : `₮${Math.round(Number(v)).toLocaleString('en-US')}`
}
