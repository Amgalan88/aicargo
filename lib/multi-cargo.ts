// Нэг эзэмшигч — олон карго. Эзэмшигч админ «Тохиргоо → Миний каргонууд»-аас шинэ карго нээнэ.
// Хэрэглэгчийн үндсэн карго (User.cargoId) өөрчлөгдөхгүй; нэмэлт каргонууд CargoOwner хүснэгтэд.
// Нэвтрэлт: lib/auth — токены карго үндсэн каргоноос өөр үед л энд шалгана (бусад бүх хэрэглэгч хуучин замаар).
import { prisma } from './prisma'

// БУЦААХ ТОВЧ: false болговол шинэ карго нээх ба холбосон каргод нэвтрэх хоёулаа унтарна
// (үндсэн каргонууд, ажилтан админууд урьдын адил ажиллана).
export const MULTI_CARGO_ENABLED = true
export const MAX_OWNED_CARGOS = 5

export async function isLinkedOwner(userId: number, cargoId: number): Promise<boolean> {
  if (!MULTI_CARGO_ENABLED) return false
  const row = await prisma.cargoOwner.findUnique({ where: { userId_cargoId: { userId, cargoId } }, select: { id: true } })
  return !!row
}

export type OwnedCargo = { id: number; name: string; slug: string; home: boolean }

// Үндсэн карго эхэнд, дараа нь нээсэн дарааллаар
export async function ownedCargos(userId: number, homeCargoId: number): Promise<OwnedCargo[]> {
  const [home, links] = await Promise.all([
    prisma.cargo.findUnique({ where: { id: homeCargoId }, select: { id: true, name: true, slug: true } }),
    MULTI_CARGO_ENABLED
      ? prisma.cargoOwner.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { cargo: { select: { id: true, name: true, slug: true } } } })
      : Promise.resolve([]),
  ])
  return [
    ...(home ? [{ ...home, home: true }] : []),
    ...links.map(l => ({ ...l.cargo, home: false })).filter(c => c.id !== homeCargoId),
  ]
}
