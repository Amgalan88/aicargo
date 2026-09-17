'use client'
import ContractWorkspace from '@/app/components/ContractWorkspace'
import { warehousePath } from '@/lib/warehouse'

export default function GuestContract({ token }: { token: string }) {
  return (
    <ContractWorkspace
      api={`/api/public/contracts/${token}`}
      pdfHref={`/api/public/contracts/${token}/pdf`}
      backHref="/warehouses"
      backLabel="Агуулахууд"
      newContractHref={w => `${warehousePath(w)}/contract`}
      afterDeleteHref="/warehouses"
    />
  )
}
