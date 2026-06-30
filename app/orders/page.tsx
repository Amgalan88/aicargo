import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import OrdersClient from './OrdersClient'

export default async function OrdersPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const shipments = await prisma.shipment.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: 'desc' },
  })

  const userRecord = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true, email: true, phone: true, cargoId: true },
  })

  const cargo = userRecord?.cargoId
    ? await (prisma.cargo.findUnique as any)({
        where: { id: userRecord.cargoId },
        select: { name: true, logoUrl: true, ereemReceiver: true, ereemPhone: true, ereemRegion: true, ereemAddress: true, tariff: true, announcement: true, contactInfo: true, bankName: true, bankAccountHolder: true, bankAccountNumber: true, bankTransferNote: true, arrivedLabel: true, ereemLabel: true },
      })
    : null

  return (
    <OrdersClient
      shipments={JSON.parse(JSON.stringify(shipments))}
      userName={userRecord?.name ?? ''}
      userEmail={userRecord?.email ?? null}
      userPhone={userRecord?.phone ?? ''}
      cargoName={cargo?.name ?? ''}
      logoUrl={cargo?.logoUrl ?? ''}
      ereemReceiver={cargo?.ereemReceiver ?? ''}
      ereemPhone={cargo?.ereemPhone ?? ''}
      ereemRegion={cargo?.ereemRegion ?? ''}
      ereemAddress={cargo?.ereemAddress ?? ''}
      tariff={cargo?.tariff ?? null}
      announcement={cargo?.announcement ?? null}
      contactInfo={cargo?.contactInfo ?? null}
      bankName={cargo?.bankName ?? null}
      bankAccountHolder={cargo?.bankAccountHolder ?? null}
      bankAccountNumber={cargo?.bankAccountNumber ?? null}
      bankTransferNote={cargo?.bankTransferNote ?? null}
      arrivedLabel={cargo?.arrivedLabel ?? null}
      ereemLabel={cargo?.ereemLabel ?? null}
    />
  )
}
