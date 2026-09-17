'use client'
import { use } from 'react'
import ContractWorkspace from '@/app/components/ContractWorkspace'

export default function AdminContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <ContractWorkspace
      api={`/api/admin/warehouse-contracts/${id}`}
      pdfHref={`/api/admin/warehouse-contracts/${id}/pdf`}
      backHref="/admin/warehouse"
      backLabel="Гэрээнүүд"
      newContractHref={w => `/admin/warehouse?new=${w.id}`}
      afterDeleteHref="/admin/warehouse"
    />
  )
}
