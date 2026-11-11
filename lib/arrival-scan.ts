// «Ирсэн» уншуулалт (/admin/arrived): нэг ачааг уншуулах болон Excel импорт.
//
// Дүрэм:
// - Аль хэдийн Ирсэн/Олгосон ачааг дахин уншуулбал ирсэн огноо, үнэ, төлөвийг хөндөхгүй —
//   «Аль хэдийн ирсэн байна» анхааруулга буцаана.
// - Хоосон/буруу үнэ байгаа үнийг хэзээ ч арилгахгүй.
// - Бусад төлөвт (Бүртгүүлсэн, Эрээнд ирсэн, шинэ) — Ирсэн болгож, ирсэн огноо = одоо.
//
// Клиент талд ч (мессеж форматлах) импортлогддог тул prisma-г энд импортлохгүй.

export const ARRIVED_OR_LATER = ['ARRIVED', 'PICKED_UP'] as const

export function isArrivedOrLater(status: string | null | undefined): boolean {
  return status === 'ARRIVED' || status === 'PICKED_UP'
}

// Хоосон, буруу, сөрөг үнэ → undefined = байгаа үнэ хэвээр
export function parseScanPrice(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined
  const s = String(raw).trim()
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

const UB_OFFSET_MS = 8 * 3600_000

// YYYY.MM.DD HH:mm — Улаанбаатарын цагаар (сервер UTC-ээр ажилладаг)
export function formatUbDateTime(d: Date | string): string {
  const t = new Date(new Date(d).getTime() + UB_OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}.${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

export function formatTugrik(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? '₮' + n.toLocaleString('en-US') : null
}

export function alreadyArrivedMessage(s: { status: string; arrivedAt: Date | string | null; adminPrice: unknown }): string {
  const head = s.status === 'PICKED_UP' ? 'Аль хэдийн олгогдсон байна' : 'Аль хэдийн ирсэн байна'
  return `${head} (ирсэн: ${s.arrivedAt ? formatUbDateTime(s.arrivedAt) : '—'}, ${formatTugrik(s.adminPrice) ?? 'үнэгүй'})`
}

export type ScannedShipment = { id: number; status: string; arrivedAt: Date | null; adminPrice: unknown }

export type ArrivalWrite = {
  status: 'ARRIVED'
  arrivedAt: Date
  adminPrice?: number
  adminNote: string | null
  phone: string | null
  userId: number | null
}

export interface ArrivalScanStore<S extends ScannedShipment> {
  find(): Promise<S | null>
  owner(existing: S | null): Promise<{ phone: string | null; userId: number | null }>
  create(data: ArrivalWrite): Promise<S>
  // Ирсэн/Олгосон биш үед л бичнэ (зэрэг уншуулалтаас хамгаална); хамгаалалт таарахгүй бол null
  updateIfNotArrived(id: number, data: ArrivalWrite): Promise<S | null>
}

export type ArrivalScanResult<S> =
  | { kind: 'arrived'; shipment: S; previousStatus: string | null }
  | { kind: 'already-arrived'; shipment: S; message: string }

export class ArrivalScanConflictError extends Error {}

const isUniqueViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === 'P2002'

export async function scanArrival<S extends ScannedShipment>(
  store: ArrivalScanStore<S>,
  input: { price: unknown; note: unknown },
  now: Date = new Date(),
): Promise<ArrivalScanResult<S>> {
  const price = parseScanPrice(input.price)
  const adminNote = typeof input.note === 'string' && input.note ? input.note : null
  // Хоёр уншуулалт зэрэг ирвэл нөгөө нь түрүүлж бичсэн байж болно — дахин уншаад шийднэ
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await store.find()
    if (existing && isArrivedOrLater(existing.status)) {
      return { kind: 'already-arrived', shipment: existing, message: alreadyArrivedMessage(existing) }
    }
    const owner = await store.owner(existing)
    const data: ArrivalWrite = {
      status: 'ARRIVED', arrivedAt: now, adminNote, phone: owner.phone, userId: owner.userId,
      ...(price !== undefined ? { adminPrice: price } : {}),
    }
    if (existing) {
      const updated = await store.updateIfNotArrived(existing.id, data)
      if (updated) return { kind: 'arrived', shipment: updated, previousStatus: existing.status }
    } else {
      try {
        return { kind: 'arrived', shipment: await store.create(data), previousStatus: null }
      } catch (e) {
        if (!isUniqueViolation(e)) throw e
      }
    }
  }
  throw new ArrivalScanConflictError('Ачааг зэрэг өөрчилж байна — дахин уншуулна уу')
}

// Excel импорт: шинээр Ирсэн болох / аль хэдийн Ирсэн (огноо, үнэ, төлөв хөндөхгүй) / Олгосон (огт хөндөхгүй)
export function partitionArrivalImport(codes: string[], existingByCode: Map<string, { status: string }>) {
  const fresh: string[] = []
  const alreadyArrived: string[] = []
  const pickedUp: string[] = []
  for (const c of codes) {
    const status = existingByCode.get(c)?.status
    if (status === 'PICKED_UP') pickedUp.push(c)
    else if (status === 'ARRIVED') alreadyArrived.push(c)
    else fresh.push(c)
  }
  return { fresh, alreadyArrived, pickedUp }
}
