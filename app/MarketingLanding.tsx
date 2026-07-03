'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavLogo from './components/NavLogo'

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Авсан',
}

const FEATURES = [
  { icon: '🌐', title: 'Өөрийн вэб хаяг', desc: 'tanaikargo.aicargo.mn — таны нэр, лого, өнгөтэй. Хэрэглэгч тань утсандаа апп шиг суулгана.' },
  { icon: '📦', title: 'Ачааны бүрэн хяналт', desc: 'Бүртгүүлсэн → Эрээнд → Ирсэн → Олгосон. Хэрэглэгч бүр өөрийн ачааг бодит цагт хардаг.' },
  { icon: '📊', title: 'Excel bulk оруулалт', desc: 'Олон зуун трак кодыг Excel файлаас нэг дор. Гараар шивэх цаг дууслаа.' },
  { icon: '✨', title: 'AI туслах', desc: 'Хэрэглэгчийн "ачаа хаана?", "хэд төлөх?" асуултад AI хариулна — таны утас чимээгүй болно.' },
  { icon: '🔔', title: 'Автомат мэдэгдэл', desc: 'Шинэ ачаа бүртгэгдэхэд танд, ачаа ирэхэд хэрэглэгчид мэдэгдэнэ.' },
  { icon: '💰', title: 'Тайлан ба орлого', desc: 'Өдрийн олголт, орлогын дүн, хэрэглэгч бүрийн түүх — нэг дэлгэцээс.' },
]

const STEPS = [
  { n: '1', title: 'Бүртгүүл', desc: 'Каргоныхоо нэр, вэб хаягаа сонгоод и-мэйлээ баталгаажуул. 2 минут.' },
  { n: '2', title: 'Тохируул', desc: 'Эрээний хаяг, тариф, банкны мэдээллээ оруул.' },
  { n: '3', title: 'Хэрэглэгчдээ урь', desc: 'Линкээ хуваалц — хэрэглэгчид өөрсдөө бүртгүүлж, ачаагаа хянана.' },
]

interface PartnerCargo { id: number; name: string; logoUrl: string | null }
interface Warehouse {
  id: number; name: string; description: string | null
  phone: string | null; wechat: string | null; address: string | null
  imageUrl: string | null
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer',
      fontSize: '0.74rem', color: copied ? 'var(--green)' : 'var(--text)',
      fontFamily: 'inherit',
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      {copied ? '✓ Хуулагдлаа' : value}
    </button>
  )
}

export default function MarketingLanding({ stats, partnerCargos = [], warehouses = [] }: {
  stats: { cargos: number; users: number; shipments: number }
  partnerCargos?: PartnerCargo[]
  warehouses?: Warehouse[]
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [whDetail, setWhDetail] = useState<Warehouse | null>(null)

  async function search() {
    const val = query.trim().toUpperCase().replace(/\s+/g, '')
    if (!val) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(val)}`)
      if (res.ok) setResult(await res.json())
      else setError('Бараа олдсонгүй. Трак кодоо шалгана уу.')
    } catch {
      setError('Холболтын алдаа гарлаа.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className="nav">
        <NavLogo />
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/login">Нэвтрэх</Link>
          <Link href="/register">Бүртгүүлэх</Link>
          <Link href="/signup-cargo" className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
            Карго нээх
          </Link>
        </div>
      </nav>

      <div style={{ flex: 1 }}>

        {/* ── HERO ── */}
        <section style={{ padding: '3.5rem 5% 2.5rem', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            display: 'inline-block', fontSize: '0.72rem', fontWeight: 700,
            color: 'var(--accent)', background: 'var(--accent-light)',
            border: '1px solid var(--accent)', borderRadius: 100,
            padding: '0.25rem 0.85rem', marginBottom: '1rem',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            ✨ Монголын анхны AI-суурьтай карго платформ
          </div>
          <h1 style={{ fontSize: 'clamp(1.7rem, 5vw, 2.6rem)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, marginBottom: '0.9rem' }}>
            Карго бизнесээ<br />
            <span style={{ color: 'var(--accent)' }}>5 минутад онлайн</span> болго
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 1.5rem' }}>
            Өөрийн вэб хаягтай ачаа хяналтын систем — бүртгэлээс олголт хүртэл.
            Хэрэглэгч тань ачаагаа өөрөө хянаж, AI туслах асуултад нь хариулна.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <Link href="/signup-cargo" className="btn" style={{ padding: '0.8rem 1.8rem', fontSize: '0.95rem', textDecoration: 'none' }}>
              Каргогоо үнэгүй нээх →
            </Link>
            <a href="#track" className="btn-ghost" style={{ padding: '0.8rem 1.5rem', fontSize: '0.95rem', textDecoration: 'none' }}>
              Ачаагаа шалгах
            </a>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '2rem' }}>
            Эхний 30 хоног үнэгүй · цаашид сарын ₮50,000
          </p>

          {/* Бодит тоо — итгэл төрүүлэх hook */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(1.5rem, 6vw, 3.5rem)', flexWrap: 'wrap' }}>
            {[
              { v: stats.cargos, label: 'Карго компани' },
              { v: stats.users, label: 'Хэрэглэгч' },
              { v: stats.shipments, label: 'Бүртгэгдсэн ачаа' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
                  {s.v.toLocaleString()}+
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ИТГЭЛ: түншлэгч байгууллагуудын гүйдэг лого ── */}
        {partnerCargos.length > 0 && (
          <section style={{ padding: '1.5rem 0 2rem', overflow: 'hidden' }}>
            <p style={{
              textAlign: 'center', fontSize: '0.72rem', fontWeight: 700,
              color: 'var(--muted)', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: '1rem',
            }}>
              Манай түншлэгч байгууллагууд
            </p>
            <style>{`
              @keyframes lpMarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
              .lp-marquee-track { animation: lpMarquee ${Math.max(18, partnerCargos.length * 3.5)}s linear infinite; }
              .lp-marquee:hover .lp-marquee-track { animation-play-state: paused; }
            `}</style>
            <div className="lp-marquee" style={{
              overflow: 'hidden',
              maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
            }}>
              <div className="lp-marquee-track" style={{
                display: 'flex', gap: '0.75rem', width: 'max-content',
                padding: '2px 0',
              }}>
                {[0, 1].map(copy => (
                  <div key={copy} aria-hidden={copy === 1} style={{ display: 'flex', gap: '0.75rem', paddingRight: '0.75rem' }}>
                    {partnerCargos.map(c => (
                      <div key={`${copy}-${c.id}`} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.45rem 0.9rem', background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: 100,
                        flexShrink: 0,
                      }}>
                        {c.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logoUrl} alt={c.name} width={22} height={22}
                            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── ЭРЭЭНИЙ ТҮНШЛЭГЧ АГУУЛАХУУД (marquee-гийн доор, жижиг карт + дэлгэрэнгүй modal) ── */}
        {warehouses.length > 0 && (
          <section style={{ padding: '0.5rem 5% 2.25rem' }}>
            <div style={{ maxWidth: 860, margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.3rem' }}>
                🇨🇳 Эрээний түншлэгч агуулахууд
              </h2>
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Хамтран ажилладаг найдвартай агуулахууд — дарж дэлгэрэнгүй үзнэ үү
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.7rem' }}>
                {warehouses.map(w => (
                  <button key={w.id} onClick={() => setWhDetail(w)} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column', textAlign: 'left',
                    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                    transition: 'border-color 0.12s, transform 0.12s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
                  >
                    {w.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.imageUrl} alt={w.name}
                        style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{
                        width: '100%', height: 84, background: 'var(--surface2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem',
                      }}>🏭</div>
                    )}
                    <div style={{ padding: '0.55rem 0.7rem 0.65rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>Дэлгэрэнгүй →</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── FEATURES ── */}
        <section style={{ padding: '2.5rem 5%', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.4rem' }}>
              Каргод чинь хэрэгтэй бүхэн
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.75rem' }}>
              Excel, дэвтэр, мессежийн орооцолдооноос гарцгаая
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem' }}>
              {FEATURES.map(f => (
                <div key={f.title} style={{
                  padding: '1.1rem 1.2rem', background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>{f.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{f.title}</div>
                  <div style={{ fontSize: '0.79rem', color: 'var(--muted)', lineHeight: 1.55 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section style={{ padding: '2.5rem 5%', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', marginBottom: '1.75rem' }}>
            Хэрхэн эхлэх вэ?
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '1rem', margin: '0 auto 0.6rem',
                }}>{s.n}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{s.title}</div>
                <div style={{ fontSize: '0.79rem', color: 'var(--muted)', lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── TRACK SEARCH (хэрэглэгчдэд) ── */}
        <section id="track" style={{ padding: '2.5rem 5%', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.4rem' }}>
              📦 Ачаагаа шалгах
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Аль ч каргогийн хэрэглэгч трак кодоороо шалгаж болно
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <input
                className="input"
                placeholder="JT5364974054841"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                style={{ minWidth: 0 }}
              />
              <button className="btn" onClick={search} disabled={loading} style={{ flexShrink: 0 }}>
                {loading ? '...' : 'Хайх'}
              </button>
            </div>
            {error && <p className="msg-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
            {result && (
              <div className="card" style={{ marginTop: '1rem' }}>
                {result.cargo?.name && (
                  <div className="card-row">
                    <span className="label">Карго</span>
                    <strong style={{ color: 'var(--accent)' }}>{result.cargo.name}</strong>
                  </div>
                )}
                <div className="card-row">
                  <span className="label">Трак код</span>
                  <strong style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{result.trackCode}</strong>
                </div>
                <div className="card-row">
                  <span className="label">Статус</span>
                  <span className={`badge badge-${result.status}`}>{STATUS_LABEL[result.status] ?? result.status}</span>
                </div>
                {result.adminPrice && (
                  <div className="card-row">
                    <span className="label">Төлбөр</span>
                    <strong style={{ color: 'var(--accent)' }}>₮{Number(result.adminPrice).toLocaleString()}</strong>
                  </div>
                )}
                {result.updatedAt && (
                  <div className="card-row">
                    <span className="label">Огноо</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {new Date(result.updatedAt).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section style={{ padding: '3rem 5%', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Өнөөдөр эхэлье
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Эхний 30 хоног бүрэн үнэгүй · цаашид сарын ₮50,000 · 2 минутад бэлэн
          </p>
          <Link href="/signup-cargo" className="btn" style={{ padding: '0.8rem 2rem', fontSize: '0.95rem', textDecoration: 'none' }}>
            Каргогоо үнэгүй нээх →
          </Link>
        </section>
      </div>

      {/* Агуулахын дэлгэрэнгүй modal */}
      {whDetail && (
        <div onClick={() => setWhDetail(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: 14, overflow: 'hidden',
            width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            {whDetail.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={whDetail.imageUrl} alt={whDetail.name}
                style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{
                width: '100%', height: 120, background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem',
              }}>🏭</div>
            )}
            <div style={{ padding: '1.1rem 1.25rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{whDetail.name}</h3>
                <button onClick={() => setWhDetail(null)} aria-label="Хаах" style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: '50%', width: 28, height: 28, cursor: 'pointer',
                  fontSize: '0.85rem', lineHeight: 1, color: 'var(--muted)', flexShrink: 0,
                }}>✕</button>
              </div>
              {whDetail.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.65, margin: '0 0 0.75rem', whiteSpace: 'pre-wrap' }}>
                  {whDetail.description}
                </p>
              )}
              {whDetail.address && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                  📍 {whDetail.address}
                </p>
              )}
              {(whDetail.phone || whDetail.wechat) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {whDetail.phone && <CopyChip label="📞" value={whDetail.phone} />}
                  {whDetail.wechat && <CopyChip label="WeChat:" value={whDetail.wechat} />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '0.9rem 5%',
        fontSize: '0.7rem',
        color: 'var(--muted)',
        lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 600 }}>&quot;Бизнес интеллижэнс&quot; ХХК хөгжүүлж байна</div>
        <div>Бүх эрх хуулиар хамгаалагдсан болно · 85205258 · 2026</div>
      </footer>
    </div>
  )
}
