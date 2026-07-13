import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

// Демо карго — маркетингийн туршилтын орчин (demo.aicargo.mn)
// seedDemoCargo() нь өгөгдлийг бүрэн цэвэрлэж дахин үүсгэдэг тул
// зочид юу ч эвдсэн өдөр бүр анхны байдалдаа орно.

export const DEMO_SLUG = 'demo'
export const DEMO_ADMIN_PHONE = '99999901'
export const DEMO_USER_PHONE = '99999902'
export const DEMO_PASSWORD = 'demo123'

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)

// Ачааны жишээ өгөгдөл: [трак код, тайлбар, статус, бүртгэснээс хойш өдөр, үнэ₮, утас]
// phone: null → демо хэрэглэгчийнх (данстай), бусад нь дансгүй "утсаар бүртгэгдсэн" ачаа
type Row = [string, string | null, 'REGISTERED' | 'EREEN_ARRIVED' | 'ARRIVED' | 'PICKED_UP', number, number | null, string | null]
const SHIPMENTS: Row[] = [
  // Бүртгүүлсэн — хэрэглэгч дөнгөж бүртгүүлсэн, Эрээнд очоогүй
  ['YT7520114582391', 'Эмэгтэй гутал', 'REGISTERED', 1, null, null],
  ['SF1389442057631', 'Хүүхдийн тоглоом', 'REGISTERED', 1, null, null],
  ['JD0087341265590', 'Гар утасны гэр', 'REGISTERED', 2, null, null],
  ['YT7520118834712', 'Ном 3ш', 'REGISTERED', 2, null, '88110022'],
  ['ZTO662148873021', null, 'REGISTERED', 3, null, '95112233'],
  // Эрээнд ирсэн — агуулахад хүлээн авсан
  ['YT7520109981234', 'Өвлийн куртка', 'EREEN_ARRIVED', 4, null, null],
  ['SF1389440076218', 'Спорт пүүз', 'EREEN_ARRIVED', 4, null, null],
  ['JT5566102938475', 'Гэр ахуйн бараа', 'EREEN_ARRIVED', 5, null, '88110022'],
  ['YT7520105523987', 'Цүнх', 'EREEN_ARRIVED', 5, null, '80556677'],
  ['ZTO662141120583', 'Хүүхдийн хувцас 5ш', 'EREEN_ARRIVED', 6, null, '95112233'],
  ['SF1389447765402', null, 'EREEN_ARRIVED', 6, null, null],
  // Ирсэн — УБ-д ирсэн, олгоход бэлэн (үнэ бодогдсон)
  ['YT7520101187265', 'Ноутбукны цүнх', 'ARRIVED', 9, 8500, null],
  ['JD0087345512098', 'Аяга таваг сет', 'ARRIVED', 9, 14000, null],
  ['SF1389441029384', 'Эрэгтэй цамц 2ш', 'ARRIVED', 10, 5500, null],
  ['YT7520107654321', 'Чихэвч', 'ARRIVED', 10, 3500, '88110022'],
  ['ZTO662145598310', 'Ширээний чийдэн', 'ARRIVED', 11, 7000, '88110022'],
  ['JT5566108871542', 'Хивс 2х3м', 'ARRIVED', 11, 24500, '80556677'],
  ['YT7520103319876', 'Гал тогооны хэрэгсэл', 'ARRIVED', 12, 9800, '95112233'],
  ['SF1389448856710', null, 'ARRIVED', 12, 4200, '99110033'],
  // Олгосон — түүх/тайлангийн өгөгдөл
  ['YT7520100045612', 'Утасны дэлгэц хамгаалагч', 'PICKED_UP', 16, 3500, null],
  ['JD0087340098234', 'Эмэгтэй цүнх', 'PICKED_UP', 16, 10500, null],
  ['SF1389445540091', 'Хүүхдийн дугуй', 'PICKED_UP', 18, 32000, '88110022'],
  ['ZTO662149987264', 'Ажлын хэрэгсэл', 'PICKED_UP', 19, 12500, '95112233'],
  ['YT7520102238845', 'Пальто', 'PICKED_UP', 21, 8800, '80556677'],
  ['JT5566104412976', 'Спорт хэрэглэл', 'PICKED_UP', 23, 15500, '99110033'],
]

const FAQS = [
  { question: 'Ачаа хэдэн хоногт ирдэг вэ?', answer: 'Эрээнд ирснээс хойш ердийн ачаа 4-6 хоногт Улаанбаатарт ирдэг. Том оврын ачаа 7-10 хоног болно.', order: 1 },
  { question: 'Төлбөрөө хэрхэн төлөх вэ?', answer: 'Хаан банк 5000000000 (Демо Карго ХХК) данс руу шилжүүлээд гүйлгээний утга дээр утасны дугаараа бичнэ үү. Ачаагаа авахдаа бэлнээр төлж болно.', order: 2 },
  { question: 'Ачаагаа хаанаас авах вэ?', answer: 'УБ, Баянгол дүүрэг, Демо төв. Даваа-Бямба 10:00-19:00 цагт ирж авна уу. Утас: 7700-0000.', order: 3 },
]

export async function seedDemoCargo() {
  const config = {
    name: 'Демо Карго',
    ereemReceiver: 'демо卡格 (Демо Карго)',
    ereemPhone: '15847293651',
    ereemRegion: '内蒙古自治区 二连浩特市',
    ereemAddress: '浩特东路88号 демо仓库 3号库房',
    searchByPhone: true,
    notificationsEnabled: true,
    aiEnabled: true,
    batchEnabled: false,
    tariff: '1 кг — 3,500₮\nТом оврын ачаа — 1м³ 350,000₮\nОнцгой болон хэврэг ачаа — тохиролцоно',
    announcement: '👋 Энэ бол AiCargo-гийн демо орчин. Чөлөөтэй туршаарай — өгөгдөл өдөр бүр шөнө анхны байдалдаа ордог.',
    contactInfo: 'Утас: 7700-0000\nЦагийн хуваарь: Даваа-Бямба 10:00-19:00\nХаяг: УБ, Баянгол дүүрэг, Демо төв',
    bankName: 'Хаан банк',
    bankAccountHolder: 'Демо Карго ХХК',
    bankAccountNumber: '5000000000',
    bankTransferNote: 'Гүйлгээний утга дээр утасны дугаараа бичнэ үү',
    arrivedLabel: null,
    ereemLabel: null,
    paidUntil: new Date('2099-12-31'),
  }

  const cargo = await (prisma.cargo as any).upsert({
    where: { slug: DEMO_SLUG },
    update: config,
    create: { slug: DEMO_SLUG, ...config },
  })

  // Демо дугаарууд өөр каргогийн бодит хэрэглэгч дээр байвал зогсооно (хамгаалалт)
  const clash = await prisma.user.findFirst({
    where: { phone: { in: [DEMO_ADMIN_PHONE, DEMO_USER_PHONE] }, cargoId: { not: cargo.id } },
  })
  if (clash) throw new Error(`Демо утасны дугаар ${clash.phone} өөр каргод бүртгэлтэй байна — seed зогслоо`)

  // Хүүхэд өгөгдлийг цэвэрлэх (зочдын үүсгэсэн бүх зүйл устана)
  await prisma.shipment.deleteMany({ where: { cargoId: cargo.id } })
  await (prisma as any).batch.deleteMany({ where: { cargoId: cargo.id } })
  await prisma.faq.deleteMany({ where: { cargoId: cargo.id } })
  await prisma.notification.deleteMany({ where: { cargoId: cargo.id } })
  await prisma.banner.deleteMany({ where: { cargoId: cargo.id } })
  await prisma.user.deleteMany({
    where: { cargoId: cargo.id, phone: { notIn: [DEMO_ADMIN_PHONE, DEMO_USER_PHONE] } },
  })

  // Демо данснууд — нууц үг/нэрийг өдөр бүр анхны байдалд нь буцаана
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10)
  const [, demoUser] = await Promise.all([
    prisma.user.upsert({
      where: { phone: DEMO_ADMIN_PHONE },
      update: { name: 'Демо Админ', password: hashed, role: 'ADMIN', cargoId: cargo.id, email: 'demo-admin@aicargo.mn' },
      create: { name: 'Демо Админ', phone: DEMO_ADMIN_PHONE, password: hashed, role: 'ADMIN', cargoId: cargo.id, email: 'demo-admin@aicargo.mn' },
    }),
    prisma.user.upsert({
      where: { phone: DEMO_USER_PHONE },
      update: { name: 'Демо Хэрэглэгч', password: hashed, role: 'USER', cargoId: cargo.id, email: 'demo-user@aicargo.mn' },
      create: { name: 'Демо Хэрэглэгч', phone: DEMO_USER_PHONE, password: hashed, role: 'USER', cargoId: cargo.id, email: 'demo-user@aicargo.mn' },
    }),
  ])

  await prisma.faq.createMany({ data: FAQS.map(f => ({ ...f, cargoId: cargo.id })) })

  await prisma.shipment.createMany({
    data: SHIPMENTS.map(([trackCode, description, status, age, price, phone]) => ({
      trackCode,
      description,
      status,
      cargoId: cargo.id,
      // Дансгүй ачаа зөвхөн утсаар, данстай нь демо хэрэглэгч дээр бүртгэлтэй
      userId: phone ? null : demoUser.id,
      phone: phone ?? DEMO_USER_PHONE,
      adminPrice: price,
      createdAt: daysAgo(age),
      // Статусын цагийн дараалал: бүртгэсэн → +2 өдөр Эрээнд → +3 өдөр УБ-д
      ereenArrivedAt: status === 'REGISTERED' ? null : daysAgo(age - 2),
      arrivedAt: status === 'REGISTERED' || status === 'EREEN_ARRIVED' ? null : daysAgo(age - 5),
    })),
  })

  return { ok: true, cargoId: cargo.id, shipments: SHIPMENTS.length, resetAt: new Date().toISOString() }
}
