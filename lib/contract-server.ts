import crypto from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  ContractBody, CargoValues, parseBody, renderBody, formatAmount, formatContractDate, formatDateTime,
  mnMoneyWords, cnMoneyWords, TERMINATION_NOTICE_DAYS, WEBSITE_BONUS_DAYS,
} from '@/lib/contract'
import { sendContractOtpEmail, sendContractEmail, sendGuestContractLinks } from '@/lib/mail'

type Db = PrismaClient | Prisma.TransactionClient

export const WAREHOUSE_CONTRACT_SELECT = {
  id: true, name: true, slug: true, active: true, acceptingContracts: true, address: true,
  legalNameMn: true, legalNameCn: true, registerNo: true, directorName: true,
  bankName: true, bankAccount: true, bankHolder: true, contractFee: true,
  pricePerTonCny: true, pricePerM3Cny: true, pricePerKgMnt: true,
} as const

export type ContractWarehouse = Prisma.PartnerWarehouseGetPayload<{ select: typeof WAREHOUSE_CONTRACT_SELECT }>

// Гэрээ хүлээн авахад дутуу байгаа тохиргоо — super admin-д харуулж, каргод гэрээ эхлүүлэхийг хаана
export function warehouseReadiness(wh: ContractWarehouse, hasTemplate: boolean): string[] {
  const missing: string[] = []
  if (!wh.legalNameMn) missing.push('Хуулийн нэр (монгол)')
  if (!wh.legalNameCn) missing.push('Хуулийн нэр (хятад)')
  if (!wh.registerNo) missing.push('Регистр')
  if (!wh.directorName) missing.push('Захирал')
  if (!wh.bankName || !wh.bankAccount || !wh.bankHolder) missing.push('Данс')
  if (!hasTemplate) missing.push('Гэрээний загвар')
  return missing
}

export function getLatestTemplate(db: Db, warehouseId: number) {
  return db.contractTemplate.findFirst({
    where: { warehouseId },
    orderBy: { version: 'desc' },
  })
}

function money(v: Prisma.Decimal | null): string {
  return v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Гэрээнд орох бүх хувьсагч. Данс, төлбөрийг гэрээн дээр хөлдөөсөн утгаас нь (байвал) авна
export function buildVars(args: {
  contractNo: string
  warehouse: ContractWarehouse
  values: CargoValues
  fee: Prisma.Decimal | number | string
  signDate?: Date | null
  payTo?: { bank: string | null; account: string | null; holder: string | null }
}): Record<string, string> {
  const { warehouse: wh, values } = args
  const fee = Number(args.fee)
  return {
    ...values,
    contractNo: args.contractNo,
    signDate: args.signDate ? formatContractDate(args.signDate) : '',
    whLegalNameMn: wh.legalNameMn ?? wh.name,
    whLegalNameCn: wh.legalNameCn ?? '',
    whRegisterNo: wh.registerNo ?? '',
    whDirector: wh.directorName ?? '',
    whAddress: wh.address ?? '',
    contractFee: formatAmount(fee),
    contractFeeWordsMn: mnMoneyWords(fee),
    contractFeeWordsCn: cnMoneyWords(fee),
    bankName: args.payTo?.bank ?? wh.bankName ?? '',
    bankAccount: args.payTo?.account ?? wh.bankAccount ?? '',
    bankHolder: args.payTo?.holder ?? wh.bankHolder ?? '',
    pricePerTonCny: money(wh.pricePerTonCny),
    pricePerM3Cny: money(wh.pricePerM3Cny),
    pricePerKgMnt: money(wh.pricePerKgMnt),
    noticeDays: String(TERMINATION_NOTICE_DAYS),
  }
}

export function hashBody(json: string): string {
  return crypto.createHash('sha256').update(json).digest('hex')
}

// Гарын үсэг зурсан бол хөлдөөсөн хувийг, үгүй бол одоогийн загвар + мэдээллээр шууд үүсгэнэ
export function contractBodyFor(c: {
  contractNo: string
  renderedBody: string | null
  values: string
  fee: Prisma.Decimal
  warehouse: ContractWarehouse
  template: { titleMn: string; titleCn: string; body: string }
}): ContractBody {
  if (c.renderedBody) return parseBody(c.renderedBody)
  const tpl: ContractBody = { titleMn: c.template.titleMn, titleCn: c.template.titleCn, clauses: parseBody(c.template.body).clauses }
  return renderBody(tpl, buildVars({
    contractNo: c.contractNo,
    warehouse: c.warehouse,
    values: safeValues(c.values),
    fee: c.fee,
  }))
}

export function safeValues(json: string): CargoValues {
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export async function addEvent(db: Db, contractId: number, actor: { id: number | null; name: string }, action: string, detail?: string | null) {
  await db.contractEvent.create({
    data: { contractId, actorId: actor.id, actorName: actor.name, action, detail: detail ?? null },
  })
}

// Гэрээ хүчин төгөлдөр болсон каргын вэбсайтын эрхийг 60 хоногоор сунгана (нэг гэрээнд нэг удаа).
// Эрх дуусаагүй бол үлдсэн хугацаан дээр нь нэмнэ. Олгосон бол шинэ дуусах огноог буцаана
export async function grantWebsiteBonus(db: Db, contractId: number, cargoId: number, actor: { id: number | null; name: string }): Promise<Date | null> {
  const now = new Date()
  const claimed = await db.warehouseContract.updateMany({
    where: { id: contractId, cargoId, websiteBonusAt: null },
    data: { websiteBonusAt: now },
  })
  if (claimed.count !== 1) return null
  const cargo = await db.cargo.findUnique({ where: { id: cargoId }, select: { paidUntil: true } })
  const base = cargo?.paidUntil && cargo.paidUntil > now ? cargo.paidUntil : now
  const paidUntil = new Date(base.getTime() + WEBSITE_BONUS_DAYS * 86_400_000)
  await db.cargo.update({ where: { id: cargoId }, data: { paidUntil } })
  await addEvent(db, contractId, actor, 'WEBSITE_BONUS', `Вэбсайтын эрх ${formatDateTime(paidUntil).slice(0, 10)} хүртэл`)
  return paidUntil
}

// Бүртгэлгүй хүний хүчинтэй гэрээ — "каргогоо нээх" саналд ашиглана
export function findSignupContract(token: string) {
  if (!ACCESS_TOKEN_RE.test(token)) return Promise.resolve(null)
  return prisma.warehouseContract.findFirst({
    where: { accessToken: token, cargoId: null, websiteBonusAt: null, status: { in: ['ACTIVE', 'TERMINATION_PENDING'] } },
    select: { id: true, contractNo: true, guestEmail: true, values: true, warehouse: { select: { name: true } } },
  })
}

export function contractNoFor(id: number, date = new Date()): string {
  return `AC${date.getFullYear()}-${String(id).padStart(5, '0')}`
}

// ── OTP ── Otp хүснэгтийг нууц үг сэргээхтэй хуваалцдаг тул email талбарт гэрээний түлхүүр угтварлана
function otpKey(contractId: number, email: string) {
  return `contract:${contractId}:${email.toLowerCase()}`
}

export async function issueContractOtp(contractId: number, email: string, contractNo: string, warehouseName: string) {
  const key = otpKey(contractId, email)
  await prisma.otp.updateMany({ where: { email: key, used: false }, data: { used: true } })
  const code = crypto.randomInt(100000, 1000000).toString()
  await prisma.otp.create({ data: { email: key, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } })
  await sendContractOtpEmail(email, code, contractNo, warehouseName)
}

export async function consumeContractOtp(db: Db, contractId: number, email: string, code: string): Promise<boolean> {
  const otp = await db.otp.findFirst({
    where: { email: otpKey(contractId, email), code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { id: 'desc' },
    select: { id: true },
  })
  if (!otp) return false
  const res = await db.otp.updateMany({ where: { id: otp.id, used: false }, data: { used: true } })
  return res.count === 1
}

// ── Мэдэгдэл ──

async function cargoOwnerEmails(cargoId: number): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { cargoId, role: 'ADMIN', isStaffAdmin: false, email: { not: null } },
    select: { email: true },
  })
  return users.map(u => u.email!).filter(Boolean)
}

async function superAdminEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', email: { not: null } },
    select: { email: true },
  })
  return users.map(u => u.email!).filter(Boolean)
}

// И-мэйл алдаа гол үйлдлийг унагаахгүй
export async function notifyCargo(cargoId: number, subject: string, lines: string[]) {
  try {
    const to = await cargoOwnerEmails(cargoId)
    if (to.length) await sendContractEmail(to, subject, lines)
  } catch (err) {
    console.error('notifyCargo failed:', subject, err)
  }
}

export async function notifySuper(subject: string, lines: string[]) {
  try {
    const to = await superAdminEmails()
    if (to.length) await sendContractEmail(to, subject, lines)
  } catch (err) {
    console.error('notifySuper failed:', subject, err)
  }
}

// Зочны гэрээний нууц холбоос — 192 бит санамсаргүй
export function newAccessToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

export const ACCESS_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

export function guestLink(token: string, origin?: string): string {
  return appUrl(`/contracts/g/${token}`, origin)
}

export async function sendGuestLinks(email: string, items: { warehouseName: string; contractNo: string; status: string; token: string }[], origin?: string) {
  await sendGuestContractLinks(email, items.map(i => ({ ...i, link: guestLink(i.token, origin) })))
}

// Б тал руу мэдэгдэл: бүртгэлтэй каргод эзэмшигч админ(ууд) руу, зочинд өөрийн нууц холбоосоор
export async function notifyParty(
  c: { id: number; cargoId: number | null; guestEmail: string | null; accessToken: string | null },
  subject: string,
  lines: string[],
  origin?: string,
) {
  if (c.cargoId) return notifyCargo(c.cargoId, subject, [...lines, appUrl(`/admin/warehouse/${c.id}`, origin)])
  if (!c.guestEmail || !c.accessToken) return
  try {
    await sendContractEmail([c.guestEmail], subject, [...lines, 'Гэрээгээ доорх холбоосоор харна уу (бусадтай хуваалцахгүй байна уу):', guestLink(c.accessToken, origin)])
  } catch (err) {
    console.error('notifyParty failed:', subject, err)
  }
}

export const SITE_URL = 'https://www.aicargo.mn'

// И-мэйлийн холбоосыг хэрэглэгчийн орсон сайтаар үүсгэнэ (локал dev → localhost, production → aicargo.mn).
// Host-ыг хуурамчаар өгч нууц холбоосыг өөр сайт руу чиглүүлэхээс сэргийлж зөвхөн манай домэйнуудыг зөвшөөрнө
export function requestOrigin(req: { nextUrl: URL }): string {
  const { protocol, hostname, origin } = req.nextUrl
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin
  if (hostname === 'aicargo.mn' || hostname.endsWith('.aicargo.mn')) return SITE_URL
  if (protocol === 'https:' && hostname.endsWith('.vercel.app') && hostname.startsWith('aicargo')) return origin
  return SITE_URL
}

export function appUrl(path: string, origin: string = SITE_URL): string {
  return origin.replace(/\/$/, '') + path
}

export function clientIp(headers: Headers): string | null {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}
