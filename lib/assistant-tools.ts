// Админы AI туслахын хэрэгслүүд (Claude tool use). Бүгд ЗӨВХӨН УНШИНА, бүгд cargoId-аар хязгаарлагдана.
// cargoId нь нэвтрэлтийн токеноос ирнэ — загвар өөр каргоны мэдээлэл авах боломжгүй.
import { Prisma } from '@prisma/client'
import type { Db } from './loyalty'
import { ubDayRange } from './ub-date'
import { answerToday, answerTop, answerWaiting, type AssistantAnswer } from './assistant'
import { BILLING_PLANS, GRACE_DAYS, PRICE_PER_PERIOD, billingState, formatBillingDate } from './billing'

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

export type ToolOpts = { linkOrders: boolean; promo: boolean; dispatch: boolean; batch: boolean; isOwner: boolean }
const OBJ = (properties: Record<string, unknown> = {}, required?: string[]): Schema => ({ type: 'object', properties, ...(required ? { required } : {}) })

export function assistantTools(opts: ToolOpts): AssistantToolDef[] {
  return [
    {
      name: 'shipments_query',
      description: 'Ачааг уян хатан шүүж тоолно: төлөв, огноо (бүртгүүлсэн / Эрээнд ирсэн / УБ-д ирсэн), утас, утасгүй эсэхээр. Нийт тоо, үнэ, өдрөөр эсвэл төлвөөр бүлэглэсэн тоо, жишээ мөрүүд. Жш "өнгөрсөн 7 хоногт Эрээнд хэдэн ачаа ирсэн", "энэ сард хэдэн трак бүртгүүлсэн".',
      input_schema: OBJ({
        status: { type: 'string', enum: ['any', 'REGISTERED', 'EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'], description: 'REGISTERED бүртгүүлсэн, EREEN_ARRIVED Эрээнд ирсэн, ARRIVED УБ-д ирсэн (агуулахад), PICKED_UP олгосон' },
        date_field: { type: 'string', enum: ['registered', 'ereen_arrived', 'ub_arrived'], description: 'from/to аль огноогоор шүүх (анхдагч registered)' },
        ...DATE_RANGE,
        phone: { type: 'string', description: 'Утасны дугаар (хэсэгчлэн)' },
        no_phone: { type: 'boolean', description: 'Зөвхөн утасгүй ачаа' },
        include_archived: { type: 'boolean', description: 'Архивласныг оруулах (анхдагч үгүй)' },
        group_by: { type: 'string', enum: ['none', 'day', 'status'], description: 'day — огноогоор өдөр бүр (92 хоног хүртэл), status — төлвөөр' },
        show_rows: { type: 'integer', description: 'Жишээ мөр хэдийг харуулах (0-20, анхдагч 0)' },
      }),
    },
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
    { name: 'website_billing', description: 'AiCargo вэбсайтын (системийн) үйлчилгээний төлбөр: хэзээ хүртэл төлсөн, хэдэн хоног үлдсэн, хугацаа дууссан бол хэзээ хаагдах, сарын үнэ, урт хугацааны хөнгөлөлттэй багц, хэрхэн төлөх.', input_schema: { type: 'object', properties: {} } },
    { name: 'cargo_settings', description: 'Каргоны өөрийн тохиргоо: Эрээний хаяг, хүлээн авагч, тариф ба үнэ бодогч (куб, жин, шатлал), холбоо барих мэдээлэл, хэрэглэгчдэд харагдах данс, төлөвийн нэр, ажилтан админы тоо.', input_schema: { type: 'object', properties: {} } },
    { name: 'admin_notifications', description: 'Админы хонхны мэдэгдлүүд (шинэ ачаа, өөр каргоны ачаа гэх мэт): уншаагүй тоо, сүүлийн мэдэгдлүүд.', input_schema: OBJ() },
    { name: 'customer_content', description: 'Хэрэглэгчдэд харагдах контент: FAQ (асуулт-хариулт), идэвхтэй баннер / зарлал.', input_schema: OBJ() },
    { name: 'loyalty_summary', description: 'Урамшуулал (оноо, VIP): асаалттай эсэх, оноо цуглуулах / зарцуулах дүрэм, VIP шатууд, гараар VIP оноосон хүний тоо.', input_schema: OBJ() },
    ...(opts.linkOrders ? [{
      name: 'link_orders_summary',
      description: 'Линк захиалга: төлөв бүрийн тоо, энэ сард төлөгдсөн дүн, хамгийн удаан хариу хүлээж буй шинэ захиалга. list_status өгвөл тэр төлвийн сүүлийн захиалгуудыг жагсаана.',
      input_schema: OBJ({ list_status: { type: 'string', enum: ['NEW', 'QUOTED', 'PAID', 'ORDERED', 'CANCELLED'] }, limit: { type: 'integer', description: 'Жагсаалтын урт (анхдагч 10, дээд 20)' } }),
    }] : []),
    ...(opts.promo ? [{
      name: 'promo_summary',
      description: 'Промо код (агент): код бүрийн агент, шимтгэлийн %, идэвхтэй эсэх, хэрэглэгчийн тоо, тухайн сард шинэ гишүүн, олголт, төлсөн дүн, агентын шимтгэл.',
      input_schema: OBJ({ month: { type: 'string', description: 'YYYY-MM (анхдагч энэ сар)' } }),
    }] : []),
    ...(opts.dispatch && !opts.batch ? [{ name: 'dispatch_reports', description: 'Тулгалт: Эрээнээс сонгож ачсан ачилт бүрийн огноо, нэр, нийт ачаа, УБ-д ирсэн, ирээгүй, илүү ирсэн тоо.', input_schema: OBJ({ limit: { type: 'integer', description: 'Сүүлийн хэдэн ачилт (анхдагч 5, дээд 20)' } }) }] : []),
    ...(opts.batch ? [{ name: 'batches_summary', description: 'Багц горим: төлөв бүрт хэдэн багц, нийт үнэ (валютаар).', input_schema: OBJ() }] : []),
    ...(opts.isOwner ? [
      {
        name: 'staff_and_audit',
        description: 'Зөвхөн эзэмшигчид: админ, ажилтнуудын жагсаалт ба эрх, мөн аудит лог — хэн, хэзээ, юу хийсэн (тохиргоо, олголт буцаалт, ажилтан нэмэх гэх мэт).',
        input_schema: OBJ({ days: { type: 'integer', description: 'Сүүлийн хэдэн хоног (анхдагч 7, дээд 90)' }, who: { type: 'string', description: 'Админы нэр (хэсэгчлэн)' }, action_contains: { type: 'string', description: 'Үйлдлийн нэрэнд агуулагдах үг' }, limit: { type: 'integer', description: 'Аудит мөр (анхдагч 20, дээд 40)' } }),
      },
      {
        name: 'shipment_changes',
        description: 'Зөвхөн эзэмшигчид: устгасан ачаа ба ачааны үнийн өөрчлөлт — хэн, хэзээ, хуучин / шинэ үнэ.',
        input_schema: OBJ({ kind: { type: 'string', enum: ['both', 'deleted', 'price'] }, days: { type: 'integer', description: 'Сүүлийн хэдэн хоног (анхдагч 30, дээд 180)' }, track_code: { type: 'string' }, limit: { type: 'integer', description: 'Мөрийн тоо (анхдагч 15, дээд 30)' } }),
      },
    ] : []),
  ]
}

const ubTime = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
const short = (s: string | null | undefined, n: number) => (s ? (s.length > n ? s.slice(0, n) + '…' : s) : null)
const DATE_FIELD = { registered: 'createdAt', ereen_arrived: 'ereenArrivedAt', ub_arrived: 'arrivedAt' } as const

export async function runAssistantTool(db: Db, cargoId: number, name: string, input: Input, now = new Date(), ctx: { isOwner: boolean } = { isOwner: false }): Promise<unknown> {
  switch (name) {
    case 'shipments_query': {
      const field = DATE_FIELD[(input.date_field as keyof typeof DATE_FIELD) ?? 'registered'] ?? 'createdAt'
      const where: Prisma.ShipmentWhereInput = { cargoId }
      const status = typeof input.status === 'string' && input.status !== 'any' && STATUS_MN[input.status] ? input.status as 'REGISTERED' : null
      if (status) where.status = status
      if (input.include_archived !== true) where.archived = false
      const digits = String(input.phone ?? '').replace(/\D/g, '')
      if (digits.length >= 4) where.phone = { contains: digits }
      if (input.no_phone === true) where.OR = [{ phone: null }, { phone: '' }]
      let range: Exclude<ReturnType<typeof dayRange>, string> | null = null
      if (input.from || input.to) {
        const r = dayRange(input, 366, now)
        if (typeof r === 'string') return { error: r }
        range = r
        where[field] = { gte: r.start, lte: r.end }
      }
      const agg = await db.shipment.aggregate({ where, _count: { _all: true }, _sum: { adminPrice: true } })
      const out: Record<string, unknown> = {
        filter: { status: status ? STATUS_MN[status] : 'бүх төлөв', date_field: input.date_field ?? 'registered', from: range?.from ?? null, to: range?.to ?? null },
        total: agg._count._all, total_price_mnt: num(agg._sum.adminPrice),
      }
      if (input.group_by === 'status') {
        const g = await db.shipment.groupBy({ by: ['status'], where, _count: { _all: true } })
        out.by_status = Object.fromEntries(g.map(x => [STATUS_MN[x.status] ?? x.status, x._count._all]))
      } else if (input.group_by === 'day') {
        if (!range || range.days > 92) return { error: 'Өдрөөр бүлэглэхэд from/to-г 92 хоног хүртэл өгнө' }
        const rows = await db.shipment.findMany({ where, select: { [field]: true, adminPrice: true }, take: 30000 }) as unknown as Record<string, unknown>[]
        const byDay = new Map<string, [number, number]>()
        for (const r of rows) {
          const d = r[field] as Date | null
          if (!d) continue
          const k = ubDate(d)
          const v = byDay.get(k) ?? [0, 0]
          v[0]++; v[1] += num(r.adminPrice)
          byDay.set(k, v)
        }
        out.by_day = [...byDay.entries()].sort().map(([k, [n, s]]) => [k, n, Math.round(s)])
        out.columns = ['өдөр', 'ачаа', '₮']
      }
      const show = clampInt(input.show_rows, 0, 0, 20)
      if (show) {
        const rows = await db.shipment.findMany({
          where, take: show, orderBy: { [field]: 'desc' },
          select: { trackCode: true, status: true, phone: true, adminPrice: true, createdAt: true, ereenArrivedAt: true, arrivedAt: true, user: { select: { name: true } } },
        })
        out.rows = rows.map(s => [s.trackCode, STATUS_MN[s.status] ?? s.status, s.user?.name ?? '', s.phone ?? '', s.adminPrice == null ? '' : num(s.adminPrice), ubDate((s[field as 'createdAt'] as Date | null) ?? s.createdAt)])
        out.row_columns = ['трак', 'төлөв', 'нэр', 'утас', '₮', 'огноо']
      }
      return out
    }

    case 'admin_notifications': {
      const [unread, recent] = await Promise.all([
        db.notification.count({ where: { cargoId, archived: false, read: false } }),
        db.notification.findMany({ where: { cargoId, archived: false }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, title: true, body: true, read: true, createdAt: true } }),
      ])
      const TYPE: Record<string, string> = { NEW_SHIPMENT: 'шинэ ачаа', CROSS_CARGO: 'өөр каргоны ачаа' }
      return { unread, recent: recent.map(n => ({ type: TYPE[n.type] ?? n.type, title: n.title, body: short(n.body, 160), read: n.read, at: ubTime(n.createdAt) })), where: 'Дээд талын «Мэдэгдэл» (хонх)' }
    }

    case 'customer_content': {
      const [faqs, banners] = await Promise.all([
        db.faq.findMany({ where: { cargoId }, orderBy: { order: 'asc' }, take: 30, select: { question: true, answer: true } }),
        db.banner.findMany({ where: { cargoId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { createdAt: 'desc' }, take: 5, select: { content: true, expiresAt: true, createdAt: true } }),
      ])
      return {
        faq: faqs.map(f => ({ q: f.question, a: short(f.answer, 200) })),
        active_banners: banners.map(b => ({ text: short(b.content, 200), since: ubDate(b.createdAt), until: b.expiresAt ? ubDate(b.expiresAt) : null })),
        where: '«FAQ» ба «Мэдэгдэл» цэс',
      }
    }

    case 'loyalty_summary': {
      const [s, manual] = await Promise.all([
        db.loyaltySettings.findUnique({ where: { cargoId } }),
        db.loyaltyAccount.count({ where: { cargoId, vipManualPct: { not: null }, OR: [{ vipManualUntil: null }, { vipManualUntil: { gt: now } }] } }),
      ])
      if (!s) return { enabled: false, note: 'Урамшуулал тохируулаагүй. «Урамшуулал» цэснээс асаана.' }
      return {
        points: s.pointsEnabled ? { enabled: true, earn_mnt_per_point: s.earnMntPerPoint, point_value_mnt: s.pointValueMnt, expiry_days: s.pointsExpiryDays, max_redeem_pct: s.maxRedeemPct } : { enabled: false },
        vip: s.vipEnabled ? { enabled: true, window_days: s.vipWindowDays, grace_days: s.vipGraceDays, tiers: s.vipTiers } : { enabled: false },
        manual_vip_people: manual,
        updated: s.updatedByName ? `${s.updatedByName}, ${ubDate(s.updatedAt)}` : null,
      }
    }

    case 'promo_summary': {
      const m = typeof input.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) ? input.month : ubDate(now).slice(0, 7)
      const { promoReport } = await import('./promo')
      const rep = await promoReport(db, cargoId, m)
      if (!rep) return { error: 'Сар буруу' }
      const tiered = await db.loyaltyAccount.count({ where: { cargoId, vipManualTier: { not: null } } })
      return {
        month: m, people_with_tier: tiered,
        codes: rep.map(c => ({ code: c.code, agent: c.agentName, commission_pct: c.commissionPct, active: c.active, members: c.members, new_members: c.newMembers, handovers: c.receipts, paid_mnt: c.paidMnt, commission_mnt: c.commissionMnt })),
      }
    }

    case 'dispatch_reports': {
      const limit = clampInt(input.limit, 5, 1, 20)
      const rows = await db.$queryRaw<{ date: Date; name: string | null; closed: Date | null; total: number; extra: number; arrived: number }[]>(Prisma.sql`
        SELECT d.date, d.name, d."closedAt" AS closed,
          count(i.id) FILTER (WHERE NOT i.extra)::int AS total,
          count(i.id) FILTER (WHERE i.extra)::int AS extra,
          count(i.id) FILTER (WHERE NOT i.extra AND s.status::text IN ('ARRIVED', 'PICKED_UP'))::int AS arrived
        FROM "Dispatch" d
        LEFT JOIN "DispatchItem" i ON i."dispatchId" = d.id
        LEFT JOIN "Shipment" s ON s."cargoId" = d."cargoId" AND s."trackCode" = i."trackCode"
        WHERE d."cargoId" = ${cargoId}
        GROUP BY d.id ORDER BY d.date DESC LIMIT ${limit}`)
      return { dispatches: rows.map(r => ({ date: ubDate(r.date), name: r.name, closed: !!r.closed, shipped: r.total, arrived: r.arrived, missing: r.total - r.arrived, extra: r.extra })), where: '«Тулгалт» цэс' }
    }

    case 'batches_summary': {
      const g = await db.batch.groupBy({ by: ['status', 'currency'], where: { cargoId }, _count: { _all: true }, _sum: { price: true } })
      return { by_status: g.map(x => ({ status: STATUS_MN[x.status] ?? x.status, currency: x.currency, batches: x._count._all, total: num(x._sum.price) })) }
    }

    case 'staff_and_audit': {
      if (!ctx.isOwner) return { error: 'Зөвхөн каргоны эзэмшигч харна' }
      const days = clampInt(input.days, 7, 1, 90)
      const who = typeof input.who === 'string' ? input.who.trim().slice(0, 40) : ''
      const act = typeof input.action_contains === 'string' ? input.action_contains.trim().slice(0, 40) : ''
      const [admins, logs] = await Promise.all([
        db.user.findMany({ where: { cargoId, role: 'ADMIN' }, select: { name: true, phone: true, isStaffAdmin: true, canEditBank: true, canEditAddress: true, canEditLogo: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
        db.adminAuditLog.findMany({
          where: { cargoId, createdAt: { gte: new Date(now.getTime() - days * DAY) }, ...(who ? { userName: { contains: who, mode: 'insensitive' } } : {}), ...(act ? { OR: [{ action: { contains: act, mode: 'insensitive' } }, { detail: { contains: act, mode: 'insensitive' } }] } : {}) },
          orderBy: { createdAt: 'desc' }, take: clampInt(input.limit, 20, 1, 40), select: { userName: true, action: true, detail: true, createdAt: true },
        }),
      ])
      return {
        admins: admins.map(a => ({ name: a.name, phone: a.phone, role: a.isStaffAdmin ? 'ажилтан' : 'эзэмшигч', can_edit: [a.canEditBank && 'данс', a.canEditAddress && 'хаяг', a.canEditLogo && 'лого'].filter(Boolean), since: ubDate(a.createdAt) })),
        audit: logs.map(l => [ubTime(l.createdAt), l.userName, l.action, short(l.detail, 140) ?? '']),
        audit_columns: ['цаг', 'хэн', 'үйлдэл', 'дэлгэрэнгүй'],
        where: '«Аудит лог» цэс',
      }
    }

    case 'shipment_changes': {
      if (!ctx.isOwner) return { error: 'Зөвхөн каргоны эзэмшигч харна' }
      const since = new Date(now.getTime() - clampInt(input.days, 30, 1, 180) * DAY)
      const limit = clampInt(input.limit, 15, 1, 30)
      const code = typeof input.track_code === 'string' ? input.track_code.trim().toUpperCase().slice(0, 40) : ''
      const kind = input.kind === 'deleted' || input.kind === 'price' ? input.kind : 'both'
      const out: Record<string, unknown> = {}
      if (kind !== 'price') {
        const del = await db.shipmentDeletion.findMany({
          where: { cargoId, deletedAt: { gte: since }, ...(code ? { trackCode: { contains: code, mode: 'insensitive' } } : {}) },
          orderBy: { deletedAt: 'desc' }, take: limit,
          select: { trackCode: true, phone: true, customerName: true, status: true, source: true, deletedByName: true, deletedAt: true },
        })
        out.deleted = del.map(d => [ubTime(d.deletedAt), d.deletedByName, d.trackCode, STATUS_MN[d.status] ?? d.status, d.customerName ?? '', d.phone ?? ''])
        out.deleted_columns = ['цаг', 'хэн устгасан', 'трак', 'төлөв', 'нэр', 'утас']
      }
      if (kind !== 'deleted') {
        const pc = await db.shipmentPriceChange.findMany({
          where: { cargoId, createdAt: { gte: since }, ...(code ? { trackCode: { contains: code, mode: 'insensitive' } } : {}) },
          orderBy: { createdAt: 'desc' }, take: limit,
          select: { trackCode: true, oldPrice: true, newPrice: true, actorName: true, createdAt: true },
        })
        out.price_changes = pc.map(p => [ubTime(p.createdAt), p.actorName, p.trackCode, p.oldPrice == null ? '' : num(p.oldPrice), p.newPrice == null ? '' : num(p.newPrice)])
        out.price_columns = ['цаг', 'хэн', 'трак', 'хуучин ₮', 'шинэ ₮']
      }
      return out
    }

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
        ...(typeof input.list_status === 'string' && LINK_MN[input.list_status] ? {
          list: (await db.linkOrder.findMany({
            where: { cargoId, status: input.list_status }, orderBy: { createdAt: 'desc' }, take: clampInt(input.limit, 10, 1, 20),
            select: { name: true, phone: true, quantity: true, price: true, paidAmount: true, createdAt: true, trackCode: true },
          })).map(o => [ubDate(o.createdAt), o.name, o.phone, o.quantity, o.price == null ? '' : num(o.price), o.paidAmount == null ? '' : num(o.paidAmount), o.trackCode ?? '']),
          list_columns: ['огноо', 'нэр', 'утас', 'ширхэг', 'үнэ ₮', 'төлсөн ₮', 'трак'],
        } : {}),
        where: '«Линк захиалга» цэс',
      }
    }

    case 'website_billing': {
      const [c, payments] = await Promise.all([
        db.cargo.findUnique({ where: { id: cargoId }, select: { paidUntil: true } }),
        db.billingPayment.findMany({ where: { cargoId, status: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 5, select: { paidAt: true, periods: true, amount: true } }),
      ])
      const st = billingState(c?.paidUntil, now)
      const pay = {
        how_to_pay: '«Вэбсайтын төлбөр» цэс (онлайн төлбөр эсвэл банкны шилжүүлэг)',
        price_per_30_days_mnt: PRICE_PER_PERIOD,
        plans: BILLING_PLANS.map(p => `${p.months} сар ашиглаж ${p.paid} сарын төлбөр`),
      }
      if (!c?.paidUntil || !st) return { paid_until: null, note: 'Төлбөрийн хугацаа тохируулаагүй байна', ...pay }
      const blockOn = new Date(new Date(c.paidUntil).getTime() + (GRACE_DAYS + 1) * DAY)
      return {
        paid_until: formatBillingDate(c.paidUntil),
        status: st.blocked ? 'хаагдсан' : st.inGrace ? `хугацаа дууссан, ${GRACE_DAYS} хоногийн сануулгатай хугацаанд` : 'идэвхтэй',
        days_left: Math.max(0, st.daysLeft),
        overdue_days: st.overdueDays,
        ...(st.overdueDays > 0 && !st.blocked ? { blocks_on: formatBillingDate(blockOn) } : {}),
        grace_days_after_expiry: GRACE_DAYS,
        recent_online_payments: payments.map(p => [p.paidAt ? ubDate(p.paidAt) : '', `${p.periods} сар`, num(p.amount)]),
        ...pay,
      }
    }

    case 'cargo_settings': {
      const [c, staff] = await Promise.all([
        db.cargo.findUnique({
          where: { id: cargoId },
          select: { ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, ereemTitle: true, tariff: true, priceCubic: true, priceWeight: true, priceWeightUnit: true, priceWeightTiers: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, arrivedLabel: true, ereemLabel: true, announcement: true },
        }),
        db.user.count({ where: { cargoId, role: 'ADMIN', isStaffAdmin: true } }),
      ])
      if (!c) return { error: 'Карго олдсонгүй' }
      let tiers: unknown = null
      try { tiers = c.priceWeightTiers ? JSON.parse(String(c.priceWeightTiers)) : null } catch {}
      return {
        ereen_address: { title: c.ereemTitle, receiver: c.ereemReceiver, phone: c.ereemPhone, region: c.ereemRegion, address: c.ereemAddress },
        tariff_text: c.tariff,
        price_per_cubic_mnt: c.priceCubic == null ? null : num(c.priceCubic),
        price_per_weight_mnt: c.priceWeight == null ? null : num(c.priceWeight), weight_unit: c.priceWeightUnit, weight_tiers: tiers,
        contact_info: c.contactInfo, announcement: c.announcement,
        customer_bank: { bank: c.bankName, holder: c.bankAccountHolder, account: c.bankAccountNumber },
        status_labels: { ereen_arrived: c.ereemLabel || 'Эрээнд ирсэн', arrived: c.arrivedLabel || 'Ирсэн' },
        staff_admins: staff,
        where_to_change: '«Тохиргоо» цэс',
      }
    }

    default:
      return { error: `Тодорхойгүй хэрэгсэл: ${name}` }
  }
}
