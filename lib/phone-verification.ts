// Утас баталгаажуулалтын логик (Verify.MN). UI текстгүй — алдааны кодыг буцаана.
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createSession, getStatus, newCode, verifyMode, type VerifyStatus } from './verify-mn'

export const VERIFICATION_VALID_MINUTES = 60 // баталгаажсанаас хойш хэдэн минутын дотор бүртгүүлж болох
export const MAX_ATTEMPTS = 3 // нэг дугаарт 10 минутад
const ATTEMPT_WINDOW_MS = 10 * 60_000

// signup — шинэ бүртгэл, reset — нууц үг сэргээх, move — өөр каргогийн бүртгэлийг шилжүүлэх
export type Purpose = 'signup' | 'reset' | 'move'

export type StartResult =
  | { ok: true; id: string; code: string; shortcode: string; expiresAt: string; mock: boolean }
  | { ok: false; error: 'badPhone' | 'phoneTaken' | 'needsMove' | 'noAccount' | 'cantMove' | 'unavailable' | 'tooMany' }

// Монгол дугаар 8 оронтой; зай, зураас, +976-г хасна
export function normalizePhone(raw: string) {
  return raw.replace(/\D/g, '').replace(/^976(?=\d{8}$)/, '')
}

// SMS илгээхээс өмнө бүх шалгалтыг хийнэ — хэрэглэгч 150₮-өө дэмий төлөхгүй
export async function startVerification(rawPhone: string, cargoId: number | null, purpose: Purpose = 'signup'): Promise<StartResult> {
  const phone = normalizePhone(rawPhone)
  if (!/^\d{8}$/.test(phone)) return { ok: false, error: 'badPhone' }

  const existing = await prisma.user.findUnique({ where: { phone }, select: { cargoId: true, role: true } })
  if (purpose === 'signup') {
    // Өөр каргод бүртгэлтэй бол шилжих урсгал руу — энд SMS шаардахгүй
    if (existing) return { ok: false, error: existing.cargoId === cargoId ? 'phoneTaken' : 'needsMove' }
  } else if (purpose === 'reset') {
    // Бүртгэлгүй дугаарт хэрэглэгч 150₮ дэмий төлөхгүйн тулд эрт хэлнэ
    if (!existing) return { ok: false, error: 'noAccount' }
  } else if (!existing || existing.role !== 'USER' || existing.cargoId === cargoId) {
    // Шилжүүлэхэд зөвхөн өөр каргогийн энгийн хэрэглэгч (админ эрхийг энд шилжүүлэхгүй)
    return { ok: false, error: 'cantMove' }
  }

  const mode = verifyMode()
  if (mode === 'off') return { ok: false, error: 'unavailable' }

  const recent = await prisma.phoneVerification.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - ATTEMPT_WINDOW_MS) } },
  })
  if (recent >= MAX_ATTEMPTS) return { ok: false, error: 'tooMany' }

  const id = crypto.randomUUID()
  const code = newCode()
  // Verify.MN нийтийн https:// callback шаардана; localhost дээр зөвхөн polling
  const appUrl = process.env.APP_URL
  const callback = appUrl?.startsWith('https://') ? `${appUrl}/api/verify/callback?v=${id}` : undefined

  let session
  try {
    session = await createSession(phone, code, callback)
  } catch (e) {
    console.error('verify.mn createSession failed:', e)
    return { ok: false, error: 'unavailable' }
  }
  await prisma.phoneVerification.create({
    data: { id, phone, purpose, code: session.text, sessionId: session.sessionId, expiresAt: session.expiresAt },
  })
  return { ok: true, id, code: session.text, shortcode: session.shortcode, expiresAt: session.expiresAt.toISOString(), mock: mode === 'mock' }
}

// Хөтчийн polling болон callback дууддаг; олон удаа дуудахад аюулгүй
export async function refreshVerification(id: string): Promise<VerifyStatus> {
  const v = await prisma.phoneVerification.findUnique({ where: { id } })
  if (!v) return 'EXPIRED'
  if (v.verifiedAt) return 'VERIFIED'
  if (v.expiresAt <= new Date()) return 'EXPIRED'

  let status: VerifyStatus
  try {
    status = await getStatus(v.sessionId, v.createdAt)
  } catch {
    return 'PENDING' // түр алдаа — дараагийн polling дахин шалгана
  }
  if (status === 'VERIFIED') {
    await prisma.phoneVerification.updateMany({ where: { id, verifiedAt: null }, data: { verifiedAt: new Date() } })
  }
  return status
}

// Маягтын алдааг эрт харуулах шалгалт (хэрэглэхгүй)
export async function isVerified(id: string, phone: string, purpose: Purpose = 'signup') {
  if (!id || id.length > 64) return false
  const v = await prisma.phoneVerification.findUnique({ where: { id } })
  return !!v && v.phone === normalizePhone(phone) && v.purpose === purpose && !!v.verifiedAt && !v.usedAt
}

// Утас таарах, 60 минутын дотор баталгаажсан, хэрэглэгдээгүй байх ёстой; нэг алхамд "хэрэглэсэн" болгоно.
// Бусад шалгалт бүгд давсны дараа, хэрэглэгч үүсгэхийн яг өмнө дуудна.
export async function consumeVerification(id: string, phone: string, purpose: Purpose = 'signup') {
  if (!id || id.length > 64) return false
  const since = new Date(Date.now() - VERIFICATION_VALID_MINUTES * 60_000)
  const used = await prisma.phoneVerification.updateMany({
    where: { id, phone: normalizePhone(phone), purpose, verifiedAt: { not: null, gte: since }, usedAt: null },
    data: { usedAt: new Date() },
  })
  return used.count === 1
}
