import webpush from 'web-push'
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

// Эрээнд ирсэн ачааг эзэнд нь мэдэгдэнэ — нэг хэрэглэгчийн олон ачааг нэг мэдэгдэл болгоно.
// label: каргогийн өөрийн төлөвийн нэр (жш: "Эрээнээс ачигдсан"), хоосон бол "Эрээнд ирлээ"
export async function notifyEreenArrived(rows: { userId: number | null; trackCode: string }[], label?: string | null): Promise<void> {
  if (!ready()) return
  const byUser = new Map<number, string[]>()
  for (const r of rows) {
    if (!r.userId) continue
    const list = byUser.get(r.userId) ?? []
    if (!list.includes(r.trackCode)) list.push(r.trackCode)
    byUser.set(r.userId, list)
  }
  if (!byUser.size) return
  const messages = [...byUser.entries()].map(([userId, codes]) => ({
    userId,
    payload: {
      kind: 'ereen' as const,
      tag: 'ereen',
      codes,
      title: label?.trim()
        ? `📦 ${codes.length > 1 ? `${codes.length} ачаа` : 'Ачаа'} · ${label.trim()}`
        : codes.length > 1 ? `📦 ${codes.length} ачаа Эрээнд ирлээ` : '📦 Ачаа Эрээнд ирлээ',
      body: codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : ''),
      url: '/orders',
    },
  }))
  await sendPushToUsers(messages).catch(e => console.error('ereen push', e))
}

// Каргогийн "Эрээнд ирсэн" шошгыг аваад мэдэгдэнэ — route-ууд after() дотроос дуудна
export async function notifyEreenForCargo(cargoId: number, rows: { userId: number | null; trackCode: string }[]): Promise<void> {
  if (!ready() || !rows.some(r => r.userId)) return
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { ereemLabel: true } }).catch(() => null)
  await notifyEreenArrived(rows, cargo?.ereemLabel)
}
