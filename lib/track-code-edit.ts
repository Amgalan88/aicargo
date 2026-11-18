// Ажилтан трак код засахад: цэвэрлэх дүрэм нь бүртгэлтэй ижил (parseArrivedCode),
// давхардлыг зөвхөн энэ карго дотор шалгана. DB руу хандахгүй — дуудагч нь хайлтаа өгнө.

import { parseArrivedCode } from './track-code'

export type TrackCodePlan =
  | { ok: true; code: string; changed: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string }

export function planTrackCodeEdit(input: {
  raw: unknown
  /** Null when this id is not in the caller's cargo. */
  shipment: { id: number; trackCode: string; cargoId: number } | null
  callerCargoId: number
  /** Id of a shipment in the caller's cargo that already stores the normalized code. */
  existingIdInCargo: number | null
}): TrackCodePlan {
  if (!input.shipment || input.shipment.cargoId !== input.callerCargoId) {
    return { ok: false, status: 404, error: 'Ачаа олдсонгүй' }
  }
  const code = parseArrivedCode(input.raw)
  if (!code) {
    // Хуучин мөр дээр "8888" мэт код үлдсэн байж болно. Яг тэр кодоо дахин хадгалах
    // (үнэ засах) боломжтой хэвээр; шинэ богино/тэмдэгттэй код руу солихгүй.
    const text = String(input.raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
    const stored = input.shipment.trackCode.trim().replace(/\s+/g, ' ').toUpperCase()
    if (text && text === stored) return { ok: true, code: input.shipment.trackCode, changed: false }
    return { ok: false, status: 400, error: text ? 'Трак код 6–60 тэмдэгт, зөвхөн үсэг, тоо, зураас байна' : 'Трак код оруулна уу' }
  }
  if (input.existingIdInCargo != null && input.existingIdInCargo !== input.shipment.id) {
    return { ok: false, status: 409, error: 'Энэ трак код энэ каргод бүртгэлтэй байна' }
  }
  return { ok: true, code, changed: code !== input.shipment.trackCode }
}

// Хоосон бол үнэгүй (null). 0 зөвшөөрнө. Сөрөг, тоо биш утгыг татгалзана.
// Хадгалах хэлбэр нь одоогийн үнэ хадгалалттай адил: Number (бутархайг тоймлохгүй).
export function parseStaffPrice(raw: unknown): { ok: true; price: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, price: null }
  const s = String(raw).trim().replace(/₮/g, '').replace(/,/g, '')
  if (!s) return { ok: true, price: null }
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Үнэ 0 буюу түүнээс их тоо байна' }
  return { ok: true, price: n }
}

export type StaffEditPlan =
  | { ok: true; trackCode?: string; price?: number | null }
  | { ok: false; status: 400 | 404 | 409; error: string }

/** trackCode / adminPrice байхгүй (undefined) бол тэр талбарыг хөндөхгүй. */
export function planStaffEdit(input: {
  shipment: { id: number; trackCode: string; cargoId: number } | null
  callerCargoId: number
  trackCode?: unknown
  adminPrice?: unknown
  existingIdInCargo: number | null
}): StaffEditPlan {
  if (!input.shipment || input.shipment.cargoId !== input.callerCargoId) {
    return { ok: false, status: 404, error: 'Ачаа олдсонгүй' }
  }
  const out: { ok: true; trackCode?: string; price?: number | null } = { ok: true }
  if (input.trackCode !== undefined) {
    const code = planTrackCodeEdit({
      raw: input.trackCode,
      shipment: input.shipment,
      callerCargoId: input.callerCargoId,
      existingIdInCargo: input.existingIdInCargo,
    })
    if (!code.ok) return code
    if (code.changed) out.trackCode = code.code
  }
  if (input.adminPrice !== undefined) {
    const price = parseStaffPrice(input.adminPrice)
    if (!price.ok) return { ok: false, status: 400, error: price.error }
    out.price = price.price
  }
  return out
}
