// Админы туслахын бэлэн асуултын хариулт — DB-ээс бодит тоо гаргана, AI ашиглахгүй (үнэгүй).
// Бүх query cargoId-аар хязгаарлагдана; cargoId нь нэвтрэлтийн токеноос ирнэ.
import type { Db } from './loyalty'
import { ubDayRange } from './ub-date'

export type AssistantItem = { title: string; sub: string; value: string }
export type AssistantAnswer = { text: string; items?: AssistantItem[]; note?: string }
export const ASSISTANT_QUESTIONS = ['today', 'waiting', 'top'] as const
export type AssistantQuestion = (typeof ASSISTANT_QUESTIONS)[number]

const DAY = 86_400_000
const WAIT_DAYS = 7
const TOP_DAYS = 90
const WAIT_SCAN_LIMIT = 5000

export const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
const ubDate = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const md = (d: Date) => { const u = new Date(d.getTime() + 8 * 3600_000); return `${u.getUTCMonth() + 1}/${u.getUTCDate()}` }

export type WaitingRow = { phone: string | null; userId: number | null; adminPrice: unknown; arrivedAt: Date | null; updatedAt: Date }
export type WaitingGroup = { phone: string; userId: number | null; count: number; amount: number; days: number }

// Удаан аваагүй ачааг утсаар нь бүлэглэнэ (утасгүй ачаа '' бүлэгт). Хамгийн удсан нь эхэнд.
export function groupWaiting(rows: WaitingRow[], now: Date): WaitingGroup[] {
  const map = new Map<string, WaitingGroup>()
  for (const r of rows) {
    const phone = r.phone?.trim() ?? ''
    const days = Math.floor((now.getTime() - (r.arrivedAt ?? r.updatedAt).getTime()) / DAY)
    const g = map.get(phone) ?? { phone, userId: null, count: 0, amount: 0, days: 0 }
    g.count++
    g.amount += Number(r.adminPrice ?? 0) || 0
    g.days = Math.max(g.days, days)
    g.userId ??= r.userId
    map.set(phone, g)
  }
  return [...map.values()].sort((a, b) => b.days - a.days || b.amount - a.amount)
}

const waitingWhere = (cargoId: number, before: Date) => ({
  cargoId, status: 'ARRIVED' as const, archived: false,
  OR: [{ arrivedAt: { lt: before } }, { arrivedAt: null, updatedAt: { lt: before } }],
})

export async function answerToday(db: Db, cargoId: number, now = new Date()): Promise<AssistantAnswer> {
  const day = ubDayRange(ubDate(now))!
  const weekAgo = new Date(now.getTime() - WAIT_DAYS * DAY)
  const [arrived, handed, old, phoneless] = await Promise.all([
    db.shipment.aggregate({
      where: { cargoId, arrivedAt: { gte: day.start, lte: day.end }, status: { in: ['ARRIVED', 'PICKED_UP'] } },
      _count: { _all: true }, _sum: { adminPrice: true },
    }),
    db.handoverReceipt.aggregate({
      where: { cargoId, voidedAt: null, createdAt: { gte: day.start, lte: day.end } },
      _count: { _all: true }, _sum: { itemCount: true, netMnt: true },
    }),
    db.shipment.count({ where: waitingWhere(cargoId, weekAgo) }),
    db.shipment.count({ where: { cargoId, status: 'ARRIVED', archived: false, userId: null, OR: [{ phone: null }, { phone: '' }] } }),
  ])
  const items: AssistantItem[] = [
    { title: 'Ирсэн', sub: `${arrived._count._all} ачаа`, value: tg(Number(arrived._sum.adminPrice ?? 0)) },
    { title: 'Олгосон', sub: `${handed._count._all} хүн · ${handed._sum.itemCount ?? 0} ачаа`, value: tg(Number(handed._sum.netMnt ?? 0)) },
    { title: `${WAIT_DAYS}+ хоног аваагүй`, sub: `${old} ачаа`, value: '' },
  ]
  if (phoneless) items.push({ title: 'Утасгүй ачаа', sub: `${phoneless} ачаа агуулахад`, value: '' })
  const quiet = !arrived._count._all && !handed._count._all
  return { text: quiet ? `Өнөөдөр (${md(now)}) одоогоор ачаа ирж, олгоогүй байна.` : `Өнөөдрийн тойм (${md(now)}):`, items }
}

export async function answerWaiting(db: Db, cargoId: number, now = new Date()): Promise<AssistantAnswer> {
  const rows = await db.shipment.findMany({
    where: waitingWhere(cargoId, new Date(now.getTime() - WAIT_DAYS * DAY)),
    select: { phone: true, userId: true, adminPrice: true, arrivedAt: true, updatedAt: true },
    take: WAIT_SCAN_LIMIT,
  })
  if (!rows.length) return { text: `${WAIT_DAYS} хоногоос дээш аваагүй ачаа алга байна.` }
  const groups = groupWaiting(rows, now)
  const top = groups.slice(0, 10)
  // Нэр: холбогдсон хэрэглэгчээс, эс бол тухайн каргод ижил утастай хэрэглэгчээс
  const ids = top.map(g => g.userId).filter((id): id is number => id != null)
  const phones = top.filter(g => g.userId == null && g.phone).map(g => g.phone)
  const users = ids.length || phones.length
    ? await db.user.findMany({ where: { OR: [{ id: { in: ids } }, { cargoId, phone: { in: phones } }] }, select: { id: true, name: true, phone: true } })
    : []
  const byId = new Map(users.map(u => [u.id, u.name]))
  const byPhone = new Map(users.map(u => [u.phone, u.name]))
  const nameOf = (g: WaitingGroup) => (g.userId != null && byId.get(g.userId)) || byPhone.get(g.phone) || 'Бүртгэлгүй'
  const people = groups.filter(g => g.phone).length
  const amount = groups.reduce((s, g) => s + g.amount, 0)
  return {
    text: `${WAIT_DAYS} хоногоос дээш аваагүй: ${people} хүн, ${rows.length} ачаа, нийт ${tg(amount)}. Хамгийн удсан ${top.length}:`,
    items: top.map(g => ({
      title: g.phone ? nameOf(g) : 'Утасгүй ачаа',
      sub: `${g.phone || '—'} · ${g.count} ачаа · ${g.days} хоног`,
      value: tg(g.amount),
    })),
    ...(rows.length === WAIT_SCAN_LIMIT ? { note: `Эхний ${WAIT_SCAN_LIMIT} ачаагаар тооцов.` } : {}),
  }
}

export async function answerTop(db: Db, cargoId: number, now = new Date()): Promise<AssistantAnswer> {
  const since = new Date(now.getTime() - TOP_DAYS * DAY)
  const base = { cargoId, voidedAt: null, createdAt: { gte: since } }
  const [groups, all, first] = await Promise.all([
    db.handoverReceipt.groupBy({
      by: ['phone'],
      where: { ...base, AND: [{ phone: { not: null } }, { phone: { not: '' } }] },
      _sum: { netMnt: true, itemCount: true },
      orderBy: { _sum: { netMnt: 'desc' } },
      take: 10,
    }),
    db.handoverReceipt.aggregate({ where: base, _sum: { netMnt: true } }),
    db.handoverReceipt.findFirst({ where: { cargoId, voidedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])
  if (!groups.length) return { text: `Сүүлийн ${TOP_DAYS} хоногт олголтын баримт алга байна.` }
  const phones = groups.map(g => g.phone!)
  const users = await db.user.findMany({ where: { cargoId, phone: { in: phones } }, select: { phone: true, name: true } })
  const name = new Map(users.map(u => [u.phone, u.name]))
  const topSum = groups.reduce((s, g) => s + Number(g._sum.netMnt ?? 0), 0)
  const total = Number(all._sum.netMnt ?? 0)
  const share = total > 0 ? ` (бүх орлогын ${Math.round((topSum / total) * 100)}%)` : ''
  return {
    text: `Сүүлийн ${TOP_DAYS} хоногт хамгийн их төлсөн ${groups.length} хэрэглэгч, нийт ${tg(topSum)}${share}:`,
    items: groups.map(g => ({
      title: name.get(g.phone!) || 'Бүртгэлгүй',
      sub: `${g.phone} · ${g._sum.itemCount ?? 0} ачаа`,
      value: tg(Number(g._sum.netMnt ?? 0)),
    })),
    ...(first && first.createdAt > since ? { note: `Олголтын баримт ${md(first.createdAt)}-ээс хойш бүртгэгдэж эхэлсэн тул тэр өдрөөс хойших дүн.` } : {}),
  }
}

export function answerQuestion(db: Db, cargoId: number, q: AssistantQuestion, now = new Date()): Promise<AssistantAnswer> {
  if (q === 'today') return answerToday(db, cargoId, now)
  if (q === 'waiting') return answerWaiting(db, cargoId, now)
  return answerTop(db, cargoId, now)
}
