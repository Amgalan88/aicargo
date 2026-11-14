import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import OrdersClient from './OrdersClient'
import { cargoAddresses } from '@/lib/ereen-address'
import { customerLoyalty, paidByShipment } from '@/lib/loyalty'
import type { CustomerLoyaltyView } from '@/lib/loyalty-core'

export default async function OrdersPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Хамааралгүй асуултуудыг зэрэг явуулна — DB рүү очих тойрог бүр хугацаа нэмдэг
  const [shipments, userRecord, suggestedQuestions] = await Promise.all([
    prisma.shipment.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true, email: true, phone: true, phoneVerifiedAt: true, cargoId: true, linkOrdersOn: true },
    }),
    // AI сургалтын санал болгох асуултууд (AI астай каргод виджетэд chip болж гарна)
    (prisma as any).aiTraining
      .findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        take: 3,
        select: { question: true },
      })
      .then((rows: { question: string }[]) => rows.map(r => r.question))
      .catch(() => []) as Promise<string[]>,
  ])

  const [batches, cargo] = userRecord?.cargoId
    ? await Promise.all([
        // Хэрэглэгчийн багцууд (утас эсвэл эзнээр холбогдсон)
        (prisma as any).batch.findMany({
          where: {
            cargoId: userRecord.cargoId,
            OR: [{ userId: user.userId }, { phone: userRecord.phone }],
          },
          orderBy: { id: 'desc' },
          include: { shipments: { select: { id: true, trackCode: true } } },
        }),
        (prisma.cargo.findUnique as any)({
          where: { id: userRecord.cargoId },
          select: { name: true, logoUrl: true, ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, ereemTitle: true, ereemAddresses: true, tariff: true, priceCubic: true, priceWeight: true, priceWeightUnit: true, priceWeightTiers: true, announcement: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true, arrivedLabel: true, ereemLabel: true, aiEnabled: true, batchEnabled: true, linkOrdersEnabled: true },
        }),
      ])
    : [[], null]

  // Урамшуулал асаалттай каргод л (алдаа гарвал хуудсыг унагаахгүй — урамшуулалгүй харагдана)
  const loyalty: CustomerLoyaltyView | null = userRecord?.cargoId && userRecord.phone
    ? await customerLoyalty(prisma, userRecord.cargoId, userRecord.phone)
        .then(v => (v ? JSON.parse(JSON.stringify(v)) : null))
        .catch(e => { console.error('customerLoyalty failed', e); return null })
    : null

  // Олгосон ачааны бодит төлсөн дүн (баримтаас) — VIP/оноо хассан дүн картанд харагдана
  const paid = userRecord?.cargoId
    ? await paidByShipment(prisma, userRecord.cargoId, shipments.filter(s => s.status === 'PICKED_UP').map(s => s.receiptId))
        .catch(e => { console.error('paidByShipment failed', e); return {} })
    : {}

  return (
    <OrdersClient
      shipments={JSON.parse(JSON.stringify(shipments))}
      userName={userRecord?.name ?? ''}
      userEmail={userRecord?.email ?? null}
      userPhone={userRecord?.phone ?? ''}
      phoneVerified={!!userRecord?.phoneVerifiedAt}
      cargoName={cargo?.name ?? ''}
      logoUrl={cargo?.logoUrl ?? ''}
      ereemReceiver={cargo?.ereemReceiver ?? ''}
      ereemPhone={cargo?.ereemPhone ?? ''}
      ereemRegion={cargo?.ereemRegion ?? ''}
      ereemAddress={cargo?.ereemAddress ?? ''}
      ereenAddresses={cargo ? cargoAddresses(cargo) : []}
      tariff={cargo?.tariff ?? null}
      priceCubic={cargo?.priceCubic ? Number(cargo.priceCubic) : null}
      priceWeight={cargo?.priceWeight ? Number(cargo.priceWeight) : null}
      priceWeightUnit={cargo?.priceWeightUnit ?? 'kg'}
      priceWeightTiers={(() => {
        try {
          const p = cargo?.priceWeightTiers ? JSON.parse(cargo.priceWeightTiers) : []
          return Array.isArray(p) ? p : []
        } catch { return [] }
      })()}
      announcement={cargo?.announcement ?? null}
      contactInfo={cargo?.contactInfo ?? null}
      bankName={cargo?.bankName ?? null}
      bankAccountHolder={cargo?.bankAccountHolder ?? null}
      bankAccountNumber={cargo?.bankAccountNumber ?? null}
      bankTransferNote={cargo?.bankTransferNote ?? null}
      arrivedLabel={cargo?.arrivedLabel ?? null}
      ereemLabel={cargo?.ereemLabel ?? null}
      aiEnabled={cargo?.aiEnabled ?? false}
      batchMode={cargo?.batchEnabled ?? false}
      linkOrders={cargo?.linkOrdersEnabled ?? false}
      linkOrdersOn={userRecord?.linkOrdersOn ?? false}
      batches={JSON.parse(JSON.stringify(batches))}
      aiSuggestions={suggestedQuestions}
      loyalty={loyalty}
      paid={paid}
    />
  )
}
