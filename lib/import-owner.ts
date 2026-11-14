// Excel импортын ачааны эзэн — Эрээн (bulk-import) болон Ирсэн (arrived) импорт хоёуланд.
//
// Excel-д 8 оронтой утас байвал Excel давуу: тэр нь хайрцаг дээрх утас — хүн ачаагаа
// авахдаа тэр утсаа хэлж, олголтод тэр утсаар хайдаг. Тэр утастай хэрэглэгч байвал түүнд,
// үгүй бол утсаар л (userId-гүй) хадгална — өмнө нь бүртгүүлсэн хүний жагсаалтаас гарна.
//
// Дүрэм: системд 1 трак = 1 утас/эзэн. Excel-ийн утас ҮРГЭЛЖ давуу (линк захиалгатай
// ачаа ч мөн — өмнө нь линк захиалагч хэвээр үлддэг байсан тул хуучин хүнд харагдсаар байв).
// Excel-д утасгүй (эсвэл буруу) мөр — одоогийн эзэн хэвээр.
// Утсыг normalizePhone-оор цэвэрлэнэ ("9911 2233", "+976…" өмнө нь утасгүй гэж тооцогдож
// хуучин эзэн хэвээр үлддэг байсан).
//
// Эзэн солигдсон ачааг буцааж, админд жагсаалтаар харуулна.

import { prisma } from './prisma'
import { parsePhone } from './phone'

export interface OwnerChange { trackCode: string; from: string; to: string }

type Existing = { trackCode: string; userId: number | null; phone: string | null; status: string; user: { phone: string } | null }

export async function resolveImportOwners(
  cargoId: number,
  codes: string[],
  excelPhoneByCode: Map<string, string | null | undefined>,
  existingByCode: Map<string, Existing>,
): Promise<{ phones: (string | null)[]; userIds: (number | null)[]; changes: OwnerChange[] }> {
  const excelOf = (code: string) => {
    return parsePhone(excelPhoneByCode.get(code))
  }

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
    if (excel) {
      // Y-ийн бүртгэл энэ каргод байвал түүнд, үгүй бол userId = null — хуучин эзний жагсаалтаас гарна
      const newUserId = userIdByPhone.get(excel) ?? null
      phones.push(excel)
      userIds.push(newUserId)
      if ((current && current !== excel) || (ex?.userId && ex.userId !== newUserId)) {
        changes.push({ trackCode: code, from: current ?? '—', to: excel })
      }
    } else {
      const phone = current || excel
      phones.push(phone)
      userIds.push(ex?.userId ?? (phone ? userIdByPhone.get(phone) ?? null : null))
    }
  }
  return { phones, userIds, changes }
}
