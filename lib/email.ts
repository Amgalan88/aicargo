import { prisma } from '@/lib/prisma'

// И-мэйлийг нэг хэлбэрт оруулна — утасны гар эхний үсгийг томруулах, хуулахад зай орох зэргээс болж
// бүртгэлтэй хэрэглэгч олдохгүй байхаас сэргийлнэ
export function normEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

// Бүртгэлтэй хэрэглэгчийг и-мэйлээр олно: яг таарсныг эхэлж, үгүй бол том/жижиг үсэг үл хамааран.
// Хуучин бүртгэлд том үсэгтэй и-мэйл байдаг; цөөн тохиолдолд зөвхөн үсгийн томоор ялгаатай давхар бүртгэл
// бий — тэр үед хамгийн сүүлд бүртгүүлснийг (нэг шуудангийн хайрцаг тул нэг хүнийх) авна
export async function findUserByEmail(email: string) {
  const e = normEmail(email)
  if (!e) return null
  const exact = await prisma.user.findUnique({ where: { email: e }, select: { id: true, email: true } })
  if (exact) return exact
  return prisma.user.findFirst({
    where: { email: { equals: e, mode: 'insensitive' } },
    orderBy: { id: 'desc' },
    select: { id: true, email: true },
  })
}
