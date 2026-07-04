'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import NavLogo from './components/NavLogo'

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Авсан',
}

// Facebook хуудасны URL (хоосон үед footer-т гарахгүй)
const FB_URL = 'https://www.facebook.com/share/1BSw6dQ22F/'

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
  const whScroll = useRef<HTMLDivElement>(null)

  function scrollWh(dir: -1 | 1) {
    whScroll.current?.scrollBy({ left: dir * 340, behavior: 'smooth' })
  }

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
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto', flexShrink: 0 }}>
          <Link href="/login" style={{ whiteSpace: 'nowrap' }}>Нэвтрэх</Link>
          <Link href="/register" style={{ whiteSpace: 'nowrap' }}>Бүртгүүлэх</Link>
          <Link href="/signup-cargo" className="btn" style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
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

        {/* ── БҮТЭЭГДЭХҮҮНИЙ ХАРАГДАЦ (CSS mockup) ── */}
        <section style={{ padding: '0 5% 2.5rem', maxWidth: 900, margin: '0 auto' }}>
          <style>{`
            .lp-mock-wrap { display: flex; gap: 1.25rem; align-items: flex-start; justify-content: center; }
            .lp-mock-phone { flex-shrink: 0; }
            @media (max-width: 700px) {
              .lp-mock-wrap { flex-direction: column; align-items: center; }
            }
          `}</style>
          <div className="lp-mock-wrap">

            {/* Browser frame — админы харагдац */}
            <div style={{
              flex: 1, minWidth: 0, maxWidth: 560, width: '100%',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,0.10)',
            }}>
              {/* Browser bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ display: 'flex', gap: 4 }}>
                  {['#f87171', '#fbbf24', '#34d399'].map(c => (
                    <span key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
                  ))}
                </span>
                <span style={{
                  flex: 1, textAlign: 'center', fontSize: '0.68rem', color: 'var(--muted)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '2px 10px', maxWidth: 220, margin: '0 auto',
                }}>
                  tanaikargo.aicargo.mn/admin
                </span>
              </div>
              {/* Админ агуулга */}
              <div style={{ padding: '0.9rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {[
                    { v: '5,937', l: 'Нийт ачаа' },
                    { v: '48', l: 'Өнөөдөр ирсэн' },
                    { v: '₮1.2 сая', l: 'Орлого (7 хоног)' },
                  ].map(s => (
                    <div key={s.l} style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '0.55rem 0.6rem', textAlign: 'center',
                    }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent)' }}>{s.v}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 1 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {[
                  { code: 'YT8853194305', status: 'ARRIVED', label: 'Ирсэн', price: '₮3,000' },
                  { code: 'JT5467125484', status: 'EREEN_ARRIVED', label: 'Эрээнд ирсэн', price: '—' },
                  { code: '77741393668', status: 'PICKED_UP', label: 'Авсан', price: '₮4,500' },
                ].map((r, i) => (
                  <div key={r.code} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '0.45rem 0.6rem', fontSize: '0.72rem',
                    borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{r.code}</span>
                    <span className={`badge badge-${r.status}`} style={{ fontSize: '0.6rem' }}>{r.label}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 48, textAlign: 'right' }}>{r.price}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Утасны frame — хэрэглэгчийн харагдац */}
            <div className="lp-mock-phone" style={{
              width: 190, background: 'var(--text)',
              borderRadius: 26, padding: 7,
              boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
            }}>
              <div style={{
                background: 'var(--bg)', borderRadius: 20, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  padding: '0.55rem 0.7rem', background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.62rem', fontWeight: 800, color: 'var(--text)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 5, background: 'var(--accent)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.5rem', fontWeight: 800,
                  }}>Ai</span>
                  Миний захиалгууд
                </div>
                <div style={{ padding: '0.55rem' }}>
                  <div style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--yellow)',
                    borderRadius: 8, padding: '0.5rem 0.6rem', marginBottom: '0.45rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>Гутал</span>
                      <span className="badge badge-ARRIVED" style={{ fontSize: '0.52rem' }}>Ирсэн</span>
                    </div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--muted)', fontFamily: 'monospace' }}>YT885319430...</div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>₮3,000</div>
                  </div>
                  <div style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--blue)',
                    borderRadius: 8, padding: '0.5rem 0.6rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>Цамц</span>
                      <span className="badge badge-EREEN_ARRIVED" style={{ fontSize: '0.52rem' }}>Эрээнд</span>
                    </div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--muted)', fontFamily: 'monospace' }}>JT546712548...</div>
                  </div>
                </div>
              </div>
            </div>
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
                Эрээний түншлэгч агуулахууд
              </h2>
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                Хамтран ажилладаг найдвартай агуулахууд — дарж дэлгэрэнгүй үзнэ үү
              </p>
              <div style={{ position: 'relative' }}>
                {warehouses.length > 2 && (
                  <>
                    <button onClick={() => scrollWh(-1)} aria-label="Өмнөх" style={whArrowStyle('left')}>‹</button>
                    <button onClick={() => scrollWh(1)} aria-label="Дараах" style={whArrowStyle('right')}>›</button>
                  </>
                )}
                <div ref={whScroll} style={{
                  display: 'flex', gap: '0.7rem', overflowX: 'auto',
                  scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
                  padding: '2px', WebkitOverflowScrolling: 'touch',
                }}>
                  {warehouses.map(w => (
                    <button key={w.id} onClick={() => setWhDetail(w)} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', textAlign: 'left',
                      cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                      transition: 'border-color 0.12s, transform 0.12s',
                      flex: '0 0 auto', width: 168, scrollSnapAlign: 'start',
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
            <style>{`
              .lp-feat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.9rem; }
              .lp-feat-card { padding: 1.1rem 1.2rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); }
              .lp-feat-icon { font-size: 1.4rem; margin-bottom: 0.4rem; }
              .lp-feat-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 0.25rem; }
              .lp-feat-desc { font-size: 0.79rem; color: var(--muted); line-height: 1.55; }
              @media (max-width: 600px) {
                .lp-feat-grid { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
                .lp-feat-card { padding: 0.7rem 0.75rem; }
                .lp-feat-icon { font-size: 1.05rem; margin-bottom: 0.2rem; }
                .lp-feat-title { font-size: 0.76rem; margin-bottom: 0.15rem; }
                .lp-feat-desc { font-size: 0.67rem; line-height: 1.45; }
              }
            `}</style>
            <div className="lp-feat-grid">
              {FEATURES.map(f => (
                <div key={f.title} className="lp-feat-card">
                  <div className="lp-feat-icon">{f.icon}</div>
                  <div className="lp-feat-title">{f.title}</div>
                  <div className="lp-feat-desc">{f.desc}</div>
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

        {/* ── FAQ ── */}
        <section style={{ padding: '2.5rem 5%', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', marginBottom: '1.5rem' }}>
              Түгээмэл асуултууд
            </h2>
            <style>{`
              .lp-faq { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 0.6rem; overflow: hidden; }
              .lp-faq summary { padding: 0.85rem 1rem; font-size: 0.88rem; font-weight: 600; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; color: var(--text); }
              .lp-faq summary::-webkit-details-marker { display: none; }
              .lp-faq summary::after { content: '+'; font-size: 1.1rem; color: var(--muted); flex-shrink: 0; transition: transform 0.15s; }
              .lp-faq[open] summary::after { transform: rotate(45deg); color: var(--accent); }
              .lp-faq-body { padding: 0 1rem 0.9rem; font-size: 0.83rem; color: var(--muted); line-height: 1.65; }
            `}</style>
            {[
              {
                q: 'Өгөгдөл минь хаана хадгалагдах вэ, аюулгүй юу?',
                a: 'Бүх өгөгдөл олон улсын үүлэн серверт шифрлэгдэн хадгалагдаж, тогтмол нөөцлөгддөг. Танай каргогийн өгөгдөлд зөвхөн та болон таны хэрэглэгчид хандана — карго тус бүрийн өгөгдөл бүрэн тусгаарлагдсан.',
              },
              {
                q: 'Одоо ашиглаж байгаа Excel өгөгдлөө оруулж болох уу?',
                a: 'Болно. Олон зуун трак кодыг Excel файлаас нэг дор оруулах боломжтой тул одоогийн бүртгэлээ хэдхэн минутад шилжүүлнэ.',
              },
              {
                q: 'Төлбөрөө хэрхэн төлөх вэ?',
                a: 'Эхний 30 хоног бүрэн үнэгүй — картын мэдээлэл шаардлагагүй. Үргэлжлүүлэн ашиглах бол сарын ₮50,000-ыг дансаар шилжүүлнэ.',
              },
              {
                q: 'Болиулбал өгөгдлөө буцааж авч чадах уу?',
                a: 'Тийм. Таны ачаа, хэрэглэгчийн бүртгэл таны өмч — хүссэн үедээ Excel хэлбэрээр татаж авах боломжийг бид олгоно.',
              },
              {
                q: 'Хэрэглэгчид минь хэрхэн ашиглах вэ?',
                a: 'Та өөрийн вэб хаягаа (tanaikargo.aicargo.mn) хэрэглэгчиддээ өгнө. Тэд бүртгүүлээд трак кодоо оруулж ачаагаа хянана, утсандаа апп шиг суулгаж болно. Заавар сургалт шаардлагагүй энгийн.',
              },
            ].map(f => (
              <details key={f.q} className="lp-faq">
                <summary>{f.q}</summary>
                <div className="lp-faq-body">{f.a}</div>
              </details>
            ))}
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

      {/* Агуулахын дэлгэрэнгүй — full screen */}
      {whDetail && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg)',
          zIndex: 1000, overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ position: 'relative' }}>
            {whDetail.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={whDetail.imageUrl} alt={whDetail.name}
                style={{ width: '100%', height: '38vh', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{
                width: '100%', height: '22vh', background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem',
              }}>🏭</div>
            )}
            <button onClick={() => setWhDetail(null)} aria-label="Хаах" style={{
              position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: 14,
              background: 'rgba(0,0,0,0.55)', border: 'none',
              borderRadius: '50%', width: 36, height: 36, cursor: 'pointer',
              fontSize: '1rem', lineHeight: 1, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
          <div style={{ padding: '1.25rem 5% 2rem', maxWidth: 640, margin: '0 auto', width: '100%', flex: 1 }}>
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '1.25rem', fontWeight: 800 }}>{whDetail.name}</h3>
            <div>
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1rem', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontWeight: 600 }}>&quot;Бизнес интеллижэнс&quot; ХХК хөгжүүлж байна</div>
          <div>Бүх эрх хуулиар хамгаалагдсан болно · 85205258 · 2026</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
          <Link href="/terms" style={{ color: 'var(--muted)' }}>Үйлчилгээний нөхцөл</Link>
          <Link href="/privacy" style={{ color: 'var(--muted)' }}>Нууцлалын бодлого</Link>
          {FB_URL && (
            <a href={FB_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
              Facebook
            </a>
          )}
        </div>
      </footer>
    </div>
  )
}

function whArrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: -6,
    zIndex: 2, width: 32, height: 32, borderRadius: '50%',
    background: 'var(--surface)', border: '1px solid var(--border)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1,
    color: 'var(--text)', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
