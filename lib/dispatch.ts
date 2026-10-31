// Тулгалт (Cargo.dispatchEnabled, эзэмшигч асаана/унтраана): Эрээнээс ачигдсан бөөн кодыг ачааны одоогийн төлөвтэй тулгана.
// Ирсэн = ARRIVED эсвэл PICKED_UP; ирээгүй = ачилтад байсан, хараахан ирээгүй; илүү = ачилтад байгаагүй атлаа
// энэ ачилтаар «Ирсэн» бүртгэгдсэн (DispatchItem.extra).
import { prisma } from '@/lib/prisma'

export type DispatchStats = { loaded: number; arrived: number; missing: number; extra: number }

export async function dispatchEnabledFor(cargoId: number): Promise<boolean> {
  const c = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { dispatchEnabled: true } })
  return !!c?.dispatchEnabled
}

export async function statsFor(cargoId: number, dispatchIds: number[]): Promise<Map<number, DispatchStats>> {
  const out = new Map<number, DispatchStats>()
  if (!dispatchIds.length) return out
  const rows = await prisma.$queryRaw<{ id: number; loaded: bigint; arrived: bigint; extra: bigint }[]>`
    SELECT i."dispatchId" AS id,
      COUNT(*) FILTER (WHERE NOT i.extra) AS loaded,
      COUNT(*) FILTER (WHERE NOT i.extra AND s.status IN ('ARRIVED', 'PICKED_UP')) AS arrived,
      COUNT(*) FILTER (WHERE i.extra) AS extra
    FROM "DispatchItem" i
    LEFT JOIN "Shipment" s ON s."cargoId" = ${cargoId} AND s."trackCode" = i."trackCode"
    WHERE i."dispatchId" = ANY(${dispatchIds}::int[])
    GROUP BY i."dispatchId"`
  for (const r of rows) {
    const loaded = Number(r.loaded), arrived = Number(r.arrived)
    out.set(r.id, { loaded, arrived, missing: loaded - arrived, extra: Number(r.extra) })
  }
  return out
}

// «Ирсэн» бүртгэлийн дараа: ачилтад байсан кодыг буцаана, байгаагүйг «илүү» болгон хадгална
export async function markArrivals(dispatchId: number, codes: string[]): Promise<{ inDispatch: string[]; extra: string[] }> {
  if (!codes.length) return { inDispatch: [], extra: [] }
  const listed = await prisma.dispatchItem.findMany({
    where: { dispatchId, trackCode: { in: codes }, extra: false },
    select: { trackCode: true },
  })
  const inSet = new Set(listed.map(x => x.trackCode))
  const extra = codes.filter(c => !inSet.has(c))
  if (extra.length) {
    await prisma.dispatchItem.createMany({ data: extra.map(trackCode => ({ dispatchId, trackCode, extra: true })), skipDuplicates: true })
  }
  return { inDispatch: codes.filter(c => inSet.has(c)), extra }
}

// Хүсэлтэд ирсэн dispatchId энэ каргынх, нээлттэй, тохиргоо асаалттай эсэх
export async function openDispatchId(cargoId: number, raw: unknown): Promise<number | null> {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  const d = await prisma.dispatch.findFirst({
    where: { id, cargoId, closedAt: null, cargo: { dispatchEnabled: true } },
    select: { id: true },
  })
  return d?.id ?? null
}
