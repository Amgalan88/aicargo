// Вэбсайтын төлбөрийн дүрэм — admin, super admin, сервер бүгд энэ нэг тооцоог ашиглана (client-д ч ажиллана)
//
// Хугацаа дуусахад admin GRACE_DAYS хоног үргэлжлүүлэн ажиллаж болно (сануулгатай), дараа нь систем хаагдана.
// Зөвхөн ашигласан хоногийн төлбөр авна:
//   шинэ дуусах огноо = max(хуучин дуусах огноо, төлсөн өдөр − GRACE_DAYS) + сар × PERIOD_DAYS
//   • хугацаа дуусахаас өмнө төлбөл — хуучин огнооноос үргэлжилнэ
//   • хаагдахаас өмнө (GRACE_DAYS дотор) төлбөл — хуучин огнооноос (ашигласан хоног тооцогдоно)
//   • хаагдсаны дараа төлбөл — хаагдсан хугацаа тооцогдохгүй; ашигласан GRACE_DAYS л хасагдана

export const PRICE_PER_PERIOD = 50_000
export const PERIOD_DAYS = 30
export const GRACE_DAYS = 10

export const BILLING_BANK = { name: 'Хаан банк', account: '5119007473', holder: 'Энхамгалан' }
export const BILLING_PHONE = '85205258'

const DAY = 86_400_000

// Огнооны оролт (YYYY-MM-DD) UTC шөнө дундаар хадгалагддаг — тооцоо ч өдрөөр
function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export interface BillingState {
  daysLeft: number        // дуусах хүртэл (сөрөг бол хэтэрсэн)
  overdueDays: number     // дууссанаас хойш өнгөрсөн хоног (0 бол дуусаагүй)
  inGrace: boolean        // дууссан ч ажиллаж болох хугацаанд
  blocked: boolean        // хаагдсан
  graceUsed: number       // дууссаны дараа ашигласан (төлбөрт тооцогдох) хоног
}

export function billingState(paidUntil: Date | string | null | undefined, now = new Date()): BillingState | null {
  if (!paidUntil) return null
  const until = new Date(paidUntil).getTime()
  const past = now.getTime() - until
  const daysLeft = Math.floor((until - now.getTime()) / DAY)
  // Дууссанаас хойш бүтэн өнгөрсөн хоног — GRACE_DAYS-ээс хэтэрмэгц хаагдана (өмнөх дүрэмтэй ижил)
  const overdueDays = past >= 0 ? Math.floor(past / DAY) : 0
  return {
    daysLeft,
    overdueDays,
    inGrace: past >= 0 && overdueDays <= GRACE_DAYS,
    blocked: overdueDays > GRACE_DAYS,
    graceUsed: Math.min(overdueDays, GRACE_DAYS),
  }
}

// Төлбөр хүлээн авахад шинэ дуусах огноо
export function renewedUntil(paidUntil: Date | string | null | undefined, periods: number, paidOn = new Date()): Date {
  const pay = dayStart(paidOn)
  const old = paidUntil ? dayStart(new Date(paidUntil)) : pay
  const base = Math.max(old, pay - GRACE_DAYS * DAY)
  return new Date(base + periods * PERIOD_DAYS * DAY)
}

// Төлсөн өдрөөс хойш хэдэн хоног ашиглах вэ (жш: хаагдсаны дараа 1 сар төлбөл 20)
export function daysFrom(until: Date, from = new Date()): number {
  return Math.round((dayStart(until) - dayStart(from)) / DAY)
}

export function formatBillingDate(d: Date | string): string {
  const x = new Date(d)
  return `${x.getUTCFullYear()}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${String(x.getUTCDate()).padStart(2, '0')}`
}
