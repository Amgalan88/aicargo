// Админы AI туслахын хэрэгслүүд (Claude tool use). Бүгд ЗӨВХӨН УНШИНА, бүгд cargoId-аар хязгаарлагдана.
// cargoId нь нэвтрэлтийн токеноос ирнэ — загвар өөр каргоны мэдээлэл авах боломжгүй.
import { Prisma } from '@prisma/client'
import type { Db } from './loyalty'
import { ubDayRange } from './ub-date'
import { answerToday, answerTop, answerWaiting, type AssistantAnswer } from './assistant'

type Schema = { type: 'object'; properties: Record<string, unknown>; required?: string[] }
export type AssistantToolDef = { name: string; description: string; input_schema: Schema }
type Input = Record<string, unknown>

const DAY = 86_400_000
const STATUS_MN: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн (Эрээнд ирээгүй)', EREEN_ARRIVED: 'Эрээнд ирсэн', ARRIVED: 'Ирсэн (агуулахад, аваагүй)', PICKED_UP: 'Олгосон',
}
const LINK_MN: Record<string, string> = { NEW: 'Шинэ', QUOTED: 'Үнэ илгээсэн', PAID: 'Төлсөн', ORDERED: 'Захиалсан', CANCELLED: 'Цуцалсан' }

const ubDate = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const num = (v: unknown) => Number(v ?? 0) || 0
const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}
const flat = (a: AssistantAnswer) => ({ summary: a.text, rows: a.items?.map(i => [i.title, i.sub, i.value].filter(Boolean).join(' | ')), note: a.note })

// 'YYYY-MM-DD' хоёрыг УБ-ын бүтэн өдрийн хүрээ болгоно; дээд урт maxDays
function dayRange(input: Input, maxDays: number, now: Date): { start: Date; end: Date; from: string; to: string; days: number } | string {
  const today = ubDate(now)
  const from = typeof input.from === 'string' ? input.from : today
  const to = typeof input.to === 'string' ? input.to : from
  const a = ubDayRange(from), b = ubDayRange(to)
  if (!a || !b) return 'Огноо YYYY-MM-DD хэлбэртэй байх ёстой'
  if (a.start > b.start) return 'from нь to-гоос өмнө байх ёстой'
  const days = Math.round((b.start.getTime() - a.start.getTime()) / DAY) + 1
  if (days > maxDays) return `Хамгийн ихдээ ${maxDays} хоногийн хүрээ авна`
  return { start: a.start, end: b.end, from, to, days }
}

const DATE_RANGE = {
  from: { type: 'string', description: 'Эхлэх өдөр YYYY-MM-DD (Улаанбаатарын цаг). Өгөхгүй бол өнөөдөр.' },
  to: { type: 'string', description: 'Дуусах өдөр YYYY-MM-DD. Өгөхгүй бол from-той ижил.' },
}

export function assistantTools(opts: { linkOrders: boolean }): AssistantToolDef[] {
  return [
    { name: 'today_summary', description: 'Өнөөдрийн тойм: өнөөдөр ирсэн ачааны тоо, дүн; олгосон хүн, ачаа, орсон мөнгө; 7+ хоног аваагүй ачаа; утасгүй ачаа.', input_schema: { type: 'object', properties: {} } },
    { name: 'users_summary', description: 'Каргоны хэрэглэгчдийн тоо: нийт, утсаа баталгаажуулсан (Verify.MN), өнөөдөр / 7 хоногт / энэ сард шинээр бүртгүүлсэн.', input_schema: { type: 'object', properties: {} } },
    {
      name: 'find_customer',
      description: 'Хэрэглэгчийг утас (хэсэгчлэн ч болно) эсвэл нэрээр хайна. Хүн бүрийн ачааны төлөв, агуулахад хүлээгдэж буй дүн, төлсөн дүн, сүүлд авсан огноог буцаана. Аккаунтгүй утсаар бүртгэсэн ачааг ч олно.',
      input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Утасны дугаар (4+ орон) эсвэл нэр' } }, required: ['query'] },
    },
    {
      name: 'track_shipment',
      description: 'Трак кодоор ачааг хайна: төлөв, эзэн, утас, үнэ, тэмдэглэл, бүртгэсэн / Эрээнд ирсэн / УБ-д ирсэн / олгосон огноо.',
      input_schema: { type: 'object', properties: { track_code: { type: 'string', description: 'Трак код (бүтэн эсвэл сүүлийн хэсэг)' } }, required: ['track_code'] },
    },
    { name: 'shipment_counts', description: 'Одоо төлөв бүрт хэдэн ачаа байгаа (архивлаагүй): бүртгүүлсэн, Эрээнд ирсэн, УБ-д ирсэн (агуулахад), олгосон. Агуулахад байгаа ачааны нийт дүн, утасгүй ачаа.', input_schema: { type: 'object', properties: {} } },
    { name: 'arrivals_by_day', description: 'УБ-д ирсэн ачааг өдөр бүрээр: тоо, нийт үнэ (ирсэн огноогоор). Хамгийн ихдээ 62 хоног.', input_schema: { type: 'object', properties: DATE_RANGE } },
    { name: 'revenue', description: 'Олголтын орлого (бодитоор төлсөн, буцаагдсаныг хассан): олголтын тоо, ачаа, хөнгөлөлтийн өмнөх дүн, хөнгөлөлт, цэвэр орлого. 62 хүртэл хоног бол өдрөөр, түүнээс урт бол сараар задална (366 хоног хүртэл). Олголтын баримт 2026-11 сараас эхэлсэн.', input_schema: { type: 'object', properties: DATE_RANGE } },
    {
      name: 'waiting_customers',
      description: 'Ачаагаа удаан аваагүй хүмүүс: N хоногоос дээш агуулахад байгаа ачааг хүнээр нь бүлэглэж, хамгийн удсанаас нь.',
      input_schema: { type: 'object', properties: { min_days: { type: 'integer', description: 'Хэдэн хоногоос дээш (анхдагч 7)' }, limit: { type: 'integer', description: 'Хэдэн хүн (анхдагч 10, дээд 30)' } } },
    },
    {
      name: 'top_customers',
      description: 'Хамгийн их төлсөн (эсвэл хамгийн олон ачаа авсан) хэрэглэгчид, олголтын баримтаас.',
      input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'Сүүлийн хэдэн хоног (анхдагч 90, дээд 366)' }, limit: { type: 'integer', description: 'Хэдэн хүн (анхдагч 10, дээд 30)' }, order_by: { type: 'string', enum: ['paid', 'items'], description: 'paid — төлсөн дүнгээр, items — ачааны тоогоор' } } },
    },
    ...(opts.linkOrders ? [{ name: 'link_orders_summary', description: 'Линк захиалга: төлөв бүрийн тоо, энэ сард төлөгдсөн дүн, хариу хүлээж буй шинэ захиалга.', input_schema: { type: 'object' as const, properties: {} } }] : []),
  ]
}

export async function runAssistantTool(db: Db, cargoId: number, name: string, input: Input, now = new Date()): Promise<unknown> {
  switch (name) {
    case 'today_summary':
      return flat(await answerToday(db, cargoId, now))

    case 'users_summary': {
      const today = ubDayRange(ubDate(now))!
      const month = ubDayRange(ubDate(now).slice(0, 8) + '01')!
      const base = { cargoId, role: 'USER' as const }
      const [total, verified, newToday, new7, newMonth] = await Promise.all([
        db.user.count({ where: base }),
        db.user.count({ where: { ...base, phoneVerifiedAt: { not: null } } }),
        db.user.count({ where: { ...base, createdAt: { gte: today.start } } }),
        db.user.count({ where: { ...base, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
        db.user.count({ where: { ...base, createdAt: { gte: month.start } } }),
      ])
      return { total_users: total, phone_verified: verified, verified_pct: total ? Math.round((verified / total) * 100) : 0, new_today: newToday, new_last_7_days: new7, new_this_month: newMonth }
    }

    case 'find_customer': {
      const q = String(input.query ?? '').trim().slice(0, 60)
      if (q.length < 2) return { error: 'Хайх утга хэт богино' }
      const digits = q.replace(/\D/g, '')
      const byPhone = digits.length >= 4 && digits.length === q.replace(/[\s-]/g, '').length
      const users = await db.user.findMany({
        where: { cargoId, role: 'USER', ...(byPhone ? { phone: { contains: digits } } : { name: { contains: q, mode: 'insensitive' } }) },
        select: { id: true, name: true, phone: true, phoneVerifiedAt: true, createdAt: true },
        take: 5,
      })
      const phones = users.length ? users.map(u => u.phone) : byPhone && digits.length === 8 ? [digits] : []
      if (!phones.length) return { found: 0 }
      const [ships, receipts, last] = await Promise.all([
        db.shipment.groupBy({ by: ['phone', 'status'], where: { cargoId, archived: false, phone: { in: phones } }, _count: { _all: true }, _sum: { adminPrice: true } }),
        db.handoverReceipt.groupBy({ by: ['phone'], where: { cargoId, voidedAt: null, phone: { in: phones } }, _sum: { netMnt: true, itemCount: true } }),
        db.handoverReceipt.groupBy({ by: ['phone'], where: { cargoId, voidedAt: null, phone: { in: phones } }, _max: { createdAt: true } }),
      ])
      const people = phones.map(phone => {
        const u = users.find(x => x.phone === phone)
        const mine = ships.filter(s => s.phone === phone)
        const r = receipts.find(x => x.phone === phone)
        const l = last.find(x => x.phone === phone)?._max.createdAt
        return {
          name: u?.name ?? '(аккаунтгүй)', phone, has_account: !!u,
          phone_verified: u ? !!u.phoneVerifiedAt : null,
          registered: u ? ubDate(u.createdAt) : null,
          shipments: Object.fromEntries(mine.map(s => [STATUS_MN[s.status] ?? s.status, s._count._all])),
          waiting_in_warehouse_mnt: num(mine.find(s => s.status === 'ARRIVED')?._sum.adminPrice),
          paid_total_mnt: num(r?._sum.netMnt), picked_items_with_receipt: r?._sum.itemCount ?? 0,
          last_pickup: l ? ubDate(l) : null,
        }
      })
      return { found: people.length, people }
    }

    case 'track_shipment': {
      const code = String(input.track_code ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)
      if (code.length < 4) return { error: 'Трак код хэт богино' }
      const select = { trackCode: true, status: true, phone: true, adminPrice: true, adminNote: true, archived: true, createdAt: true, ereenArrivedAt: true, arrivedAt: true, user: { select: { name: true } }, receipt: { select: { createdAt: true, voidedAt: true } } } as const
      let rows = await db.shipment.findMany({ where: { cargoId, trackCode: { equals: code, mode: 'insensitive' } }, select, take: 1 })
      if (!rows.length) rows = await db.shipment.findMany({ where: { cargoId, trackCode: { contains: code, mode: 'insensitive' } }, select, take: 5 })
      if (!rows.length) return { found: 0 }
      return {
        found: rows.length,
        shipments: rows.map(s => ({
          track_code: s.trackCode, status: STATUS_MN[s.status] ?? s.status, archived: s.archived,
          owner: s.user?.name ?? null, phone: s.phone || null, price_mnt: s.adminPrice == null ? null : num(s.adminPrice), note: s.adminNote || null,
          registered: ubDate(s.createdAt), ereen_arrived: s.ereenArrivedAt ? ubDate(s.ereenArrivedAt) : null,
          ub_arrived: s.arrivedAt ? ubDate(s.arrivedAt) : null,
          picked_up: s.receipt && !s.receipt.voidedAt ? ubDate(s.receipt.createdAt) : null,
        })),
      }
    }

    case 'shipment_counts': {
      const [byStatus, phoneless] = await Promise.all([
        db.shipment.groupBy({ by: ['status'], where: { cargoId, archived: false }, _count: { _all: true }, _sum: { adminPrice: true } }),
        db.shipment.count({ where: { cargoId, status: 'ARRIVED', archived: false, userId: null, OR: [{ phone: null }, { phone: '' }] } }),
      ])
      return {
        by_status: Object.fromEntries(byStatus.map(s => [STATUS_MN[s.status] ?? s.status, s._count._all])),
        in_warehouse_value_mnt: num(byStatus.find(s => s.status === 'ARRIVED')?._sum.adminPrice),
        phoneless_in_warehouse: phoneless,
      }
    }

    case 'arrivals_by_day': {
      const r = dayRange(input, 62, now)
      if (typeof r === 'string') return { error: r }
      const rows = await db.$queryRaw<{ d: string; n: number; s: number }[]>(Prisma.sql`
        SELECT to_char(("arrivedAt" + interval '8 hours')::date, 'YYYY-MM-DD') AS d, count(*)::int AS n, coalesce(sum("adminPrice"), 0)::float AS s
        FROM "Shipment" WHERE "cargoId" = ${cargoId} AND status::text IN ('ARRIVED', 'PICKED_UP') AND "arrivedAt" BETWEEN ${r.start} AND ${r.end}
        GROUP BY 1 ORDER BY 1`)
      return { from: r.from, to: r.to, total_shipments: rows.reduce((a, x) => a + x.n, 0), total_mnt: Math.round(rows.reduce((a, x) => a + x.s, 0)), days: rows.map(x => [x.d, x.n, Math.round(x.s)]), columns: ['өдөр', 'ачаа', '₮'] }
    }

    case 'revenue': {
      const r = dayRange(input, 366, now)
      if (typeof r === 'string') return { error: r }
      const fmt = r.days <= 62 ? 'YYYY-MM-DD' : 'YYYY-MM'
      const rows = await db.$queryRaw<{ k: string; h: number; i: number; g: number; v: number; p: number; n: number }[]>(Prisma.sql`
        SELECT to_char("createdAt" + interval '8 hours', ${fmt}) AS k, count(*)::int AS h, coalesce(sum("itemCount"), 0)::int AS i,
          coalesce(sum("grossMnt"), 0)::float AS g, coalesce(sum("vipDiscountMnt"), 0)::float AS v, coalesce(sum("pointsRedeemedMnt"), 0)::float AS p, coalesce(sum("netMnt"), 0)::float AS n
        FROM "HandoverReceipt" WHERE "cargoId" = ${cargoId} AND "voidedAt" IS NULL AND "createdAt" BETWEEN ${r.start} AND ${r.end}
        GROUP BY 1 ORDER BY 1`)
      const sum = (f: 'h' | 'i' | 'g' | 'v' | 'p' | 'n') => Math.round(rows.reduce((a, x) => a + x[f], 0))
      return {
        from: r.from, to: r.to,
        totals: { handovers: sum('h'), items: sum('i'), gross_mnt: sum('g'), discount_mnt: sum('v') + sum('p'), net_mnt: sum('n') },
        [fmt === 'YYYY-MM' ? 'by_month' : 'by_day']: rows.map(x => [x.k, x.h, x.i, Math.round(x.n)]),
        columns: ['хугацаа', 'олголт', 'ачаа', 'цэвэр ₮'],
      }
    }

    case 'waiting_customers':
      return flat(await answerWaiting(db, cargoId, now, clampInt(input.min_days, 7, 1, 365), clampInt(input.limit, 10, 1, 30)))

    case 'top_customers':
      return flat(await answerTop(db, cargoId, now, clampInt(input.days, 90, 1, 366), clampInt(input.limit, 10, 1, 30), input.order_by === 'items' ? 'items' : 'paid'))

    case 'link_orders_summary': {
      const month = ubDayRange(ubDate(now).slice(0, 8) + '01')!
      const [byStatus, paid, oldestNew] = await Promise.all([
        db.linkOrder.groupBy({ by: ['status'], where: { cargoId }, _count: { _all: true } }),
        db.linkOrder.aggregate({ where: { cargoId, paidAt: { gte: month.start } }, _count: { _all: true }, _sum: { paidAmount: true } }),
        db.linkOrder.findFirst({ where: { cargoId, status: 'NEW' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ])
      return {
        by_status: Object.fromEntries(byStatus.map(s => [LINK_MN[s.status] ?? s.status, s._count._all])),
        paid_this_month: { orders: paid._count._all, mnt: num(paid._sum.paidAmount) },
        oldest_unanswered_new: oldestNew ? ubDate(oldestNew.createdAt) : null,
      }
    }

    default:
      return { error: `Тодорхойгүй хэрэгсэл: ${name}` }
  }
}
