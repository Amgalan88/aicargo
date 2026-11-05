import { parsePhone } from '@/lib/phone'

const MAX_NAME = 100
const MAX_NOTE = 1000

export interface BotOrderInput {
  trackCode: string
  phone: string
  name: string
  note: string | null
}

// note → Shipment.description. Утас нь аппын бусад хэсэгтэй адил 8 орон (976 угтвар хасна).
export function parseBotOrderBody(body: unknown): { ok: true; value: BotOrderInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'JSON body шаардлагатай' }
  }
  const b = body as Record<string, unknown>
  if (typeof b.trackCode !== 'string' || !b.trackCode.trim()) {
    return { ok: false, error: 'Трак код оруулна уу' }
  }
  if (typeof b.phone !== 'string' || !b.phone.trim()) {
    return { ok: false, error: 'Утас оруулна уу' }
  }
  const phone = parsePhone(b.phone)
  if (!phone) return { ok: false, error: 'Утасны дугаар 8 оронтой байна' }
  if (typeof b.name !== 'string' || !b.name.trim()) {
    return { ok: false, error: 'Нэр оруулна уу' }
  }
  const name = b.name.trim()
  if (name.length > MAX_NAME) return { ok: false, error: 'Нэр хэт урт байна' }
  if (b.note != null && typeof b.note !== 'string') {
    return { ok: false, error: 'Тэмдэглэл буруу байна' }
  }
  const note = typeof b.note === 'string' ? b.note.trim() : ''
  if (note.length > MAX_NOTE) return { ok: false, error: 'Тэмдэглэл хэт урт байна' }
  return { ok: true, value: { trackCode: b.trackCode, phone, name, note: note || null } }
}
