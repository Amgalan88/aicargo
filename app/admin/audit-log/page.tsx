import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AuditLogClient from './AuditLogClient'

// Энэ хуудас нь ижил role:'ADMIN' боловч ажилтан admin-д зориулагдаагүй цорын ганц
// /admin/* дэд хуудас тул proxy.ts/layout.tsx-ийн ерөнхий шүүлтүүрт найдахгүй,
// шууд сервер дээр шалгана (client flash-then-redirect биш).
export default async function AuditLogPage() {
  const user = await getAuthUser()
  // /admin/registered — batch болон энгийн горим хоёуланд адилхан ажилладаг аюулгүй хуудас
  if (!user || user.role !== 'ADMIN' || user.isStaffAdmin) redirect('/admin/registered')
  return <AuditLogClient />
}
