import type { Prisma } from '@prisma/client'

export type DeletionSource = 'ereen-single' | 'ereen-by-day' | 'ereen-all'

export const DELETION_SOURCE_LABELS: Record<string, string> = {
  'ereen-single': 'Эрээний жагсаалтаас ганцаар устгасан',
  'ereen-by-day': 'Эрээний ачааг өдрөөр сонгож устгасан',
  'ereen-all': '"Бүгдийг устгах" товчоор устгасан',
}

// Устгахын өмнө хадгалах талбарууд — findMany-д ашиглана
export const DELETION_SNAPSHOT_SELECT = {
  id: true, trackCode: true, phone: true, description: true, status: true, ereenArrivedAt: true, createdAt: true,
  user: { select: { name: true, phone: true } },
} as const

type Snapshot = Prisma.ShipmentGetPayload<{ select: typeof DELETION_SNAPSHOT_SELECT }>

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
