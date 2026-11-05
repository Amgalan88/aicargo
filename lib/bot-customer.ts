import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface BotCustomer {
  id: number
  name: string
  phone: string
}

type Found =
  | { ok: true; user: BotCustomer }
  | { ok: false; error: string; status: 409 }

// Бот session cookie өгөхгүй, нууц үгийг хариунд оруулахгүй.
// Утас энэ каргын USER дээр байвал тэр бүртгэлийг ашиглана — нэр, нууц үгийг нь солихгүй.
// Байхгүй бол санамсаргүй нууц үгтэй USER үүсгэнэ; эзэн нь дараа нь SMS-ээр нууц үгээ сэргээнэ.
// Өөр карго эсвэл ажилтны дугаарыг хөдөлгөхгүй. SMS баталгаагүй тул тухайн утасны
// бусад ачааг автоматаар холбохгүй (зөвхөн одоо бүртгэж буй трак код).
export async function findOrCreateBotCustomer(cargoId: number, phone: string, name: string): Promise<Found> {
  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, cargoId: true, name: true, phone: true, role: true },
  })
  if (existing) return classify(cargoId, existing)

  const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
  try {
    const user = await prisma.user.create({
      data: { name, phone, password, cargoId, role: 'USER' },
      select: { id: true, name: true, phone: true },
    })
    return { ok: true, user }
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e
    const again = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, cargoId: true, name: true, phone: true, role: true },
    })
    if (!again) throw e
    return classify(cargoId, again)
  }
}

function classify(
  cargoId: number,
  user: { id: number; cargoId: number; name: string; phone: string; role: string },
): Found {
  if (user.cargoId !== cargoId) {
    return { ok: false, status: 409, error: 'Энэ утасны дугаар өөр каргод бүртгэлтэй байна' }
  }
  if (user.role !== 'USER') {
    return { ok: false, status: 409, error: 'Энэ утасны дугаар ажилтны бүртгэлтэй байна' }
  }
  return { ok: true, user: { id: user.id, name: user.name, phone: user.phone } }
}
