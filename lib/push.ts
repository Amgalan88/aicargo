import webpush from 'web-push'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'

// Web push илгээх. Түлхүүргүй орчинд (VAPID тохируулаагүй) чимээгүй алгасна — бусад үйлдлийг унагахгүй.
// Хүчингүй болсон бүртгэлийг (404/410 — апп устгасан, зөвшөөрлөө хассан) автоматаар устгана.

export interface PushPayload {
  title: string
  body: string
  url?: string
  // Ижил tag-тай мэдэгдэл овоолохгүй, нэг болж солигдоно (жш: 'ereen')
  tag?: string
  // Service worker нэгтгэхэд ашиглана (жш: Эрээнд ирсэн трак кодууд)
  kind?: 'ereen' | 'arrived'
  codes?: string[]
  // Service worker хэрэглэгчийн хэлээр (MN/EN/中文) текстийг дахин бүтээхэд ашиглана
  n?: number
  total?: number
  phone?: string
  cargo?: string
  label?: string
}

let configured: boolean | null = null
function ready(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  configured = !!(pub && priv)
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@aicargo.mn', pub!, priv!)
  return configured
}

export function pushConfigured(): boolean {
  return ready()
}

// Хэрэглэгч бүрт өөрийн агуулгатай мэдэгдэл илгээнэ. Буцаах утга: хэдэн хэрэглэгчид дор хаяж нэг төхөөрөмжид хүрсэн
export async function sendPushToUsers(messages: { userId: number; payload: PushPayload }[]): Promise<{ users: number; devices: number }> {
  if (!ready() || !messages.length) return { users: 0, devices: 0 }
  const byUser = new Map(messages.map(m => [m.userId, m.payload]))
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...byUser.keys()] } } })
  const reached = new Set<number>()
  const dead: number[] = []
  let devices = 0

  // Зэрэг 20-оор илгээнэ — олон хэрэглэгчтэй каргод функцийн хугацаа хэтрэхгүй
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(subs.slice(i, i + 20).map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(byUser.get(s.userId)),
          { TTL: 24 * 3600, urgency: 'normal' },
        )
        reached.add(s.userId)
        devices++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.id)
        else console.error('push error', code, (e as Error).message)
      }
    }))
  }
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {})
  return { users: reached.size, devices }
}

// ── Автомат мэдэгдэл: нэг хүнд төрөл тус бүрээр (Эрээн / Ирсэн) 4 цагт нэг л удаа ──
const THROTTLE_SECONDS = 4 * 3600
let redis: Redis | null | undefined
function getRedis(): Redis | null {
  if (redis !== undefined) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN
  redis = url && token ? new Redis({ url, token }) : null
  return redis
}

// Мэдэгдэл асаасан, сүүлийн 4 цагт энэ төрлийн мэдэгдэл аваагүй хэрэглэгчдийг шүүнэ (тэмдэглэгээг мөн тавина).
// Эрээн, Ирсэн тусдаа тоологдоно — "Ирсэн" мэдэгдэл Эрээний мэдэгдлийн улмаас алдагдахгүй
async function claimUsers(kind: 'ereen' | 'arrived', userIds: number[]): Promise<number[]> {
  const ids = [...new Set(userIds)]
  if (!ids.length) return []
  const subscribed = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } }, select: { userId: true }, distinct: ['userId'] })
  const withSub = subscribed.map(x => x.userId)
  const r = getRedis()
  if (!r) return withSub
  const out: number[] = []
  await Promise.all(withSub.map(async id => {
    // SET NX EX — 4 цагийн дотор аль хэдийн илгээсэн бол алгасна
    const ok = await r.set(`push:${kind}:u:${id}`, '1', { nx: true, ex: THROTTLE_SECONDS }).catch(() => 'OK')
    if (ok === 'OK') out.push(id)
  }))
  return out
}

function groupCodes(rows: { userId: number | null; trackCode: string }[]): Map<number, string[]> {
  const byUser = new Map<number, string[]>()
  for (const r of rows) {
    if (!r.userId) continue
    const list = byUser.get(r.userId) ?? []
    if (!list.includes(r.trackCode)) list.push(r.trackCode)
    byUser.set(r.userId, list)
  }
  return byUser
}

const codeList = (codes: string[]) => codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : '')

// Эрээнд ирсэн ачаа — нэг хэрэглэгчийн олон ачааг нэг мэдэгдэл болгоно.
// Каргогийн өөрийн "Эрээнд ирсэн" нэрийг (жш: "Эрээнээс ачигдсан") ашиглана
export async function notifyEreenForCargo(cargoId: number, rows: { userId: number | null; trackCode: string }[]): Promise<void> {
  if (!ready()) return
  const byUser = groupCodes(rows)
  const allowed = await claimUsers('ereen', [...byUser.keys()])
  if (!allowed.length) return
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { ereemLabel: true } }).catch(() => null)
  const label = cargo?.ereemLabel?.trim()
  await sendPushToUsers(allowed.map(userId => {
    const codes = byUser.get(userId)!
    return {
      userId,
      payload: {
        kind: 'ereen' as const, tag: 'ereen', codes, url: '/orders', label: label || undefined,
        title: label
          ? `📦 ${codes.length > 1 ? `${codes.length} ачаа` : 'Ачаа'} · ${label}`
          : codes.length > 1 ? `📦 ${codes.length} ачаа Эрээнд ирлээ` : '📦 Ачаа Эрээнд ирлээ',
        body: codeList(codes),
      },
    }
  })).catch(e => console.error('ereen push', e))
}

// Монголд ирсэн ачаа — хэрэглэгчийн одоо авахаар хүлээж буй БҮХ ирсэн ачааг тоолж, нийт дүнтэй нь мэдэгдэнэ
export async function notifyArrivedForCargo(cargoId: number, rows: { userId: number | null; trackCode: string }[]): Promise<void> {
  if (!ready()) return
  const allowed = await claimUsers('arrived', [...groupCodes(rows).keys()])
  if (!allowed.length) return
  const [cargo, users] = await Promise.all([
    prisma.cargo.findUnique({ where: { id: cargoId }, select: { name: true } }).catch(() => null),
    prisma.user.findMany({
      where: { id: { in: allowed } },
      select: { id: true, phone: true, shipments: { where: { cargoId, status: 'ARRIVED' }, select: { adminPrice: true } } },
    }),
  ])
  await sendPushToUsers(users.filter(u => u.shipments.length).map(u => {
    const n = u.shipments.length
    const total = u.shipments.reduce((sum, x) => sum + (x.adminPrice ? Number(x.adminPrice) : 0), 0)
    return {
      userId: u.id,
      payload: {
        kind: 'arrived' as const, tag: 'arrived', url: '/orders',
        n, total: Math.round(total), phone: u.phone, cargo: cargo?.name ?? undefined,
        title: `📦 Таны ${n} ачаа ирлээ`,
        body: `Таны ${u.phone} дугаар дээр ${n} ачаа ирсэн байна.${total > 0 ? ` Нийт ₮${Math.round(total).toLocaleString('en-US')}.` : ''}${cargo?.name ? ` — ${cargo.name}` : ''}`,
      },
    }
  })).catch(e => console.error('arrived push', e))
}
