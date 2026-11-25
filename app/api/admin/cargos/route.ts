// Нэг эзэмшигч — олон карго: GET өөрийн каргонууд, POST шинэ карго нээх (зөвхөн эзэмшигч админ).
// Шинэ карго үнэгүй хугацаагүй (эхний өдрөөс төлбөртэй), нэг хүн MAX_OWNED_CARGOS хүртэл.
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { prisma } from '@/lib/prisma'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { logAdminAction } from '@/lib/audit'
import { validateSlug } from '@/lib/cargo-signup'
import { billingState, PRICE_PER_PERIOD } from '@/lib/billing'
import { MAX_OWNED_CARGOS, MULTI_CARGO_ENABLED, ownedCargos } from '@/lib/multi-cargo'

const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN
const limiter = url && token
  ? new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(5, '1 d'), prefix: 'cargo-create' })
  : null

// «Одоогийн каргоны тохиргоог хуулах» — тариф, үнэ, Эрээний хаяг, данс, холбоо барих, төлөвийн нэр
const COPY_FIELDS = {
  tariff: true, priceCubic: true, priceWeight: true, priceWeightUnit: true, priceWeightTiers: true,
  ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, ereemTitle: true, ereemAddresses: true,
  bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true,
  contactInfo: true, arrivedLabel: true, ereemLabel: true, searchByPhone: true, notificationsEnabled: true,
} as const

async function ownerOnly(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return { error: unauthorized() }
  if (admin.role !== 'ADMIN' || !admin.cargoId) return { error: forbidden() }
  if (admin.isStaffAdmin) return { error: NextResponse.json({ error: 'Зөвхөн каргоны эзэмшигч' }, { status: 403 }) }
  if (!MULTI_CARGO_ENABLED) return { error: NextResponse.json({ error: 'Энэ боломж түр хаалттай' }, { status: 403 }) }
  const home = await prisma.user.findUnique({ where: { id: admin.userId }, select: { cargoId: true, password: true, phone: true } })
  if (!home) return { error: unauthorized() }
  return { admin, home }
}

export async function GET(req: NextRequest) {
  const auth = await ownerOnly(req)
  if (auth.error) return auth.error
  const cargos = await ownedCargos(auth.admin.userId, auth.home.cargoId)
  return NextResponse.json({ cargos, currentId: auth.admin.cargoId, max: MAX_OWNED_CARGOS, pricePerMonth: PRICE_PER_PERIOD })
}

export async function POST(req: NextRequest) {
  const auth = await ownerOnly(req)
  if (auth.error) return auth.error
  const { admin, home } = auth

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const slug = String(body.slug ?? '').trim().toLowerCase()
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: 'Каргоны нэр 2-60 тэмдэгт байна' }, { status: 400 })
  const slugErr = validateSlug(slug)
  if (slugErr) return NextResponse.json({ error: slugErr }, { status: 400 })
  if (!body.password || !(await bcrypt.compare(String(body.password), home.password))) {
    return NextResponse.json({ error: 'Нууц үг буруу байна' }, { status: 401 })
  }

  if (limiter) {
    const { success } = await limiter.limit(String(admin.userId))
    if (!success) return NextResponse.json({ error: 'Өнөөдөр хэт олон удаа оролдлоо. Маргааш дахин оролдоно уу.' }, { status: 429 })
  }

  const [owned, current, slugTaken] = await Promise.all([
    ownedCargos(admin.userId, home.cargoId),
    prisma.cargo.findUnique({ where: { id: admin.cargoId! }, select: { name: true, paidUntil: true, ...COPY_FIELDS } }),
    prisma.cargo.findUnique({ where: { slug }, select: { id: true } }),
  ])
  if (owned.length >= MAX_OWNED_CARGOS) return NextResponse.json({ error: `Нэг хүн ${MAX_OWNED_CARGOS} хүртэл карго эзэмшинэ` }, { status: 400 })
  if (!current) return forbidden()
  if (billingState(current.paidUntil)?.blocked) {
    return NextResponse.json({ error: 'Энэ каргоны вэбсайтын төлбөр хугацаа хэтэрсэн байна. Эхлээд төлбөрөө төлнө үү.' }, { status: 402 })
  }
  if (slugTaken) return NextResponse.json({ error: 'Энэ хаяг аль хэдийн эзэмшигдсэн байна' }, { status: 409 })

  const { name: currentName, paidUntil: _paid, ...settings } = current
  const copy = body.copySettings === true
  try {
    const created = await prisma.$transaction(async tx => {
      const cargo = await tx.cargo.create({
        data: {
          name, slug,
          ereemReceiver: '', ereemPhone: '', ereemAddress: '',
          ...(copy ? { ...settings, ereemAddresses: settings.ereemAddresses ?? undefined } : {}),
          // Үнэгүй хугацаагүй: өнөөдрөөс төлбөртэй (төлөхгүй бол GRACE_DAYS хоногийн дараа хаагдана)
          paidUntil: new Date(),
          aiEnabled: false,
        },
        select: { id: true, slug: true, name: true },
      })
      await tx.cargoOwner.create({ data: { userId: admin.userId, cargoId: cargo.id } })
      if (copy) {
        const faqs = await tx.faq.findMany({ where: { cargoId: admin.cargoId! }, select: { question: true, answer: true, order: true } })
        if (faqs.length) await tx.faq.createMany({ data: faqs.map(f => ({ ...f, cargoId: cargo.id })) })
      }
      return cargo
    })
    await logAdminAction(prisma, { cargoId: admin.cargoId!, userId: admin.userId, userName: admin.name, action: 'cargo:open-another', detail: `${created.name} (${created.slug})${copy ? ' · тохиргоо хуулсан' : ''}` })
    await logAdminAction(prisma, { cargoId: created.id, userId: admin.userId, userName: admin.name, action: 'cargo:created', detail: `${currentName}-ийн эзэмшигч нээсэн${copy ? ' · тохиргоо хуулсан' : ''}` })
    console.log(JSON.stringify({ multiCargo: 'created', by: admin.userId, from: admin.cargoId, cargoId: created.id, slug: created.slug }))
    return NextResponse.json({ ok: true, cargo: created }, { status: 201 })
  } catch (e) {
    // Зэрэг хоёр хүсэлт ижил хаяг авбал unique алдаа
    if ((e as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'Энэ хаяг аль хэдийн эзэмшигдсэн байна' }, { status: 409 })
    console.error('[cargos:create]', e)
    return NextResponse.json({ error: 'Карго нээхэд алдаа гарлаа' }, { status: 500 })
  }
}
