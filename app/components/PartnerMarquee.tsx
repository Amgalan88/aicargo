'use client'
// Түншлэгч каргонуудын лого — хоёр мөр, эсрэг чиглэлд аажуухан гулсана.
// Хулгана очиход зогсоно; prefers-reduced-motion үед энгийн тор болно (CSS).
import type { ReactNode } from 'react'

interface PartnerCargo { id: number; name: string; logoUrl: string | null }

function Item({ c }: { c: PartnerCargo }) {
  return (
    <div className="pm-item" title={c.name}>
      {c.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logoUrl} alt={c.name} className="pm-logo" loading="lazy" />
      ) : (
        <span className="pm-logo pm-fallback">{c.name.trim().charAt(0).toUpperCase()}</span>
      )}
      <span className="pm-name">{c.name}</span>
    </div>
  )
}

function Row({ items, reverse, seconds }: { items: PartnerCargo[]; reverse?: boolean; seconds: number }) {
  // Жагсаалтыг хоёр давтаж -50% хүртэл гулсуулна — тасралтгүй давталт
  return (
    <div className="pm-row">
      <div className={`pm-track${reverse ? ' pm-rev' : ''}`} style={{ animationDuration: `${seconds}s` }}>
        {items.map(c => <Item key={`a${c.id}`} c={c} />)}
        <div className="pm-dup" aria-hidden>
          {items.map(c => <Item key={`b${c.id}`} c={c} />)}
        </div>
      </div>
    </div>
  )
}

// total — нийт каргоны тоо (hero-гийн статистиктай ижил); лого нь зөвхөн түүний нэг хэсэг
export default function PartnerMarquee({ cargos, total, children }: { cargos: PartnerCargo[]; total?: number; children?: ReactNode }) {
  if (cargos.length === 0) return null
  // Цөөн бол нэг мөр, олон бол хоёр мөрөнд хуваана
  const twoRows = cargos.length >= 12
  const half = Math.ceil(cargos.length / 2)
  const rows = twoRows ? [cargos.slice(0, half), cargos.slice(half)] : [cargos]
  // Лого бүрт ~2.2с — тоо нэмэгдэхэд хурд тогтвортой
  const secs = (n: number) => Math.max(24, n * 2.2)

  return (
    <section className="pm" aria-labelledby="pm-title">
      <p className="eyebrow" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Түншлэгч каргонууд</p>
      <h2 id="pm-title" className="pm-title">
        <span>{Math.max(total ?? 0, cargos.length)}+ карго</span> AiCargo-г өдөр бүр ашиглаж байна
      </h2>
      <div className="pm-rows">
        {rows.map((r, i) => <Row key={i} items={r} reverse={i === 1} seconds={secs(r.length)} />)}
      </div>
      {children}
    </section>
  )
}
