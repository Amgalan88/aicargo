'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { StatusBadge } from '@/app/components/ContractDocument'
import { STATUS_INFO, ContractStatus, formatDateTime } from '@/lib/contract'
import { formatMnt } from '@/lib/warehouse'

interface Row {
  id: number
  contractNo: string
  status: ContractStatus
  fee: string
  updatedAt: string
  cargoSignedAt: string | null
  paymentClaimedAt: string | null
  approvedAt: string | null
  terminationEffectiveAt: string | null
  cargoLegalName: string
  guestEmail: string | null
  cargo: { id: number; name: string; slug: string } | null
  warehouse: { id: number; name: string }
}

const TABS: (ContractStatus | '')[] = ['', 'PAYMENT_REVIEW', 'AWAITING_PAYMENT', 'ACTIVE', 'TERMINATION_PENDING', 'TERMINATED', 'REJECTED']

export default function SuperContractsPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>}>
      <SuperContracts />
    </Suspense>
  )
}

function SuperContracts() {
  const router = useRouter()
  const sp = useSearchParams()
  const status = sp.get('status') ?? ''
  const warehouseId = sp.get('warehouseId') ?? ''
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [data, setData] = useState<{ contracts: Row[]; counts: Record<string, number> } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (q.trim()) params.set('q', q.trim())
      fetch(`/api/super/warehouse-contracts?${params}`)
        .then(r => r.ok ? r.json() : null)
        .then(setData)
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [status, warehouseId, q])

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.replace(`/super/contracts?${params}`)
  }

  const counts = data?.counts ?? {}
  const total = Object.entries(counts).filter(([k]) => k !== 'DRAFT').reduce((a, [, n]) => a + n, 0)

  return (
    <div className="page-wide" style={{ maxWidth: 1000 }}>
      <h1 className="section-title">Агуулахын гэрээнүүд</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.83rem', margin: '0 0 1rem' }}>
        Карго цахимаар баталгаажуулсан гэрээнүүд. Төлбөр агуулахын дансанд орсныг шалгаад батална.
        {warehouseId && <> · <button onClick={() => setParam('warehouseId', '')} style={linkBtn}>Бүх агуулах</button></>}
      </p>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        {TABS.map(t => {
          const n = t ? counts[t] ?? 0 : total
          const on = status === t
          return (
            <button key={t || 'all'} onClick={() => setParam('status', t)} style={{
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--surface)',
              color: on ? 'var(--accent)' : 'var(--text)', borderRadius: 100, padding: '0.3rem 0.75rem',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t ? STATUS_INFO[t].label : 'Бүгд'} <span style={{ opacity: 0.6 }}>{n}</span>
            </button>
          )
        })}
      </div>
      <input className="input" placeholder="Гэрээний №, карго, регистр..." value={q} onChange={e => setQ(e.target.value)}
        style={{ maxWidth: 320, marginBottom: '0.9rem' }} />

      {!data ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : data.contracts.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>Гэрээ алга.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 680 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: '0.74rem' }}>
                <th style={th}>Гэрээ</th><th style={th}>Карго</th><th style={th}>Агуулах</th>
                <th style={th}>Төлбөр</th><th style={th}>Төлөв</th><th style={th}>Шинэчилсэн</th>
              </tr>
            </thead>
            <tbody>
              {data.contracts.map(c => (
                <tr key={c.id} onClick={() => router.push(`/super/contracts/${c.id}`)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                  <td style={td}><Link href={`/super/contracts/${c.id}`} style={{ fontWeight: 700, color: 'var(--text)' }}>{c.contractNo}</Link></td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{c.cargoLegalName || c.cargo?.name || c.guestEmail}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {c.cargo ? `${c.cargo.slug}.aicargo.mn` : <>Бүртгэлгүй · {c.guestEmail}</>}
                    </div>
                  </td>
                  <td style={td}>{c.warehouse.name}</td>
                  <td style={td}>{formatMnt(c.fee)}</td>
                  <td style={td}><StatusBadge status={c.status} /></td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDateTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '0.6rem 0.8rem', fontWeight: 600 }
const td: React.CSSProperties = { padding: '0.6rem 0.8rem', verticalAlign: 'top' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', font: 'inherit', fontWeight: 600 }
