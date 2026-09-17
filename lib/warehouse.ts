// Эрээний түншлэгч агуулахын хамтын дүрмүүд — client болон server хоёуланд ашиглана

export const WAREHOUSE_IMAGE_CATEGORIES = [
  { value: 'EXTERIOR', label: 'Гадна тал' },
  { value: 'INTERIOR', label: 'Дотор тал' },
  { value: 'PACKING', label: 'Баглаа боодол' },
  { value: 'LOADING', label: 'Ачилт' },
  { value: 'GENERAL', label: 'Бусад' },
] as const

export type WarehouseImageCategory = typeof WAREHOUSE_IMAGE_CATEGORIES[number]['value']

export function isImageCategory(v: unknown): v is WarehouseImageCategory {
  return WAREHOUSE_IMAGE_CATEGORIES.some(c => c.value === v)
}

export function categoryLabel(v: string): string {
  return WAREHOUSE_IMAGE_CATEGORIES.find(c => c.value === v)?.label ?? 'Бусад'
}

export const MAX_GALLERY_IMAGES = 40

const WH_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

export function validateWarehouseSlug(slug: string): string | null {
  if (!WH_SLUG_RE.test(slug)) return 'Холбоос 3-50 тэмдэгт, зөвхөн латин жижиг үсэг, тоо, дундуур зураас (-) байна'
  if (/^\d+$/.test(slug)) return 'Холбоос зөвхөн тооноос тогтож болохгүй'
  return null
}

// Slug байхгүй агуулахыг id-гаар нь нээнэ
export function warehousePath(w: { id: number; slug: string | null }): string {
  return `/warehouses/${w.slug || w.id}`
}

// Жагсаалт/thumbnail-д жижиг хувилбарыг URL-аар нь авна (Cloudinary on-the-fly transform)
export function cloudinaryThumb(url: string, width: number): string {
  return url.includes('/upload/')
    ? url.replace('/upload/', `/upload/c_fill,w_${width},h_${Math.round(width * 0.66)},q_auto,f_auto/`)
    : url
}

export function formatMnt(v: number | string): string {
  return `${Math.round(Number(v)).toLocaleString('en-US')}₮`
}

// ── Зай талбай (хэсэг) ──

export const MAX_SECTIONS_PER_REQUEST = 200

export function normalizeSectionCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase().slice(0, 20)
}

// "A-" + 1..20 → ["A-1", …, "A-20"]; алдаа бол мессеж буцаана
export function expandSectionRange(prefix: string, from: number, to: number): string[] | string {
  const p = normalizeSectionCode(prefix)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
    return 'Дугаарын муж буруу байна'
  }
  if (to - from + 1 > MAX_SECTIONS_PER_REQUEST) {
    return `Нэг удаад хамгийн ихдээ ${MAX_SECTIONS_PER_REQUEST} хэсэг нэмнэ`
  }
  return Array.from({ length: to - from + 1 }, (_, i) => `${p}${from + i}`)
}

// A-2 нь A-10-аас өмнө орно
export function compareSectionCode(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}
