'use client'
import { useState } from 'react'
import type { UserDict } from '@/lib/user-i18n'

export default function PriceCalculator({ priceCubic, priceWeight, priceWeightUnit, t }: {
  priceCubic: number | null
  priceWeight: number | null
  priceWeightUnit: string
  t: UserDict
}) {
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState<'cm' | 'mm'>('cm')
  const [wUnit, setWUnit] = useState<'kg' | 't'>('kg')
  const [len, setLen] = useState('')
  const [wid, setWid] = useState('')
  const [hei, setHei] = useState('')
  const [kg, setKg] = useState('')

  if (!priceCubic && !priceWeight) return null

  // Үүнээс дээш бодогдвол утга нь бодитой бус эсвэл тусгай тохиролцоо шаардлагатай
  // гэж үзээд үнэ харуулахын оронд карготой холбогдохыг зөвлөнө
  const MAX_PRICE = 10_000_000

  const divisor = unit === 'cm' ? 1e6 : 1e9
  const l = Number(len), w = Number(wid), h = Number(hei)
  const weightKg = Number(kg) * (wUnit === 't' ? 1000 : 1)
  const hasDims = l > 0 && w > 0 && h > 0
  const hasWeight = weightKg > 0

  const volumeM3 = hasDims ? (l * w * h) / divisor : 0
  const perKg = priceWeight ? (priceWeightUnit === 't' ? priceWeight / 1000 : priceWeight) : 0

  const cubicPrice = priceCubic && hasDims ? volumeM3 * priceCubic : null
  const weightPrice = priceWeight && hasWeight ? weightKg * perKg : null

  const final = cubicPrice !== null && weightPrice !== null
    ? Math.max(cubicPrice, weightPrice)
    : cubicPrice ?? weightPrice
  const winner = cubicPrice !== null && weightPrice !== null
    ? (weightPrice >= cubicPrice ? 'weight' : 'cubic')
    : cubicPrice !== null ? 'cubic' : weightPrice !== null ? 'weight' : null

  // Хоёр төрлийн үнэ хоёул тохируулагдсан мөртлөө нэгийг нь л бөглөсөн үед сануулна
  const fillBothHint = !!priceCubic && !!priceWeight && final !== null &&
    (cubicPrice === null || weightPrice === null)
  const tooLarge = final !== null && final > MAX_PRICE

  const fmtT = (n: number) => `₮${Math.round(n).toLocaleString()}`

  const dimField = (label: string, value: string, set: (v: string) => void) => (
    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 0 }}>
      <label style={{ fontSize: '0.75rem' }}>{label} ({unit})</label>
      <input className="input" type="number" min="0" inputMode="decimal" placeholder="0"
        value={value} onChange={e => set(e.target.value)}
        style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem' }} />
    </div>
  )

  return (
    <div className="card" style={{ marginTop: '1.5rem', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.85rem 1.1rem', background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', color: 'var(--text)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/><line x1="16" y1="18" x2="16" y2="18.01"/>
          </svg>
          {t.calcTitle}
        </span>
        <span style={{
          fontSize: '0.7rem', color: 'var(--muted)',
          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block',
        }}>▶</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '1rem 1.1rem' }}>
          <p style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '0.9rem' }}>{t.calcHint}</p>

          {priceCubic && (
            <>
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem' }}>
                {(['cm', 'mm'] as const).map(u => (
                  <button key={u} type="button" onClick={() => setUnit(u)} style={{
                    padding: '0.25rem 0.8rem', borderRadius: 100, border: '1px solid',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700,
                    borderColor: unit === u ? 'var(--accent)' : 'var(--border)',
                    background: unit === u ? 'var(--accent)' : 'var(--surface)',
                    color: unit === u ? '#fff' : 'var(--muted)',
                  }}>{u}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {dimField(t.calcLength, len, setLen)}
                {dimField(t.calcWidth, wid, setWid)}
                {dimField(t.calcHeight, hei, setHei)}
              </div>
            </>
          )}

          {priceWeight && (
            <div className="form-group" style={{ marginBottom: '0.75rem', maxWidth: 250 }}>
              <label style={{ fontSize: '0.75rem' }}>{t.calcWeight}</label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input className="input" type="number" min="0" inputMode="decimal" placeholder="0"
                  value={kg} onChange={e => setKg(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.9rem', flex: 1, minWidth: 0 }} />
                {(['kg', 't'] as const).map(u => (
                  <button key={u} type="button" onClick={() => setWUnit(u)} style={{
                    padding: '0 0.7rem', borderRadius: 100, border: '1px solid',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                    borderColor: wUnit === u ? 'var(--accent)' : 'var(--border)',
                    background: wUnit === u ? 'var(--accent)' : 'var(--surface)',
                    color: wUnit === u ? '#fff' : 'var(--muted)',
                  }}>{u === 'kg' ? 'кг' : 'тонн'}</button>
                ))}
              </div>
            </div>
          )}

          {final !== null && final > 0 && (
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.75rem' }}>
              {tooLarge ? (
                <p style={{
                  fontSize: '0.82rem', lineHeight: 1.6, margin: 0,
                  padding: '0.6rem 0.8rem', borderRadius: 8,
                  background: 'var(--accent-light)', border: '1px solid var(--accent)',
                  color: 'var(--text)',
                }}>
                  ⚠ {t.calcTooLarge}
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                    {cubicPrice !== null && (
                      <span style={{
                        fontSize: '0.78rem', borderRadius: 100, padding: '0.2rem 0.75rem',
                        border: `1px solid ${winner === 'cubic' ? 'var(--accent)' : 'var(--border)'}`,
                        background: winner === 'cubic' ? 'var(--accent-light)' : 'var(--surface2)',
                        color: winner === 'cubic' ? 'var(--accent)' : 'var(--muted)',
                        fontWeight: winner === 'cubic' ? 700 : 500,
                      }}>
                        {t.calcCubicPrice} ({volumeM3.toFixed(3)} м³): {fmtT(cubicPrice)}
                      </span>
                    )}
                    {weightPrice !== null && (
                      <span style={{
                        fontSize: '0.78rem', borderRadius: 100, padding: '0.2rem 0.75rem',
                        border: `1px solid ${winner === 'weight' ? 'var(--accent)' : 'var(--border)'}`,
                        background: winner === 'weight' ? 'var(--accent-light)' : 'var(--surface2)',
                        color: winner === 'weight' ? 'var(--accent)' : 'var(--muted)',
                        fontWeight: winner === 'weight' ? 700 : 500,
                      }}>
                        {t.calcWeightPrice} ({weightKg.toLocaleString()} кг): {fmtT(weightPrice)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{t.calcResult}:</span>
                    <strong style={{ fontSize: '1.3rem', color: 'var(--accent)' }}>{fmtT(final)}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {winner === 'cubic' ? t.calcByCubic : t.calcByWeight}
                    </span>
                  </div>
                  {fillBothHint && (
                    <p style={{ fontSize: '0.74rem', color: 'var(--accent)', marginTop: '0.5rem', fontWeight: 600 }}>
                      💡 {t.calcFillBoth}
                    </p>
                  )}
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.5rem' }}>{t.calcDisclaimer}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
