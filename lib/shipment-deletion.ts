import type { Prisma } from '@prisma/client'

export type DeletionSource = 'ereen-single' | 'ereen-by-day' | 'ereen-all' | 'registered' | 'arrived-revert'

export const DELETION_SOURCE_LABELS: Record<string, string> = {
  'ereen-single': 'Эрээний жагсаалтаас ганцаар устгасан',
  'ereen-by-day': 'Эрээний ачааг өдрөөр сонгож устгасан',
  'ereen-all': '"Бүгдийг устгах" товчоор устгасан',
  'registered': 'Хэрэглэгчийн бүртгүүлсэн ачааг админ устгасан',
  'arrived-revert': '«Ирсэн»-ийг буцаахад устгасан (Excel/гараар шинээр үүссэн, Эрээнээр дамжаагүй)',
}

// Устгахын өмнө хадгалах талбарууд — findMany-д ашиглана
export const DELETION_SNAPSHOT_SELECT = {
  id: true, trackCode: true, phone: true, description: true, status: true, ereenArrivedAt: true, createdAt: true,
  user: { select: { name: true, phone: true } },
} as const

type Snapshot = Prisma.ShipmentGetPayload<{ select: typeof DELETION_SNAPSHOT_SELECT }>

// «Ирсэн» бүртгэлтэй ЗЭРЭГ шинээр үүссэн ачаа (Excel/гараар; хэрэглэгч бүртгээгүй, Эрээнээр дамжаагүй) —
// буцаахад өмнөх төлөв гэж байхгүй тул «Бүртгүүлсэн» болгохгүй, устгана (эс бөгөөс хэрэглэгчийн жагсаалтад хий бүртгэл үлдэнэ)
export function createdWithArrival(s: { createdAt: Date; arrivedAt: Date | null; ereenArrivedAt: Date | null }): boolean {
  return !s.ereenArrivedAt && !!s.arrivedAt && s.createdAt.getTime() >= s.arrivedAt.getTime() - 5000
}

// Устгасан ачаа бүрийг түүхэнд бичнэ — устгалтай НЭГ transaction-д дуудна
export async function recordDeletions(
  tx: Prisma.TransactionClient,
  cargoId: number,
  rows: Snapshot[],
  actor: { id: number; name: string },
  source: DeletionSource,
  note?: string | null,
) {
  if (!rows.length) return
  await tx.shipmentDeletion.createMany({
    data: rows.map(r => ({
      cargoId,
      trackCode: r.trackCode,
      phone: r.user?.phone ?? r.phone,
      customerName: r.user?.name ?? null,
      description: r.description,
      status: r.status,
      ereenArrivedAt: r.ereenArrivedAt,
      shipmentCreatedAt: r.createdAt,
      source,
      note: note ?? null,
      deletedById: actor.id,
      deletedByName: actor.name,
    })),
  })
}

// Хэрэглэгч урьдчилан бүртгүүлсэн (Эрээнээс өмнө үүссэн, эзэнтэй) ачаа — устгахад бүрмөсөн устгахгүй,
// «Бүртгүүлсэн» төлөвт буцаана. Админы шинээр үүсгэсэн эзэнгүй/хожим үүссэн бичлэг л устгагдана.
export function wasPreRegistered(r: Snapshot): boolean {
  if (!r.user) return false
  if (!r.ereenArrivedAt) return true
  return r.createdAt.getTime() < r.ereenArrivedAt.getTime() - 60_000
}

// Эрээний ачааг «устгах» — түүх бичээд, урьдчилан бүртгэлтэйг REGISTERED болгож, бусдыг устгана.
// Буцаах тоо: { deleted, reverted }
export async function removeEreenShipments(
  tx: Prisma.TransactionClient,
  cargoId: number,
  targets: Snapshot[],
  actor: { id: number; name: string },
  source: DeletionSource,
  note?: string | null,
): Promise<{ deleted: number; reverted: number }> {
  if (!targets.length) return { deleted: 0, reverted: 0 }
  await recordDeletions(tx, cargoId, targets, actor, source, note)
  const keep = targets.filter(wasPreRegistered).map(t => t.id)
  const drop = targets.filter(t => !wasPreRegistered(t)).map(t => t.id)
  const reverted = keep.length
    ? (await tx.shipment.updateMany({
        where: { id: { in: keep }, cargoId, status: 'EREEN_ARRIVED' },
        data: { status: 'REGISTERED', ereenArrivedAt: null },
      })).count
    : 0
  const deleted = drop.length
    ? (await tx.shipment.deleteMany({ where: { id: { in: drop }, cargoId, status: 'EREEN_ARRIVED' } })).count
    : 0
  return { deleted, reverted }
}
