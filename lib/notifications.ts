import { prisma } from '@/lib/prisma'

/**
 * After admin imports track codes into cargoId,
 * check if any of those codes exist in sibling group cargos
 * with a registered userId — meaning the shipment belongs to
 * another cargo's customer and was mis-assigned.
 */
interface ImportRow { trackCode: string; phone?: string | null; status?: string }

const STATUS_LABEL: Record<string, string> = {
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
}

export async function checkCrossCargoOnImport(rows: ImportRow[], adminCargoId: number) {
  try {
    const thisCargo = await (prisma.cargo as any).findUnique({
      where: { id: adminCargoId },
      select: { groupId: true, name: true, notificationsEnabled: true },
    })
    if (!thisCargo?.groupId) return

    const trackCodes = rows.map(r => r.trackCode)
    const phones = [...new Set(rows.map(r => r.phone).filter(Boolean) as string[])]
    const toCreate: { cargoId: number; type: string; title: string; body: string }[] = []

    // Load today's existing CROSS_CARGO notifications for all relevant cargos
    // to avoid duplicate notifications for the same track code on the same day
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayNotifs = await (prisma.notification as any).findMany({
      where: {
        type: 'CROSS_CARGO',
        createdAt: { gte: todayStart },
      },
      select: { cargoId: true, body: true },
    })
    // Build a set of "cargoId|trackCode" pairs already notified today
    const alreadyNotified = new Set<string>()
    for (const n of todayNotifs) {
      for (const code of trackCodes) {
        if (n.body.includes(code)) alreadyNotified.add(`${n.cargoId}|${code}`)
      }
    }

    // Track which pairs are being created in this batch (in-memory dedup)
    const notified = new Set<string>()

    function isDupe(cargoId: number, code: string) {
      const key = `${cargoId}|${code}`
      if (alreadyNotified.has(key) || notified.has(key)) return true
      notified.add(key)
      return false
    }

    // ── Check 1: track code exists in sibling cargo with a registered user ──
    const crossByCode = await prisma.shipment.findMany({
      where: {
        trackCode: { in: trackCodes },
        cargoId: { not: adminCargoId },
        userId: { not: null },
        cargo: { groupId: thisCargo.groupId },
      },
      select: {
        trackCode: true,
        phone: true,
        cargoId: true,
        cargo: { select: { name: true, notificationsEnabled: true } },
        user: { select: { name: true, phone: true } },
      },
    })

    for (const s of crossByCode) {
      const userPhone = s.user?.phone || s.phone || '—'
      const userName = s.user?.name || userPhone
      const importedRow = rows.find(r => r.trackCode === s.trackCode)
      const statusLabel = STATUS_LABEL[importedRow?.status ?? ''] ?? ''
      const statusText = statusLabel ? ` (${statusLabel} төлөвт)` : ''

      if ((s.cargo as any).notificationsEnabled && !isDupe(s.cargoId, s.trackCode)) {
        toCreate.push({
          cargoId: s.cargoId,
          type: 'CROSS_CARGO',
          title: 'Таны хэрэглэгчийн ачаа өөр cargo-д орлоо',
          body: `${userName} (${userPhone})-ийн бүртгүүлсэн ${s.trackCode} ачаа ${thisCargo.name}-д${statusText} орсон байна. Яаралтай холбогдож барааг авна уу.`,
        })
      }
      if (thisCargo.notificationsEnabled && !isDupe(adminCargoId, s.trackCode)) {
        toCreate.push({
          cargoId: adminCargoId,
          type: 'CROSS_CARGO',
          title: 'Өөр cargo-ийн хэрэглэгчийн ачаа орлоо',
          body: `${s.trackCode} нь ${(s.cargo as any).name}-ийн ${userName} (${userPhone})-ийн бүртгэлтэй ачаа байна${statusText}.`,
        })
      }
    }

    // ── Check 2: imported phone belongs to a user in sibling cargo ──
    if (phones.length > 0) {
      const siblingUsers = await prisma.user.findMany({
        where: {
          phone: { in: phones },
          cargoId: { not: adminCargoId },
          cargo: { groupId: thisCargo.groupId },
        },
        select: {
          name: true,
          phone: true,
          cargoId: true,
          cargo: { select: { name: true, notificationsEnabled: true } },
        },
      })

      for (const u of siblingUsers) {
        // Find which track codes had this phone
        const matchedCodes = rows.filter(r => r.phone === u.phone).map(r => r.trackCode)
        for (const code of matchedCodes) {
          const importedRow = rows.find(r => r.trackCode === code)
          const statusLabel = STATUS_LABEL[importedRow?.status ?? ''] ?? ''
          const statusText = statusLabel ? ` (${statusLabel} төлөвт)` : ''

          if ((u.cargo as any).notificationsEnabled && !isDupe(u.cargoId, code)) {
            toCreate.push({
              cargoId: u.cargoId,
              type: 'CROSS_CARGO',
              title: 'Таны хэрэглэгчийн ачаа өөр cargo-д орлоо',
              body: `${u.name} (${u.phone})-ийн ${code} ачаа ${thisCargo.name}-д${statusText} орсон байна. Яаралтай холбогдож барааг авна уу.`,
            })
          }
          if (thisCargo.notificationsEnabled && !isDupe(adminCargoId, code)) {
            toCreate.push({
              cargoId: adminCargoId,
              type: 'CROSS_CARGO',
              title: 'Өөр cargo-ийн хэрэглэгчийн ачаа орлоо',
              body: `${code} нь ${(u.cargo as any).name}-ийн ${u.name} (${u.phone})-ийн бүртгэлтэй хэрэглэгчийн ачаа байна${statusText}.`,
            })
          }
        }
      }
    }

    if (toCreate.length > 0) {
      await (prisma.notification as any).createMany({ data: toCreate })
    }
  } catch (e) { console.error('[notifications] checkCrossCargoOnImport error:', e) }
}
