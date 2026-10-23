// Verify.MN API: хэрэглэгч өөрийн утаснаасаа 144773 руу кодоо SMS-ээр илгээнэ — илгээгчийн дугаар таарвал эзэн нь мөн.
// Callback бол зөвхөн дохио — үр дүнг үргэлж GET /sessions/:id-ээр шалгана.
import crypto from 'node:crypto'

const BASE = 'https://api.verify.mn'
const MOCK_VERIFY_AFTER_MS = 4000

export type VerifySession = { sessionId: string; shortcode: string; text: string; expiresAt: Date }
export type VerifyStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED'

// Түлхүүр байвал үргэлж жинхэнэ горим. Туршилтын горим (VERIFY_MN_MOCK=1) production-д хэзээ ч асахгүй —
// асвал хэн ч SMS-гүйгээр бүртгүүлэх цоорхой болно.
export function verifyMode(): 'live' | 'mock' | 'off' {
  if (process.env.VERIFY_MN_API_KEY) return 'live'
  if (process.env.VERIFY_MN_MOCK === '1' && process.env.VERCEL_ENV !== 'production') return 'mock'
  return 'off'
}

export function newCode() {
  return String(crypto.randomInt(100000, 1000000))
}

// Хариу SMS: зөвхөн латин үсэг/тоо, 160 тэмдэгт хүртэл (Unitel өөрийн текстийг, Lime юу ч илгээдэггүй)
const RESPONSE_SMS = 'AiCargo: utasny dugaar batalgaajlaa. Bayarlalaa!'

export async function createSession(phone: string, text: string, callback?: string): Promise<VerifySession> {
  if (verifyMode() === 'mock') {
    return {
      sessionId: `mock_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      shortcode: '144773',
      text,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    }
  }
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VERIFY_MN_API_KEY}` },
    body: JSON.stringify({ phone, text, ...(callback ? { callback } : {}), responseSms: RESPONSE_SMS }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`verify.mn ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return {
    sessionId: String(data.sessionId),
    shortcode: String(data.shortcode ?? '144773'),
    text: String(data.text ?? text),
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 5 * 60_000),
  }
}

// GET /sessions/:id нэвтрэлт шаарддаггүй — sessionId өөрөө нууц тул зөвхөн серверт хадгална
export async function getStatus(sessionId: string, createdAt: Date): Promise<VerifyStatus> {
  if (sessionId.startsWith('mock_')) {
    if (verifyMode() !== 'mock') return 'EXPIRED'
    return Date.now() - createdAt.getTime() > MOCK_VERIFY_AFTER_MS ? 'VERIFIED' : 'PENDING'
  }
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`verify.mn ${res.status}`)
  const data = await res.json()
  const s = String(data.sessionStatus)
  return s === 'VERIFIED' || s === 'EXPIRED' ? s : 'PENDING'
}
