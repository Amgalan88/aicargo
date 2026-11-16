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
  if (!code) return { ok: false, status: 400, error: 'Трак код оруулна уу' }
  if (input.existingIdInCargo != null && input.existingIdInCargo !== input.shipment.id) {
    return { ok: false, status: 409, error: 'Энэ трак код энэ каргод бүртгэлтэй байна' }
  }
  return { ok: true, code, changed: code !== input.shipment.trackCode }
}
