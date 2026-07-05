import { prisma } from '@/lib/prisma'

// Түгээмэл асуултуудад LLM дуудалгүй, DB + template-ээр шууд хариулдаг router.
// Таарвал { matched: true, reply } — таараагүй бол LLM руу унана.

export type RouteResult = { matched: true; reply: string } | { matched: false }

const STATUS_MN: Record<string, string> = {
  REGISTERED: 'бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'ирсэн',
  PICKED_UP: 'авсан',
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function has(q: string, words: string[]): boolean {
  return words.some(w => q.includes(w))
}

export async function routeUserQuestion(
  question: string,
  userId: number,
  cargoId: number
): Promise<RouteResult> {
  const q = question.toLowerCase().trim()
  if (!q) return { matched: false }

  const cargo = await (prisma.cargo as any).findUnique({
    where: { id: cargoId },
    select: {
      batchEnabled: true, arrivedLabel: true, ereemLabel: true,
      contactInfo: true, tariff: true,
      bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true,
      ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true,
    },
  })
  if (!cargo) return { matched: false }

  const batchMode: boolean = !!cargo.batchEnabled
  const arrivedName = cargo.arrivedLabel || (batchMode ? 'УБ руу ачигдсан' : 'ирсэн')
  const ereenName = cargo.ereemLabel || 'Эрээнд ирсэн'

  // ── 1. Track код шиг токен (8+ тэмдэгт, дотроо 6+ цифртэй) ──
  const tokens = question.toUpperCase().match(/[A-Z0-9-]{8,25}/g) ?? []
  const codeToken = tokens.find(t => (t.match(/\d/g)?.length ?? 0) >= 6)
  if (codeToken) {
    const shipment = await prisma.shipment.findFirst({
      where: { userId, cargoId, trackCode: { contains: codeToken } },
      orderBy: { updatedAt: 'desc' },
      select: { trackCode: true, status: true, adminPrice: true, updatedAt: true },
    })
    if (!shipment) {
      return { matched: true, reply: `${codeToken} кодтой ачаа таны бүртгэлд олдсонгүй. Кодоо шалгаад дахин оролдоно уу.` }
    }
    const statusName = shipment.status === 'ARRIVED' ? arrivedName
      : shipment.status === 'EREEN_ARRIVED' ? ereenName
      : STATUS_MN[shipment.status] ?? shipment.status
    const price = shipment.adminPrice ? ` Төлбөр: ${batchMode ? '¥' : '₮'}${Number(shipment.adminPrice).toLocaleString()}.` : ''
    return {
      matched: true,
      reply: `${shipment.trackCode} — ${statusName} (${fmtDate(new Date(shipment.updatedAt))}).${price}`,
    }
  }

  // ── 2. Данс / шилжүүлэг ──
  if (has(q, ['данс', 'шилжүүл', 'банк', 'iban', 'dans'])) {
    if (!cargo.bankAccountNumber) {
      return { matched: true, reply: 'Дансны мэдээлэл бүртгэгдээгүй байна. Каргогийн админтай холбогдоно уу.' }
    }
    const lines = [
      cargo.bankName && `Банк: ${cargo.bankName}`,
      `Данс: ${cargo.bankAccountNumber}`,
      cargo.bankAccountHolder && `Хүлээн авагч: ${cargo.bankAccountHolder}`,
      cargo.bankTransferNote && `⚠ ${cargo.bankTransferNote}`,
    ].filter(Boolean)
    return { matched: true, reply: lines.join('\n') }
  }

  // ── 3. Эрээний хаяг (компанийн хаягаас өмнө шалгана) ──
  if (has(q, ['эрээн', 'ereen', 'хятад хаяг', 'таобао', 'taobao', '收货'])) {
    if (!cargo.ereemReceiver && !cargo.ereemAddress) {
      return { matched: true, reply: 'Эрээний хаяг бүртгэгдээгүй байна. Каргогийн админтай холбогдоно уу.' }
    }
    const lines = [
      cargo.ereemReceiver && `收货人: ${cargo.ereemReceiver}`,
      cargo.ereemPhone && `手机号: ${cargo.ereemPhone}`,
      cargo.ereemRegion && `地区: ${cargo.ereemRegion}`,
      cargo.ereemAddress && `地址: ${cargo.ereemAddress}`,
    ].filter(Boolean)
    return { matched: true, reply: lines.join('\n') }
  }

  // ── 4. Тариф ──
  if (has(q, ['тариф', 'ханш', 'кг ', ' кг', 'киллограм', 'tarif'])) {
    return {
      matched: true,
      reply: cargo.tariff?.trim() || 'Тарифын мэдээлэл оруулаагүй байна. Каргогийн админтай холбогдоно уу.',
    }
  }

  // ── 5. Ажлын цаг / хаяг / холбоо барих ──
  if (has(q, ['цаг', 'ажилла', 'хаяг', 'хаанаас ав', 'байрлал', 'холбо', 'утас'])) {
    return {
      matched: true,
      reply: cargo.contactInfo?.trim() || 'Холбоо барих мэдээлэл оруулаагүй байна.',
    }
  }

  // ── 6. Төлбөр / өр ──
  if (has(q, ['төлбөр', 'төлөх', 'өр ', 'хэд төл', 'хэдэн төгрөг', 'мөнгө', 'tolbor'])) {
    if (batchMode) {
      // Батч горим: авахаар хүлээгдэж буй багцуудын ¥ нийлбэр
      const batches = await (prisma as any).batch.findMany({
        where: { cargoId, status: 'ARRIVED', userId },
        select: { price: true, shipments: { select: { id: true } } },
      })
      if (batches.length === 0) {
        return { matched: true, reply: 'Танд одоогоор төлөх дүн алга — авахаар хүлээгдэж буй багц байхгүй байна.' }
      }
      const total = batches.reduce((s: number, b: any) => s + Number(b.price), 0)
      const items = batches.reduce((s: number, b: any) => s + b.shipments.length, 0)
      return { matched: true, reply: `Таны төлөх дүн: ¥${total.toLocaleString()} (${batches.length} багц · ${items} ачаа).` }
    }
    const arrived = await prisma.shipment.findMany({
      where: { userId, cargoId, status: 'ARRIVED', archived: false },
      select: { adminPrice: true },
    })
    if (arrived.length === 0) {
      return { matched: true, reply: 'Танд одоогоор төлөх дүн алга — ирсэн ачаа байхгүй байна.' }
    }
    const total = arrived.reduce((s, x) => s + Number(x.adminPrice ?? 0), 0)
    return {
      matched: true,
      reply: total > 0
        ? `Таны төлөх дүн: ₮${total.toLocaleString()} (${arrived.length} ачаа).`
        : `Танд ${arrived.length} ирсэн ачаа байгаа ч үнэ тавигдаагүй байна. Админ үнийг оруулсны дараа харагдана.`,
    }
  }

  // ── 7. Ачааны байдал / ирсэн эсэх ──
  if (has(q, ['ирсэн', 'ирээ', 'ирэв', 'ирж бай', 'хаана', 'яваа', 'явц', 'статус', 'байдал', 'ачаа', 'irsen', 'haana'])) {
    const [counts, batchCounts] = await Promise.all([
      prisma.shipment.groupBy({
        by: ['status'],
        where: { userId, cargoId, archived: false, ...(batchMode ? { batchId: null } as any : {}) },
        _count: { id: true },
      }),
      batchMode
        ? (prisma as any).batch.groupBy({
            by: ['status'],
            where: { cargoId, userId },
            _count: { id: true },
          })
        : Promise.resolve([]),
    ])
    const c: Record<string, number> = {}
    for (const row of counts as any[]) c[row.status] = row._count.id
    const bc: Record<string, number> = {}
    for (const row of batchCounts as any[]) bc[row.status] = row._count.id

    const parts: string[] = []
    if (c.REGISTERED) parts.push(`бүртгүүлсэн ${c.REGISTERED}`)
    if (!batchMode && c.EREEN_ARRIVED) parts.push(`${ereenName} ${c.EREEN_ARRIVED}`)
    const arrivedCount = (c.ARRIVED ?? 0)
    if (arrivedCount) parts.push(`${arrivedName} ${arrivedCount}`)
    if (bc.ARRIVED) parts.push(`${arrivedName} багц ${bc.ARRIVED}`)
    if (c.PICKED_UP) parts.push(`авсан ${c.PICKED_UP}`)
    if (bc.PICKED_UP) parts.push(`авсан багц ${bc.PICKED_UP}`)

    if (parts.length === 0) {
      return { matched: true, reply: 'Танд одоогоор бүртгэлтэй ачаа алга. Трак кодоо бүртгүүлбэл энд харагдана.' }
    }
    return { matched: true, reply: `Таны ачаа: ${parts.join(', ')}.` }
  }

  return { matched: false }
}
