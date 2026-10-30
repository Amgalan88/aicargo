// Excel импортын хязгаар — спам, зохиомол өгөгдлөөс хамгаална (10/29: шинэ карго 9 минутад 105,000 санамсаргүй код оруулсан).
// Жинхэнэ каргуудын хамгийн том импорт ~640 мөр, өдөрт ~640 шинэ ачаа тул доорх хязгаар тэдэнд хүрэхгүй.
import { prisma } from '@/lib/prisma'
import { ubDayRange } from '@/lib/ub-date'

export const MAX_IMPORT_ROWS = 2000
export const MAX_NEW_SHIPMENTS_PER_DAY = 3000
// Эрээний багц: жинхэнэ хамгийн том ~70 код
export const MAX_BATCH_CODES = 500
// Нэг хэрэглэгч өдөрт өөрөө бүртгэх ачаа: жинхэнэ хамгийн их ~80
export const MAX_USER_REGISTRATIONS_PER_DAY = 300

const ubToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

// Хэрэглэгч өнөөдөр (УБ) хэдэн ачаа бүртгэснийг шалгана — хэтэрвэл алдааны текст
export async function userRegistrationLimitError(userId: number): Promise<string | null> {
  const day = ubDayRange(ubToday())!
  const today = await prisma.shipment.count({ where: { userId, createdAt: { gte: day.start, lte: day.end } } })
  return today >= MAX_USER_REGISTRATIONS_PER_DAY
    ? `Өдөрт ${MAX_USER_REGISTRATIONS_PER_DAY} хүртэл ачаа бүртгэнэ. Маргааш үргэлжлүүлнэ үү.`
    : null
}

// rowCount — файлын мөр; newCount — системд байхгүй (шинээр үүсэх) кодын тоо. Хэтэрвэл алдааны текст, үгүй бол null
export async function importLimitError(cargoId: number, rowCount: number, newCount: number): Promise<string | null> {
  if (rowCount > MAX_IMPORT_ROWS) {
    return `Нэг удаад ${MAX_IMPORT_ROWS.toLocaleString('en-US')} мөр хүртэл оруулна. Файлаа хувааж оруулна уу (энэ файлд ${rowCount.toLocaleString('en-US')} мөр).`
  }
  if (newCount === 0) return null
  const day = ubDayRange(ubToday())!
  const today = await prisma.shipment.count({ where: { cargoId, createdAt: { gte: day.start, lte: day.end } } })
  if (today + newCount > MAX_NEW_SHIPMENTS_PER_DAY) {
    return `Өдөрт ${MAX_NEW_SHIPMENTS_PER_DAY.toLocaleString('en-US')} хүртэл шинэ ачаа бүртгэнэ (өнөөдөр ${today.toLocaleString('en-US')} бүртгэсэн). Илүү хэрэгтэй бол AiCargo-д хандана уу.`
  }
  return null
}
