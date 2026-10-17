// Excel импортын ачааны эзэн — Эрээн (bulk-import) болон Ирсэн (arrived) импорт хоёуланд.
//
// Excel-д 8 оронтой утас байвал Excel давуу: тэр нь хайрцаг дээрх утас — хүн ачаагаа
// авахдаа тэр утсаа хэлж, олголтод тэр утсаар хайдаг. Тэр утастай хэрэглэгч байвал түүнд,
// үгүй бол утсаар л (userId-гүй) хадгална — өмнө нь бүртгүүлсэн хүний жагсаалтаас гарна.
//
// Онцгой тохиолдол:
//   • Excel-д утасгүй мөр — одоогийн эзэн (бүртгүүлсэн хэрэглэгч) хэвээр.
//   • Линк захиалгаар карго өөрөө захиалсан код — захиалагч хэвээр (Taobao хаягт
//     каргоны өөрийн утас бичигдсэн байж болно).
//
// Эзэн солигдсон ачааг буцааж, админд жагсаалтаар харуулна.

import { prisma } from './prisma'

export interface OwnerChange { trackCode: string; from: string; to: string }

type Existing = { trackCode: string; userId: number | null; phone: string | null; status: string; user: { phone: string } | null }

export async function resolveImportOwners(
  cargoId: number,
  codes: string[],
  excelPhoneByCode: Map<string, string | null | undefined>,
  existingByCode: Map<string, Existing>,
): Promise<{ phones: (string | null)[]; userIds: (number | null)[]; changes: OwnerChange[] }> {
  const excelOf = (code: string) => {
    const p = excelPhoneByCode.get(code)?.trim() ?? ''
    return /^\d{8}$/.test(p) ? p : null
  }

  const linkRows = await prisma.linkOrder.findMany({
    where: { cargoId, trackCode: { in: codes }, userId: { not: null } },
    select: { trackCode: true },
  })
  const linkOwned = new Set(linkRows.map(r => r.trackCode))

  // Эзэн болох утаснуудын хэрэглэгчийг НЭГ query-гээр
  const lookup = new Set<string>()
  for (const code of codes) {
    const excel = excelOf(code)
    const ex = existingByCode.get(code)
    if (excel) lookup.add(excel)
    else if (!ex?.userId && ex?.phone) lookup.add(ex.phone)
  }
  const users = lookup.size
    ? await prisma.user.findMany({ where: { cargoId, phone: { in: [...lookup] } }, select: { id: true, phone: true } })
    : []
  const userIdByPhone = new Map(users.map(u => [u.phone, u.id]))

  const phones: (string | null)[] = []
  const userIds: (number | null)[] = []
  const changes: OwnerChange[] = []
  for (const code of codes) {
    const ex = existingByCode.get(code)
    const excel = excelOf(code)
    const current = ex?.user?.phone || ex?.phone || null
    if (excel && !(linkOwned.has(code) && ex?.userId)) {
      phones.push(excel)
      userIds.push(userIdByPhone.get(excel) ?? null)
      if (current && current !== excel) changes.push({ trackCode: code, from: current, to: excel })
    } else {
      const phone = current || excel
      phones.push(phone)
      userIds.push(ex?.userId ?? (phone ? userIdByPhone.get(phone) ?? null : null))
    }
  }
  return { phones, userIds, changes }
}
