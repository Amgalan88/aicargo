'use client'
import { MAX_EREEN_ADDRESSES, type EreenAddress } from '@/lib/ereen-address'

// Нэмэлт Эрээний хаягууд (жш: "Бөөн ачаа") — админы Тохиргоо болон super admin-ы карго засах хэсэгт.
// Үндсэн хаягийн талбарууд хуучнаараа; энд нэр + нэмэлт хаягийг засна.

const EMPTY: EreenAddress = { name: '', receiver: '', phone: '', region: '', address: '' }

export default function EreenAddressExtras({ title, onTitle, extras, onExtras, disabled }: {
  title: string
  onTitle: (v: string) => void
  extras: EreenAddress[]
  onExtras: (v: EreenAddress[]) => void
  disabled?: boolean
}) {
  const set = (i: number, k: keyof EreenAddress, v: string) => onExtras(extras.map((a, j) => (j === i ? { ...a, [k]: v } : a)))
  const canAdd = extras.length < MAX_EREEN_ADDRESSES - 1

  return (
    <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.9rem' }}>
      {extras.length > 0 && (
        <div className="form-group" style={{ margin: 0 }}>
          <label>Дээрх хаягийн нэр <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(хэрэглэгчид сонголт болж харагдана)</span></label>
          <input className="input" disabled={disabled} placeholder="жш: Жижиглэн ачаа" maxLength={40}
            value={title} onChange={e => onTitle(e.target.value)} />
        </div>
      )}

      {extras.map((a, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '0.9rem', display: 'grid', gap: '0.65rem', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <b style={{ fontSize: '0.85rem' }}>Хаяг {i + 2}</b>
            {!disabled && (
              <button type="button" onClick={() => onExtras(extras.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', padding: 0 }}>
                Хасах
              </button>
            )}
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Нэр</label>
            <input className="input" disabled={disabled} placeholder="жш: Бөөн ачаа" maxLength={40}
              value={a.name} onChange={e => set(i, 'name', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>收货人 (Хүлээн авагчийн нэр)</label>
              <input className="input" disabled={disabled} placeholder="жш: 德玛" value={a.receiver} onChange={e => set(i, 'receiver', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>手机号 (Утас)</label>
              <input className="input" disabled={disabled} placeholder="жш: 15148316088" value={a.phone} onChange={e => set(i, 'phone', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>地区 (Бүс)</label>
            <input className="input" disabled={disabled} placeholder="内蒙古 · 锡林郭勒盟 · 二连浩特市" value={a.region} onChange={e => set(i, 'region', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>详细地址 (Дэлгэрэнгүй хаяг)</label>
            <input className="input" disabled={disabled} placeholder="жш: 环宇国际物流园区 X2号库5号门" value={a.address} onChange={e => set(i, 'address', e.target.value)} />
          </div>
        </div>
      ))}

      {!disabled && canAdd && (
        <button type="button" className="btn-ghost" onClick={() => onExtras([...extras, { ...EMPTY }])}
          style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
          + Хаяг нэмэх
        </button>
      )}
      {!disabled && canAdd && extras.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '-0.4rem 0 0' }}>
          Жижиглэн, бөөн ачаа гэх мэт өөр хаягаар ачаа авдаг бол нэмнэ. Хэрэглэгчид хаяг бүрийг нэрээр нь сонгож харна.
        </p>
      )}
    </div>
  )
}
