'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import NavLogo from './components/NavLogo'
import { Reveal, Stagger, StaggerItem, AnimatedNumber, TiltCard } from './components/motion'
import { Globe, Package, FileSpreadsheet, Sparkles, Bell, BarChart3, Monitor, Search } from 'lucide-react'
import { toast } from 'sonner'

// 3D hero — зөвхөн client дээр, тусдаа chunk (SSR-гүй)
const Hero3D = dynamic(() => import('./components/Hero3D'), { ssr: false })

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Авсан',
}

// Facebook хуудасны URL (хоосон үед footer-т гарахгүй)
const FB_URL = 'https://www.facebook.com/share/1BSw6dQ22F/'

// Бодит дэлгэцийн зургууд — public/shots/ хавтсанд ижил нэрээр байрлана
const SHOTS = [
  { src: '/shots/desk-ereen.png', label: 'Эрээний бүртгэл — Excel болон нэг нэгээр (компьютер)' },
  { src: '/shots/mobile-arrived.png', label: 'Ирсэн ачаа бүртгэх — утас, компьютер хоёуланд' },
  { src: '/shots/mobile-handover.png', label: 'Ачаа олгох — утсаар хайж, нэг товчоор' },
  { src: '/shots/mobile-settings.png', label: 'Тохиргоо — лого, Эрээний хаягаа өөрөө удирдана' },
  { src: '/shots/user-orders.png', label: 'Хэрэглэгч ачаагаа бодит цагт хянана' },
  { src: '/shots/app-icons.jpg', label: 'Утсанд апп шиг суулгагдана' },
]

const FEATURES = [
  { icon: <Globe size={19} strokeWidth={2} />, title: 'Өөрийн вэб хаяг', desc: 'tanaikargo.aicargo.mn — таны нэр, лого, өнгөтэй. Хэрэглэгч тань утсандаа апп шиг суулгана.' },
  { icon: <Package size={19} strokeWidth={2} />, title: 'Ачааны бүрэн хяналт', desc: 'Бүртгүүлсэн → Эрээнд → Ирсэн → Олгосон. Хэрэглэгч бүр өөрийн ачааг бодит цагт хардаг.' },
  { icon: <FileSpreadsheet size={19} strokeWidth={2} />, title: 'Excel bulk оруулалт', desc: 'Олон зуун трак кодыг Excel файлаас нэг дор. Гараар шивэх цаг дууслаа.' },
  { icon: <Sparkles size={19} strokeWidth={2} />, title: 'AI туслах', desc: 'Хэрэглэгчийн "ачаа хаана?", "хэд төлөх?" асуултад AI хариулна — таны утас чимээгүй болно.' },
  { icon: <Bell size={19} strokeWidth={2} />, title: 'Автомат мэдэгдэл', desc: 'Шинэ ачаа бүртгэгдэхэд танд, ачаа ирэхэд хэрэглэгчид мэдэгдэнэ.' },
  { icon: <BarChart3 size={19} strokeWidth={2} />, title: 'Тайлан ба орлого', desc: 'Өдрийн олголт, орлогын дүн, хэрэглэгч бүрийн түүх — нэг дэлгэцээс.' },
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
  function copy() {
    navigator.clipboard.writeText(value)
    toast.success('Хуулагдлаа')
  }
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer',
      fontSize: '0.74rem', color: 'var(--text)',
      fontFamily: 'inherit',
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      {value}
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
  const [shotIdx, setShotIdx] = useState<number | null>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const shotScroll = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)

  function scrollWh(dir: -1 | 1) {
    whScroll.current?.scrollBy({ left: dir * 340, behavior: 'smooth' })
  }

  function scrollShots(dir: -1 | 1) {
    shotScroll.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  function shotNav(dir: -1 | 1) {
    setShotIdx(i => i === null ? i : (i + dir + SHOTS.length) % SHOTS.length)
  }

  // Fullscreen үзэгч нээлттэй үед ар талын хуудасны scroll-ийг түгжинэ
  useEffect(() => {
    if (shotIdx === null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [shotIdx])

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

  // Google-д зориулсан бүтэцлэгдсэн өгөгдөл: байгууллага + SaaS бүтээгдэхүүн, үнэ
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'AiCargo',
        url: 'https://www.aicargo.mn',
        logo: 'https://www.aicargo.mn/icon-512.png',
        sameAs: [FB_URL],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'AiCargo',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: 'https://www.aicargo.mn',
        description: 'Карго компанид зориулсан ачаа бүртгэл, хяналтын систем — Эрээн агуулахаас олголт хүртэл, AI туслахтай.',
        inLanguage: 'mn',
        offers: {
          '@type': 'Offer',
          price: '50000',
          priceCurrency: 'MNT',
          description: 'Эхний 30 хоног үнэгүй · цаашид сарын ₮50,000',
        },
      },
    ],
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
        <section style={{
          position: 'relative', padding: '4rem 5% 3rem', textAlign: 'center', maxWidth: 900, margin: '0 auto',
          minHeight: 'min(78vh, 680px)', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          {/* Акцент өнгөний зөөлөн градиент ар тал */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(201,100,66,0.13), transparent 65%)',
          }} />
          {/* 3D ар тал — контентын доор */}
          <Hero3D />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
          <Reveal y={14}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.72rem', fontWeight: 700,
            color: 'var(--accent)', background: 'var(--accent-light)',
            border: '1px solid var(--accent)', borderRadius: 100,
            padding: '0.3rem 0.9rem', marginBottom: '1.1rem',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            boxShadow: '0 2px 8px rgba(201,100,66,0.12)',
          }}>
            <Sparkles size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            Монголын анхны AI-суурьтай карго платформ
          </div>
          </Reveal>
          <Reveal y={22} delay={0.08}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5.5vw, 3.1rem)', fontWeight: 800, letterSpacing: '-1.2px',
            lineHeight: 1.1, marginBottom: '1rem',
          }}>
            Карго бизнесээ<br />
            <span style={{
              color: 'var(--accent)',
              background: 'linear-gradient(135deg, var(--accent), #e0885f)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>5 минутад онлайн</span> болго
          </h1>
          </Reveal>
          <Reveal y={22} delay={0.16}>
          <p style={{ color: 'var(--muted)', fontSize: '1.02rem', lineHeight: 1.75, maxWidth: 540, margin: '0 auto 1.6rem' }}>
            Өөрийн вэб хаягтай ачаа хяналтын систем — бүртгэлээс олголт хүртэл.
            Хэрэглэгч тань ачаагаа өөрөө хянаж, AI туслах асуултад нь хариулна.
          </p>
          </Reveal>
          <Reveal y={22} delay={0.24}>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
            <Link href="/signup-cargo" className="btn" style={{
              padding: '0.85rem 2rem', fontSize: '0.98rem', textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(201,100,66,0.35)',
            }}>
              Каргогоо үнэгүй нээх →
            </Link>
            <button onClick={() => setDemoOpen(true)} className="btn-ghost" style={{ padding: '0.85rem 1.6rem', fontSize: '0.98rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <Monitor size={16} strokeWidth={2} /> Демо үзэх
            </button>
            <a href="#track" className="btn-ghost" style={{ padding: '0.85rem 1.6rem', fontSize: '0.98rem', textDecoration: 'none' }}>
              Ачаагаа шалгах
            </a>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '2.2rem' }}>
            Эхний 30 хоног үнэгүй · цаашид сарын ₮50,000
          </p>
          </Reveal>

          {/* Бодит тоо — итгэл төрүүлэх hook */}
          <Reveal y={18} delay={0.32}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(1.5rem, 6vw, 3.5rem)', flexWrap: 'wrap' }}>
            {[
              { v: stats.cargos, label: 'Карго компани' },
              { v: stats.users, label: 'Хэрэглэгч' },
              { v: stats.shipments, label: 'Бүртгэгдсэн ачаа' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
                  <AnimatedNumber value={s.v} suffix="+" />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          </Reveal>
          </div>
        </section>

        {/* ── БОДИТ ДЭЛГЭЦҮҮД (screenshot gallery) ── */}
        <section style={{ padding: '0 0 2.5rem' }}>
          <p style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
            Систем дотроос — бодит дэлгэцүүд
          </p>
          <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', padding: '0 5%' }}>
            <button onClick={() => scrollShots(-1)} aria-label="Өмнөх" style={whArrowStyle('left')}>‹</button>
            <button onClick={() => scrollShots(1)} aria-label="Дараах" style={whArrowStyle('right')}>›</button>
            <div ref={shotScroll} style={{
              display: 'flex', gap: '0.8rem', overflowX: 'auto', alignItems: 'flex-end',
              scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
              padding: '4px 2px', WebkitOverflowScrolling: 'touch',
            }}>
              {SHOTS.map((s, i) => (
                <figure key={s.src} style={{ margin: 0, flex: '0 0 auto', scrollSnapAlign: 'start', textAlign: 'center' }}>
                  <button onClick={() => setShotIdx(i)} style={{
                    padding: 0, border: '1px solid var(--border)', borderRadius: 12,
                    overflow: 'hidden', cursor: 'zoom-in', background: 'var(--surface)',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.10)', display: 'block',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.label} loading="lazy" style={{ height: 300, width: 'auto', maxWidth: '80vw', display: 'block', objectFit: 'contain' }} />
                  </button>
                  <figcaption style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.4rem', maxWidth: 220, marginLeft: 'auto', marginRight: 'auto' }}>{s.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ── ТҮНШЛЭГЧ КАРГОНУУД — Logo Wall ── */}
        {partnerCargos.length > 0 && (
          <section style={{ padding: '2rem 5% 2.5rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.4rem' }}>
                Түшлэгч каргонууд
              </h2>
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '1.75rem' }}>
                Таны мэддэг, итгэдэг каргонууд аль хэдийн энд бүртгэлтэй
              </p>
              <style>{`
                .lp-logo-wall {
                  display: grid;
                  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                  gap: 0.9rem;
                }
                .lp-logo-item {
                  display: flex; flex-direction: column; align-items: center; gap: 0.55rem;
                  padding: 1rem 0.75rem; background: var(--surface);
                  border: 1px solid var(--border); border-radius: 14px;
                  text-decoration: none; color: inherit;
                  transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
                }
                .lp-logo-item:hover {
                  border-color: var(--accent);
                  transform: translateY(-3px);
                  box-shadow: 0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(201,100,66,0.08);
                }
                .lp-logo-img {
                  width: 52px; height: 52px; border-radius: 12px;
                  object-fit: cover; flex-shrink: 0;
                  border: 1px solid var(--border);
                }
                .lp-logo-fallback {
                  width: 52px; height: 52px; border-radius: 12px;
                  background: var(--surface2); border: 1px solid var(--border);
                  display: flex; align-items: center; justify-content: center;
                  font-size: 1.3rem; font-weight: 800; color: var(--accent);
                }
                .lp-logo-name {
                  font-size: 0.78rem; font-weight: 600; text-align: center;
                  color: var(--text); line-height: 1.3;
                  overflow: hidden; text-overflow: ellipsis;
                  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                }
                @media (max-width: 500px) {
                  .lp-logo-wall { grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
                  .lp-logo-item { padding: 0.75rem 0.5rem; }
                  .lp-logo-img, .lp-logo-fallback { width: 44px; height: 44px; }
                  .lp-logo-name { font-size: 0.7rem; }
                }
              `}</style>
              <div className="lp-logo-wall">
                {partnerCargos.map(c => (
                  <div key={c.id} className="lp-logo-item">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt={c.name} className="lp-logo-img" loading="lazy" />
                    ) : (
                      <div className="lp-logo-fallback">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="lp-logo-name">{c.name}</span>
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
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.45rem', letterSpacing: '-0.4px' }}>
              Каргод чинь хэрэгтэй бүхэн
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              Excel, дэвтэр, мессежийн орооцолдооноос гарцгаая
            </p>
            <style>{`
              .lp-feat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
              .lp-feat-card {
                padding: 1.3rem 1.3rem; background: var(--bg);
                border: 1px solid var(--border); border-radius: 14px;
                transition: border-color 0.18s, box-shadow 0.18s;
              }
              .lp-feat-card:hover {
                border-color: rgba(201,100,66,0.4);
                box-shadow: 0 8px 24px rgba(0,0,0,0.07), 0 2px 8px rgba(201,100,66,0.08);
              }
              .lp-feat-icon {
                width: 40px; height: 40px; border-radius: 10px;
                background: var(--accent-light); border: 1px solid rgba(201,100,66,0.25);
                display: flex; align-items: center; justify-content: center;
                color: var(--accent); margin-bottom: 0.6rem;
              }
              .lp-feat-title { font-weight: 700; font-size: 0.95rem; margin-bottom: 0.3rem; }
              .lp-feat-desc { font-size: 0.83rem; color: var(--muted); line-height: 1.6; }
              @media (max-width: 600px) {
                .lp-feat-grid { grid-template-columns: 1fr 1fr; gap: 0.6rem; }
                .lp-feat-card { padding: 0.85rem 0.85rem; }
                .lp-feat-icon { width: 34px; height: 34px; font-size: 1rem; margin-bottom: 0.35rem; }
                .lp-feat-title { font-size: 0.8rem; margin-bottom: 0.18rem; }
                .lp-feat-desc { font-size: 0.7rem; line-height: 1.5; }
              }
            `}</style>
            <Stagger className="lp-feat-grid" gap={0.08}>
              {FEATURES.map(f => (
                <StaggerItem key={f.title}>
                  <TiltCard max={5} className="lp-feat-card" style={{ height: '100%' }}>
                    <div className="lp-feat-icon">{f.icon}</div>
                    <div className="lp-feat-title">{f.title}</div>
                    <div className="lp-feat-desc">{f.desc}</div>
                  </TiltCard>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section style={{ padding: '2.5rem 5%', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, textAlign: 'center', marginBottom: '2rem', letterSpacing: '-0.4px' }}>
            Хэрхэн эхлэх вэ?
          </h2>
          <Stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }} gap={0.12}>
            {STEPS.map(s => (
              <StaggerItem key={s.n} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '1rem', margin: '0 auto 0.6rem',
                }}>{s.n}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{s.title}</div>
                <div style={{ fontSize: '0.79rem', color: 'var(--muted)', lineHeight: 1.55 }}>{s.desc}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ── TRACK SEARCH (хэрэглэгчдэд) ── */}
        <section id="track" style={{ padding: '2.5rem 5%', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.45rem', letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Search size={22} strokeWidth={2.2} style={{ color: 'var(--accent)' }} /> Ачаагаа шалгах
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
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, textAlign: 'center', marginBottom: '1.6rem', letterSpacing: '-0.4px' }}>
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
        <section style={{
          padding: '3.5rem 5%', textAlign: 'center', borderTop: '1px solid var(--border)',
          background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(201,100,66,0.07), transparent 70%)',
        }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.6rem', letterSpacing: '-0.5px' }}>
            Өнөөдөр эхэлье
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '1.4rem' }}>
            Эхний 30 хоног бүрэн үнэгүй · цаашид сарын ₮50,000 · 2 минутад бэлэн
          </p>
          <Link href="/signup-cargo" className="btn" style={{
            padding: '0.9rem 2.2rem', fontSize: '1rem', textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(201,100,66,0.35)',
          }}>
            Каргогоо үнэгүй нээх →
          </Link>
        </section>
      </div>

      {/* Агуулахын дэлгэрэнгүй — full screen */}
      {/* ── Демо орчны модал ── */}
      {demoOpen && (
        <div
          onClick={() => setDemoOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', borderRadius: 16, maxWidth: 400, width: '100%',
            padding: '1.5rem', border: '1px solid var(--border)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.28)', position: 'relative',
          }}>
            <button onClick={() => setDemoOpen(false)} aria-label="Хаах" style={{
              position: 'absolute', top: '0.75rem', right: '0.75rem',
              background: 'var(--surface2)', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', borderRadius: '50%', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
            }}>✕</button>

            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.4rem' }}>🖥 Демо орчин</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Бодит систем — админ болон хэрэглэгчийн аль алины нүдээр туршаарай.
              Өгөгдөл өдөр бүр шөнө анхны байдалдаа ордог тул чөлөөтэй өөрчилж болно.
            </p>

            {[
              { icon: '🛠', title: 'Каргогийн админаар', phone: '99999901' },
              { icon: '👤', title: 'Хэрэглэгчээр', phone: '99999902' },
            ].map(acc => (
              <div key={acc.phone} style={{
                background: 'var(--surface2)', borderRadius: 10, padding: '0.7rem 0.85rem',
                marginBottom: '0.6rem', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                  {acc.icon} {acc.title}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <CopyChip label="Утас:" value={acc.phone} />
                  <CopyChip label="Нууц үг:" value="demo123" />
                </div>
              </div>
            ))}

            <a href="https://demo.aicargo.mn/login" target="_blank" rel="noopener noreferrer"
              className="btn" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', padding: '0.7rem', textDecoration: 'none', fontSize: '0.9rem' }}>
              demo.aicargo.mn нээх →
            </a>
          </div>
        </div>
      )}

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

      {/* Дэлгэцийн зураг — fullscreen үзэгч (swipe + сум навигацитай) */}
      {shotIdx !== null && (
        <div
          onClick={() => setShotIdx(null)}
          onTouchStart={e => { touchX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (touchX.current === null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            touchX.current = null
            if (dx < -40) shotNav(1)
            else if (dx > 40) shotNav(-1)
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', cursor: 'zoom-out', touchAction: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOTS[shotIdx].src} alt={SHOTS[shotIdx].label}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10 }} />
          <p style={{ color: '#fff', fontSize: '0.85rem', marginTop: '0.75rem', textAlign: 'center' }}>
            {SHOTS[shotIdx].label}
            <span style={{ opacity: 0.55, marginLeft: 8, fontSize: '0.75rem' }}>{shotIdx + 1}/{SHOTS.length}</span>
          </p>
          <button onClick={e => { e.stopPropagation(); shotNav(-1) }} aria-label="Өмнөх" style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '50%', width: 40, height: 40, cursor: 'pointer',
            fontSize: '1.3rem', lineHeight: 1, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <button onClick={e => { e.stopPropagation(); shotNav(1) }} aria-label="Дараах" style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '50%', width: 40, height: 40, cursor: 'pointer',
            fontSize: '1.3rem', lineHeight: 1, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
          <button onClick={() => setShotIdx(null)} aria-label="Хаах" style={{
            position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: 14,
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '50%', width: 36, height: 36, cursor: 'pointer',
            fontSize: '1rem', lineHeight: 1, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
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
