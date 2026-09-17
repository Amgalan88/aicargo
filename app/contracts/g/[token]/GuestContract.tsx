'use client'
import { useCallback } from 'react'
import ContractWorkspace from '@/app/components/ContractWorkspace'
import { warehousePath } from '@/lib/warehouse'
import { saveGuestContract, forgetGuestContract } from '@/lib/guest-contracts-storage'

export default function GuestContract({ token }: { token: string }) {
  // Энэ хөтөч дээр дахин ороход агуулахын хуудаснаас "Үргэлжлүүлэх" гарна
  const onLoaded = useCallback((d: { contractNo: string; warehouse: { id: number; name: string } }) => {
    saveGuestContract({ token, warehouseId: d.warehouse.id, warehouseName: d.warehouse.name, contractNo: d.contractNo, savedAt: Date.now() })
  }, [token])
  const onMissing = useCallback(() => forgetGuestContract(token), [token])

  return (
    <ContractWorkspace
      api={`/api/public/contracts/${token}`}
      pdfHref={`/api/public/contracts/${token}/pdf`}
      backHref="/warehouses"
      backLabel="Агуулахууд"
      newContractHref={w => `${warehousePath(w)}/contract`}
      afterDeleteHref="/warehouses"
      signupHref={`/signup-cargo?contract=${token}`}
      onLoaded={onLoaded}
      onMissing={onMissing}
    />
  )
}
