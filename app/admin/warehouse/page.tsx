'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { StatusBadge } from '@/app/components/ContractDocument'
import { cloudinaryThumb, formatMnt, warehousePath } from '@/lib/warehouse'
import { formatDateTime } from '@/lib/contract'

interface ContractRow {
  id: number
  contractNo: string
  status: string
  fee: string
  createdAt: string
  cargoSignedAt: string | null
  approvedAt: string | null
  terminationEffectiveAt: string | null
  terminatedAt: string | null
  paymentClaimedAt: string | null
  paidAt: string | null
  websiteBonusAt: string | null
  rejectReason: string | null
  warehouse: { id: number; name: string; imageUrl: string | null }
}

interface WarehouseRow {
  id: number
  name: string
  slug: string | null
  imageUrl: string | null
  address: string | null
  contractFee: string
  available: boolean
  openContractId: number | null
}

export default function WarehouseContractsPage() {
  return (
    <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>}>
      <WarehouseContracts />
    </Suspense>
  )
}

function WarehouseContracts() {
  const router = useRouter()
  const search = useSearchParams()
  const [data, setData] = useState<{ canManage: boolean; contracts: ContractRow[]; warehouses: WarehouseRow[] } | null>(null)
  const [creating, setCreating] = useState<number | null>(null)
  const handledNew = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/warehouse-contracts')
    if (res.ok) setData(await res.json())
    else toast.error('Ачаалахад алдаа гарлаа')
  }, [])
  useEffect(() => { load() }, [load])

  const start = useCallback(async (w: WarehouseRow) => {
    if (w.openContractId) { router.push(`/admin/warehouse/${w.openContractId}`); return }
    setCreating(w.id)
    const res = await fetch('/api/admin/warehouse-contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId: w.id }),
    })
    const d = await res.json().catch(() => ({}))
    setCreating(null)
    if (!res.ok) { toast.error(d.error || 'Алдаа гарлаа'); return }
    router.push(`/admin/warehouse/${d.id}`)
  }, [router])

  // Нийтийн агуулахын хуудсаас "Цахим гэрээ байгуулах" дарж ирсэн бол тухайн агуулахыг онцолно
  const highlightId = Number(search.get('new')) || null
  useEffect(() => {
    if (!data || !highlightId || handledNew.current) return
    handledNew.current = true
    const w = data.warehouses.find(x => x.id === highlightId)
    if (w?.openContractId) router.replace(`/admin/warehouse/${w.openContractId}`)
    else document.getElementById(`wh-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [data, highlightId, router])

  if (!data) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  return (
    <div className="page-wide" style={{ maxWidth: 900 }}>
      <h1 className="section-title">Агуулах</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
        Эрээний агуулахтай цахим гэрээ байгуулснаар агуулах танай каргод тусгай зай талбай гаргаж,
        ачааг хүлээн авч, ангилж, баглаж савлана. Гэрээний төлбөр нэг удаагийн бөгөөд буцаагдахгүй.
        Гэрээ хүчин төгөлдөр болоход вэбсайт тань 60 хоногоор үнэгүй сунгагдана.
      </p>

      {data.contracts.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={h2}>Миний гэрээнүүд</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {data.contracts.map(c => (
              <Link key={c.id} href={`/admin/warehouse/${c.id}`} className="wc-row">
                {c.warehouse.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={cloudinaryThumb(c.warehouse.imageUrl, 120)} alt="" className="wc-thumb" />
                  : <span className="wc-thumb wc-thumb-empty">🏭</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.warehouse.name}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                    {c.contractNo} · {subline(c)}
                  </div>
                  <Progress c={c} />
                </div>
                <StatusBadge status={c.status} />
                <span style={{ color: 'var(--muted)' }}>›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 style={h2}>Агуулахууд</h2>
        {!data.canManage && (
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '-0.4rem 0 0.8rem' }}>
            Гэрээ байгуулах, цуцлахыг зөвхөн каргогийн эзэмшигч хийнэ.
          </p>
        )}
        <div className="wc-grid">
          {data.warehouses.map(w => (
            <div key={w.id} id={`wh-${w.id}`} className={`card wc-wh${highlightId === w.id ? ' wc-hl' : ''}`}>
              {w.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={cloudinaryThumb(w.imageUrl, 520)} alt={w.name} className="wc-wh-img" />
                : <div className="wc-wh-img wc-thumb-empty" style={{ fontSize: '2rem' }}>🏭</div>}
              <div style={{ padding: '0.85rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{w.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Гэрээний төлбөр: <b style={{ color: 'var(--text)' }}>{formatMnt(w.contractFee)}</b> · нэг удаа
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.6rem', flexWrap: 'wrap' }}>
                  <a href={warehousePath(w)} target="_blank" rel="noreferrer" className="btn-ghost" style={btnSm}>Зураг, мэдээлэл ↗</a>
                  {w.openContractId ? (
                    <Link href={`/admin/warehouse/${w.openContractId}`} className="btn" style={btnSm}>Гэрээ харах</Link>
                  ) : w.available ? (
                    data.canManage && (
                      <button className="btn" style={btnSm} disabled={creating !== null} onClick={() => start(w)}>
                        {creating === w.id ? 'Үүсгэж байна...' : 'Гэрээ байгуулах'}
                      </button>
                    )
                  ) : (
                    <span style={{ fontSize: '0.76rem', color: 'var(--muted)', alignSelf: 'center' }}>Одоогоор гэрээ хүлээн авахгүй</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {data.warehouses.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Агуулах бүртгэгдээгүй байна.</p>}
      </section>

      <style>{`
        .wc-row { display: flex; align-items: center; gap: 0.8rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); color: inherit; text-decoration: none; }
        .wc-row:last-child { border-bottom: none; }
        .wc-row:hover { background: var(--surface2); }
        .wc-thumb { width: 52px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
        .wc-thumb-empty { display: flex; align-items: center; justify-content: center; background: var(--surface2); }
        .wc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.9rem; }
        .wc-wh { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
        .wc-wh-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
        .wc-steps { display: flex; gap: 3px; margin-top: 6px; flex-wrap: wrap; }
        .wc-steps span { font-size: 0.68rem; padding: 0.1rem 0.45rem; border-radius: 100px; background: var(--surface2); color: var(--muted); }
        .wc-steps span.done { background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green); }
        .wc-steps span.on { background: var(--accent); color: #fff; font-weight: 600; }
        .wc-pay { font-size: 0.74rem; margin-top: 4px; font-weight: 600; }
        .wc-hl { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
      `}</style>
    </div>
  )
}

const STEPS = ['Бөглөх', 'Баталгаажуулах', 'Төлбөр', 'Хүчинтэй']

// Гэрээний явц: аль алхамд байгаа, төлбөрийн байдал
function Progress({ c }: { c: ContractRow }) {
  if (c.status === 'REJECTED' || c.status === 'TERMINATED') {
    return <div className="wc-pay" style={{ color: 'var(--muted)' }}>{c.status === 'REJECTED' ? `Татгалзсан${c.rejectReason ? ': ' + c.rejectReason : ''}` : 'Гэрээ цуцлагдсан'}</div>
  }
  const step = c.status === 'DRAFT' ? 0 : c.status === 'AWAITING_PAYMENT' || c.status === 'PAYMENT_REVIEW' ? 2 : 4
  const pay = c.status === 'DRAFT' ? { t: 'Мэдээллээ бөглөж баталгаажуулна уу', color: 'var(--muted)' }
    : c.status === 'AWAITING_PAYMENT' ? { t: `Төлбөр хүлээгдэж байна — ${formatMnt(c.fee)} шилжүүлж "Төлбөр төлсөн" дарна уу`, color: '#d97706' }
    : c.status === 'PAYMENT_REVIEW' ? { t: `Төлбөр шалгагдаж байна (мэдэгдсэн ${c.paymentClaimedAt ? formatDateTime(c.paymentClaimedAt).slice(0, 10) : ''})`, color: '#2563eb' }
    : { t: `Төлбөр баталгаажсан ${c.paidAt ? formatDateTime(c.paidAt).slice(0, 10) : ''}${c.websiteBonusAt ? ' · вэбсайт +60 хоног' : ''}`, color: 'var(--green)' }
  return (
    <>
      <div className="wc-steps">
        {STEPS.map((s, i) => (
          <span key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>{i < step ? '✓ ' : ''}{s}</span>
        ))}
      </div>
      <div className="wc-pay" style={{ color: pay.color }}>{pay.t}</div>
    </>
  )
}

function subline(c: ContractRow): string {
  switch (c.status) {
    case 'DRAFT': return `Үүсгэсэн ${formatDateTime(c.createdAt).slice(0, 10)}`
    case 'AWAITING_PAYMENT': return `${formatMnt(c.fee)} төлөх`
    case 'ACTIVE': return `Хүчинтэй ${c.approvedAt ? formatDateTime(c.approvedAt).slice(0, 10) : ''}-аас`
    case 'TERMINATION_PENDING': return `${c.terminationEffectiveAt ? formatDateTime(c.terminationEffectiveAt).slice(0, 10) : ''}-нд цуцлагдана`
    case 'TERMINATED': return `Цуцлагдсан ${c.terminatedAt ? formatDateTime(c.terminatedAt).slice(0, 10) : ''}`
    default: return c.cargoSignedAt ? `Баталгаажуулсан ${formatDateTime(c.cargoSignedAt).slice(0, 10)}` : ''
  }
}

const h2: React.CSSProperties = { fontSize: '1rem', fontWeight: 800, margin: '0 0 0.75rem' }
const btnSm: React.CSSProperties = { padding: '0.4rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none' }
