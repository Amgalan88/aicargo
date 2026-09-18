'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ContractDocument, ContractTimeline, StatusBadge, ContractEventRow } from '@/app/components/ContractDocument'
import type { CargoField, ContractBody, ContractStatus, ReceiveAddress } from '@/lib/contract'
import { formatDateTime, PDF_STATUSES, TERMINATION_NOTICE_DAYS } from '@/lib/contract'
import { formatMnt } from '@/lib/warehouse'

interface Detail {
  id: number
  contractNo: string
  status: ContractStatus
  values: Record<string, string>
  fields: CargoField[]
  body: ContractBody
  bodyHash: string | null
  fee: string
  payToBank: string | null
  payToAccount: string | null
  payToHolder: string | null
  paymentProofUrl: string | null
  paymentNote: string | null
  paymentClaimedAt: string | null
  paidAt: string | null
  cargoSignedAt: string | null
  cargoSignerName: string | null
  cargoSignerEmail: string | null
  cargoSignIp: string | null
  approvedAt: string | null
  approvedByName: string | null
  warehouseNote: string | null
  rejectReason: string | null
  terminationRequestedBy: string | null
  terminationReason: string | null
  terminationEffectiveAt: string | null
  terminatedAt: string | null
  templateVersion: number
  events: ContractEventRow[]
  cargo: { id: number; name: string; slug: string } | null
  guestEmail: string | null
  warehouse: { id: number; name: string }
  cargoMark: string | null
  suggestedMark: string | null
  receiveReady: boolean
  receiveAddress: ReceiveAddress | null
}

export default function SuperContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const api = `/api/super/warehouse-contracts/${id}`
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [paid, setPaid] = useState(false)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'' | 'reject' | 'terminate'>('')
  const [immediate, setImmediate] = useState(false)
  const [mark, setMark] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(api)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'Ачаалахад алдаа гарлаа'); return }
    setD(data)
    setNote(data.warehouseNote ?? '')
    setMark(data.suggestedMark ?? '')
  }, [api])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true)
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error || 'Алдаа гарлаа'); load(); return }
    toast.success(success)
    setMode('')
    setReason('')
    load()
  }

  if (error) return <div className="page-wide"><Link href="/super/contracts" style={back}>← Гэрээнүүд</Link><p className="msg-error">{error}</p></div>
  if (!d) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  const reviewable = d.status === 'AWAITING_PAYMENT' || d.status === 'PAYMENT_REVIEW'
  const live = d.status === 'ACTIVE' || d.status === 'TERMINATION_PENDING'

  return (
    <div className="page-wide" style={{ maxWidth: 1100 }}>
      <style>{CSS}</style>
      <Link href="/super/contracts" style={back}>← Гэрээнүүд</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ margin: 0 }}>{d.contractNo}</h1>
        <StatusBadge status={d.status} />
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: '0.2rem 0 1.2rem' }}>
        {d.values.cargoLegalName || d.cargo?.name || d.guestEmail}{' '}
        ({d.cargo ? `${d.cargo.slug}.aicargo.mn` : `бүртгэлгүй · ${d.guestEmail}`}) ↔{' '}
        <Link href={`/super/warehouses/${d.warehouse.id}`}>{d.warehouse.name}</Link> · загвар v{d.templateVersion}
      </p>

      <div className="sc-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
          {reviewable && (
            <div className="card sc-box" style={{ borderColor: d.status === 'PAYMENT_REVIEW' ? '#2563eb' : '#d97706' }}>
              <h3 style={h3}>{d.status === 'PAYMENT_REVIEW' ? 'Карго төлбөр төлсөн гэж мэдэгдсэн' : 'Төлбөр хүлээгдэж байна'}</h3>
              <div className="sc-kv">
                <span>Дүн</span><b>{formatMnt(d.fee)}</b>
                <span>Данс</span><b>{d.payToBank} · {d.payToAccount} · {d.payToHolder}</b>
                <span>Гүйлгээний утга</span><b>{d.contractNo}</b>
                {d.paymentClaimedAt && <><span>Мэдэгдсэн</span><b>{formatDateTime(d.paymentClaimedAt)}</b></>}
                {d.paymentNote && <><span>Тайлбар</span><b>{d.paymentNote}</b></>}
              </div>
              {d.paymentProofUrl && (
                <a href={d.paymentProofUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.paymentProofUrl} alt="Гүйлгээний баримт" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, background: 'var(--surface2)', marginTop: '0.6rem' }} />
                </a>
              )}

              {mode !== 'reject' ? (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <label className="sc-check">
                    <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />
                    {formatMnt(d.fee)} агуулахын дансанд орсныг шалгасан
                  </label>
                  <MarkInput mark={mark} setMark={setMark} receiveReady={d.receiveReady} warehouseId={d.warehouse.id} />
                  <textarea className="input" rows={2} placeholder="Каргод харагдах тэмдэглэл (заавал биш): зай талбайн байршил, ачаа хүлээлгэн өгөх заавар..."
                    value={note} onChange={e => setNote(e.target.value)} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    <button className="btn" disabled={!paid || busy} onClick={() => act({ action: 'approve', paidConfirmed: true, note, cargoMark: mark }, 'Гэрээ хүчин төгөлдөр боллоо')}>
                      Батлах — А талыг төлөөлж
                    </button>
                    <button className="btn-ghost" onClick={() => setMode('reject')}>Татгалзах</button>
                  </div>
                </div>
              ) : (
                <ReasonForm label="Татгалзах шалтгаан (каргод харагдана)" reason={reason} setReason={setReason} busy={busy}
                  confirm="Татгалзах" onCancel={() => setMode('')}
                  onConfirm={() => act({ action: 'reject', reason }, 'Татгалзлаа')} />
              )}
            </div>
          )}

          {live && (
            <div className="card sc-box" style={{ borderColor: d.status === 'ACTIVE' ? 'var(--green)' : '#ea580c' }}>
              {d.status === 'TERMINATION_PENDING' ? (
                <>
                  <h3 style={h3}>{d.terminationEffectiveAt ? formatDateTime(d.terminationEffectiveAt).slice(0, 10) : ''}-нд цуцлагдана</h3>
                  <p style={p}>{d.terminationRequestedBy === 'CARGO' ? 'Карго' : 'Агуулах (super admin)'} мэдэгдэл өгсөн. Шалтгаан: {d.terminationReason}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn-ghost" disabled={busy} onClick={() => confirm('Цуцлалтыг буцаах уу?') && act({ action: 'cancel-termination' }, 'Гэрээ хүчинтэй хэвээр')}>Цуцлалтыг буцаах</button>
                    <button className="btn-ghost" style={{ color: 'var(--danger)' }} disabled={busy}
                      onClick={() => confirm('Хугацаа хүлээлгүй одоо цуцлах уу?') && act({ action: 'terminate', immediate: true, reason: d.terminationReason ?? 'Хугацаанаас өмнө цуцалсан' }, 'Цуцлагдлаа')}>
                      Одоо цуцлах
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={h3}>Гэрээ хүчинтэй</h3>
                  <p style={p}>{d.approvedAt && formatDateTime(d.approvedAt)} · баталсан {d.approvedByName}</p>
                </>
              )}

              <div style={{ marginTop: '0.8rem' }}>
                {d.receiveAddress && (
                  <div className="sc-kv" style={{ marginBottom: '0.7rem' }}>
                    <span>收货人</span><b>{d.receiveAddress.receiver}</b>
                    <span>手机号</span><b>{d.receiveAddress.phone}</b>
                    <span>地区</span><b>{d.receiveAddress.region}</b>
                    <span>详细地址</span><b>{d.receiveAddress.address}</b>
                  </div>
                )}
                <MarkInput mark={mark} setMark={setMark} receiveReady={d.receiveReady} warehouseId={d.warehouse.id} />
                <button className="btn-ghost" style={{ fontSize: '0.8rem', marginBottom: '0.8rem' }} disabled={busy || !mark.trim() || mark.trim().toUpperCase() === (d.cargoMark ?? '')}
                  onClick={() => act({ action: 'mark', cargoMark: mark }, 'Тэмдэг хадгалагдлаа')}>Тэмдэг хадгалах</button>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)' }}>Каргод харагдах тэмдэглэл</label>
                <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} />
                <button className="btn-ghost" style={{ marginTop: '0.4rem', fontSize: '0.8rem' }} disabled={busy || note === (d.warehouseNote ?? '')}
                  onClick={() => act({ action: 'note', note }, 'Хадгалагдлаа')}>Тэмдэглэл хадгалах</button>
              </div>

              {d.status === 'ACTIVE' && (
                mode !== 'terminate' ? (
                  <button className="sc-link" style={{ marginTop: '0.9rem' }} onClick={() => setMode('terminate')}>Гэрээ цуцлах (А тал)</button>
                ) : (
                  <ReasonForm label="Цуцлах шалтгаан (каргод харагдана)" reason={reason} setReason={setReason} busy={busy}
                    confirm={immediate ? 'Одоо цуцлах' : `${TERMINATION_NOTICE_DAYS} хоногийн мэдэгдэл өгөх`}
                    onCancel={() => setMode('')}
                    onConfirm={() => act({ action: 'terminate', reason, immediate }, 'Хадгалагдлаа')}>
                    <label className="sc-check">
                      <input type="checkbox" checked={immediate} onChange={e => setImmediate(e.target.checked)} />
                      Мэдэгдлийн хугацаа хүлээлгүй шууд цуцлах (6.1-р заалт)
                    </label>
                  </ReasonForm>
                )
              )}
            </div>
          )}

          {d.status === 'REJECTED' && <div className="card sc-box"><h3 style={h3}>Татгалзсан</h3><p style={p}>{d.rejectReason}</p></div>}
          {d.status === 'TERMINATED' && <div className="card sc-box"><h3 style={h3}>Цуцлагдсан · {d.terminatedAt && formatDateTime(d.terminatedAt)}</h3><p style={p}>{d.terminationReason}</p></div>}

          {PDF_STATUSES.includes(d.status) && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a className="btn" href={`${api}/pdf`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>PDF нээх</a>
              <a className="btn-ghost" href={`${api}/pdf`} download style={{ textDecoration: 'none' }}>Татах</a>
            </div>
          )}

          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.6rem' }}>Гэрээний эх бичвэр</summary>
            <ContractDocument body={d.body} contractNo={d.contractNo} />
          </details>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card sc-box">
            <h3 style={h3}>Б тал (карго)</h3>
            <div className="sc-kv">
              {d.fields.map(f => <FieldRow key={f.key} label={f.label} value={d.values[f.key]} />)}
            </div>
          </div>
          {d.cargoSignedAt && (
            <div className="card sc-box">
              <h3 style={h3}>Цахим баталгаажуулалт</h3>
              <div className="sc-kv">
                <span>Огноо</span><b>{formatDateTime(d.cargoSignedAt)}</b>
                <span>Нэр</span><b>{d.cargoSignerName}</b>
                <span>И-мэйл</span><b>{d.cargoSignerEmail}</b>
                <span>IP</span><b>{d.cargoSignIp ?? '—'}</b>
                <span>SHA-256</span><b style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.7rem' }}>{d.bodyHash}</b>
              </div>
            </div>
          )}
          <div className="card sc-box">
            <h3 style={h3}>Түүх</h3>
            <ContractTimeline events={d.events} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value?: string }) {
  return <><span>{label}</span><b>{value || '—'}</b></>
}

function ReasonForm({ label, reason, setReason, busy, confirm, onConfirm, onCancel, children }: {
  label: string; reason: string; setReason: (v: string) => void; busy: boolean
  confirm: string; onConfirm: () => void; onCancel: () => void; children?: React.ReactNode
}) {
  return (
    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>{label}</label>
      <textarea className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)} style={{ marginTop: 4 }} />
      {children}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button className="btn" style={{ background: 'var(--danger)' }} disabled={busy || reason.trim().length < 3} onClick={onConfirm}>{confirm}</button>
        <button className="btn-ghost" onClick={onCancel}>Болих</button>
      </div>
    </div>
  )
}

const back: React.CSSProperties = { fontSize: '0.82rem', color: 'var(--muted)', display: 'inline-block', marginBottom: '0.6rem' }
const h3: React.CSSProperties = { fontSize: '0.92rem', fontWeight: 700, margin: '0 0 0.6rem' }
const p: React.CSSProperties = { fontSize: '0.84rem', margin: '0 0 0.6rem', lineHeight: 1.55 }

const CSS = `
.sc-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 1.25rem; align-items: start; }
.sc-box { padding: 1rem 1.15rem; }
.sc-kv { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 0.35rem 0.6rem; font-size: 0.82rem; }
.sc-kv span { color: var(--muted); }
.sc-kv b { font-weight: 600; overflow-wrap: anywhere; }
.sc-check { display: flex; gap: 0.5rem; align-items: center; font-size: 0.84rem; font-weight: 600; margin: 0.4rem 0 0.6rem; cursor: pointer; }
.sc-check input { width: 16px; height: 16px; }
.sc-link { background: none; border: none; padding: 0; color: var(--danger); cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 600; }
@media (max-width: 900px) { .sc-grid { grid-template-columns: minmax(0, 1fr); } }
`

// Агуулах ачааг ялгах каргогийн тэмдэг — хаягт "<хаяг> B88 + нэр + утас" болж орно
function MarkInput({ mark, setMark, receiveReady, warehouseId }: { mark: string; setMark: (v: string) => void; receiveReady: boolean; warehouseId: number }) {
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Каргогийн тэмдэг (Эрээний хаягт орно)</label>
      <input className="input" placeholder="жш: B88" maxLength={16} value={mark}
        onChange={e => setMark(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
      {!receiveReady && (
        <p style={{ fontSize: '0.74rem', color: '#d97706', margin: '0.3rem 0 0' }}>
          Агуулахын хүлээн авах хаяг бөглөгдөөгүй тул карго хаягаа авахгүй.{' '}
          <Link href={`/super/warehouses/${warehouseId}`}>Тохируулах →</Link>
        </p>
      )}
    </div>
  )
}
