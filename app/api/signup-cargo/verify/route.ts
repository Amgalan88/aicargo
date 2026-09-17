import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { uploadLogo } from '@/lib/cloudinary'
import { validateSlug, TRIAL_DAYS } from '@/lib/cargo-signup'
import { WEBSITE_BONUS_DAYS } from '@/lib/contract'
import { findSignupContract, grantWebsiteBonus, addEvent } from '@/lib/contract-server'

export async function POST(req: NextRequest) {
  let body: {
    cargoName?: string; slug?: string
    adminName?: string; phone?: string; email?: string; password?: string
    code?: string
    contractToken?: string
    aiEnabled?: boolean; searchByPhone?: boolean; notificationsEnabled?: boolean
    logoBase64?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const cargoName = body.cargoName?.trim() ?? ''
  const slug = body.slug?.trim().toLowerCase() ?? ''
  const adminName = body.adminName?.trim() ?? ''
  const phone = body.phone?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  const code = body.code?.trim() ?? ''

  if (cargoName.length < 2 || adminName.length < 2 || !/^\d{8}$/.test(phone) ||
      !/^\S+@\S+\.\S+$/.test(email) || password.length < 6 || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Мэдээлэл дутуу эсвэл буруу байна' }, { status: 400 })
  }
  if (!body.logoBase64) {
    return NextResponse.json({ error: 'Лого оруулна уу' }, { status: 400 })
  }
  const slugErr = validateSlug(slug)
  if (slugErr) return NextResponse.json({ error: slugErr }, { status: 400 })

  // OTP шалгах
  const otp = await prisma.otp.findFirst({
    where: { email, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { id: 'desc' },
  })
  if (!otp) return NextResponse.json({ error: 'Код буруу эсвэл хугацаа дууссан байна' }, { status: 400 })

  // Давхардал дахин шалгах (OTP хүлээх хооронд өөр хүн авсан байж болно)
  const [slugTaken, phoneTaken, emailTaken] = await Promise.all([
    prisma.cargo.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { phone }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ])
  if (slugTaken) return NextResponse.json({ error: 'Энэ subdomain аль хэдийн эзэмшигдсэн байна' }, { status: 409 })
  if (phoneTaken) return NextResponse.json({ error: 'Энэ утасны дугаар бүртгэлтэй байна' }, { status: 409 })
  if (emailTaken) return NextResponse.json({ error: 'Энэ и-мэйл бүртгэлтэй байна' }, { status: 409 })

  // Эрээний агуулахтай хүчинтэй гэрээтэй бол 60 хоног үнэгүй — гэрээг тухайн хүний и-мэйлээр л ашиглана
  const signupContract = body.contractToken ? await findSignupContract(body.contractToken) : null
  if (body.contractToken && (!signupContract || signupContract.guestEmail !== email)) {
    return NextResponse.json({ error: 'Гэрээний холбоос хүчингүй эсвэл өөр и-мэйлтэй байна' }, { status: 400 })
  }
  const trialDays = signupContract ? WEBSITE_BONUS_DAYS : TRIAL_DAYS

  const hashed = await bcrypt.hash(password, 10)
  // Гэрээтэй бол paidUntil-ийг grantWebsiteBonus тооцно; эхлээд одоогийн мөчөөр үүсгэнэ
  const paidUntil = new Date(Date.now() + (signupContract ? 0 : TRIAL_DAYS) * 24 * 60 * 60 * 1000)

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
        email,
        password: hashed,
        role: 'ADMIN',
        cargoId: cargo.id,
      },
    })
    if (signupContract) {
      // Зочны гэрээг шинэ каргод шилжүүлж, нууц холбоосыг хүчингүй болгоно
      const moved = await tx.warehouseContract.updateMany({
        where: { id: signupContract.id, cargoId: null, websiteBonusAt: null },
        data: { cargoId: cargo.id, createdById: admin.id, accessToken: null, guestEmail: null },
      })
      if (moved.count !== 1) throw new Error('CONTRACT_TAKEN')
      const actor = { id: admin.id, name: adminName }
      await addEvent(tx, signupContract.id, actor, 'LINKED_TO_CARGO', `${cargoName} (${slug}.aicargo.mn)`)
      await grantWebsiteBonus(tx, signupContract.id, cargo.id, actor)
    }
    return { cargo, admin }
  }).catch(err => {
    if (err instanceof Error && err.message === 'CONTRACT_TAKEN') return null
    throw err
  })
  if (!result) return NextResponse.json({ error: 'Энэ гэрээ өөр каргод холбогдсон байна' }, { status: 409 })

  await prisma.otp.update({ where: { id: otp.id }, data: { used: true } })

  // Лого оруулсан бол Cloudinary-д байршуулна — бүтэлгүйтвэл бүртгэлийг унагахгүй
  if (body.logoBase64) {
    try {
      const logoUrl = await uploadLogo(body.logoBase64, result.cargo.slug)
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
    contractNo: signupContract?.contractNo ?? null,
  })
  setAuthCookie(res, token)
  return res
}
