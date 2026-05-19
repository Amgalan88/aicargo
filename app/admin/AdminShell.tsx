'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from './AdminNav'

export default function AdminShell({ children, cargoName, logoUrl, cargoSlug, hasGroup, paidUntil }: { children: React.ReactNode; cargoName?: string; logoUrl?: string; cargoSlug?: string; hasGroup?: boolean; paidUntil?: string | null }) {
  const router = useRouter()

  useEffect(() => {
    const orig = window.fetch
    window.fetch = async (...args) => {
      const res = await orig(...args)
      if (res.status === 401) {
        router.push('/login')
      }
      return res
    }
    return () => { window.fetch = orig }
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <AdminNav cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} />
      <div style={{ minHeight: 'calc(100vh - 96px)' }}>
        {children}
      </div>
    </div>
  )
}
