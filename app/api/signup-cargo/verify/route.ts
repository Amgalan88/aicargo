import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'
import { validateSlug, TRIAL_DAYS } from '@/lib/cargo-signup'
import { consumeVerification } from '@/lib/phone-verification'

export async function POST(req: NextRequest) {
  let body: {
    cargoName?: string; slug?: string
    adminName?: string; phone?: string; password?: string
    verificationId?: string
    aiEnabled?: boolean; searchByPhone?: boolean; notificationsEnabled?: boolean
    logoBase64?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const cargoName = body.cargoName?.trim() ?? ''
  const slug = body.slug?.trim().toLowerCase() ?? ''
  const adminName = body.adminName?.trim() ?? ''
  const phone = body.phone?.trim() ?? ''
  const password = body.password ?? ''
  const verificationId = String(body.verificationId ?? '')

  // Эзэмшигч жинхэнэ утсаа Verify.MN-ээр баталгаажуулна (и-мэйл шаардахгүй) — хуурамч дугаартай спам карго нээгдэхгүй
  if (cargoName.length < 2 || adminName.length < 2 || !/^\d{8}$/.test(phone) ||
      password.length < 6 || !verificationId) {
    return NextResponse.json({ error: 'Мэдээлэл дутуу эсвэл буруу байна' }, { status: 400 })
  }
  if (!body.logoBase64) {
    return NextResponse.json({ error: 'Лого оруулна уу' }, { status: 400 })
  }
  const slugErr = validateSlug(slug)
  if (slugErr) return NextResponse.json({ error: slugErr }, { status: 400 })

  // Давхардал шалгах (баталгаажуулалт хүлээх хооронд өөр хүн авсан байж болно) — SMS-ийг хэрэглэхээс өмнө
  const [slugTaken, phoneTaken] = await Promise.all([
    prisma.cargo.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { phone }, select: { id: true } }),
  ])
  if (slugTaken) return NextResponse.json({ error: 'Энэ subdomain аль хэдийн эзэмшигдсэн байна' }, { status: 409 })
  if (phoneTaken) return NextResponse.json({ error: 'Энэ утасны дугаар бүртгэлтэй байна' }, { status: 409 })
  if (!(await consumeVerification(verificationId, phone, 'cargo'))) {
    return NextResponse.json({ error: 'Утасны дугаараа баталгаажуулна уу' }, { status: 400 })
  }

  const trialDays = TRIAL_DAYS

  const hashed = await bcrypt.hash(password, 10)
  const paidUntil = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

  // Cargo + ADMIN хэрэглэгчийг нэг transaction-д — аль нэг нь бүтэлгүйтвэл хоёулаа буцна
  const result = await prisma.$transaction(async tx => {
    const cargo = await tx.cargo.create({
      data: {
        name: cargoName,
        slug,
        ereemReceiver: '',
        ereemPhone: '',
        ereemAddress: '',
        paidUntil,
        // AI туслах нэмэлт төлбөртэй — super admin гараар идэвхжүүлнэ
        aiEnabled: false,
        searchByPhone: body.searchByPhone === true,
        notificationsEnabled: body.notificationsEnabled === true,
      },
    })
    const admin = await tx.user.create({
      data: {
        name: adminName,
        phone,
        phoneVerifiedAt: new Date(),
        password: hashed,
        role: 'ADMIN',
        cargoId: cargo.id,
      },
    })
    return { cargo, admin }
  })

  // Лого оруулсан бол Cloudinary-д байршуулна — бүтэлгүйтвэл бүртгэлийг унагахгүй
  if (body.logoBase64) {
    try {
      const logoUrl = await uploadLogo(body.logoBase64, `cargo-${result.cargo.id}`)
      await prisma.cargo.update({ where: { id: result.cargo.id }, data: { logoUrl } })
    } catch (err) {
      console.error('Signup logo upload failed:', err)
    }
  }

  // Шууд нэвтрүүлнэ
  const token = signToken({
    userId: result.admin.id,
    role: 'ADMIN',
    cargoId: result.cargo.id,
    tokenVersion: 0,
  })
  const res = NextResponse.json({
    ok: true,
    slug: result.cargo.slug,
    trialDays,
  })
  setAuthCookie(res, token)
  return res
}
