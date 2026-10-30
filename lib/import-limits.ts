// Excel импортын хязгаар — спам, зохиомол өгөгдлөөс хамгаална (10/29: шинэ карго 9 минутад 105,000 санамсаргүй код оруулсан).
// Жинхэнэ каргуудын хамгийн том импорт ~640 мөр, өдөрт ~640 шинэ ачаа тул доорх хязгаар тэдэнд хүрэхгүй.
import { prisma } from '@/lib/prisma'
import { ubDayRange } from '@/lib/ub-date'

export const MAX_IMPORT_ROWS = 2000
export const MAX_NEW_SHIPMENTS_PER_DAY = 3000

const ubToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

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
