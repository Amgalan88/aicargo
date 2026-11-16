'use client'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import NavLogo from './components/NavLogo'
import { Reveal, Stagger, StaggerItem, CountUpStat } from './components/motion'
import {
  Globe, Package, FileSpreadsheet, Sparkles, Bell, BarChart3, Monitor, Search, Check, Gift,
  Warehouse as WarehouseIcon, ArrowRight, Factory, Wrench, User, X, Smartphone, HandCoins,
  MessageCircleQuestion, Clock, ShieldCheck, CreditCard, Phone, GraduationCap, ArrowUpRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { warehousePath, cloudinaryThumb } from '@/lib/warehouse'
import HeroMockup from './components/HeroMockup'
import RouteMap from './components/RouteMap'
import { AI_SUPPORT_ENABLED } from '@/lib/ai-feature-flag'
import PartnerMarquee from './components/PartnerMarquee'
import ThemeToggle from './components/ThemeToggle'
import { PartnerContactModal } from './components/PartnerContact'
import { LANDING_IMAGES, type LandingPhoto } from '@/lib/landing-media'
import './landing.css'

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Авсан',
}

const FB_URL = 'https://www.facebook.com/share/1BSw6dQ22F/'
const PHONE = '85205258'
const PRICE = '₮50,000'

const HERO_TILES = Array.from({ length: 40 }, (_, i) => (i % 8) * 0.04 + Math.floor(i / 8) * 0.055)

const PAINS: { icon: ReactNode; before: string; after: string }[] = [
  { icon: <FileSpreadsheet size={16} />, before: 'Трак кодыг гараар шивнэ', after: 'Excel-ээс нэг товчоор' },
  { icon: <Phone size={16} />, before: 'Өдөрт хэдэн арван дуудлага', after: 'Хэрэглэгч ачаагаа өөрөө харна' },
  { icon: <BarChart3 size={16} />, before: 'Хэн төлсөн нь бүрхэг', after: 'Төлбөр, орлого нэг дэлгэцэнд' },
  { icon: <Bell size={16} />, before: 'Зарлалаа чат бүрт илгээнэ', after: 'Мэдэгдэл бүгдэд нэг дор' },
]

const FOR_ADMIN = [
  { icon: <FileSpreadsheet size={18} />, title: 'Excel оруулалт', desc: 'Олон зуун код нэг дор' },
  { icon: <HandCoins size={18} />, title: 'Утсаар олголт', desc: 'Нэг товчоор олгоно' },
  { icon: <BarChart3 size={18} />, title: 'Тайлан, орлого', desc: 'Өдөр, сараар' },
  { icon: <Bell size={18} />, title: 'Мэдэгдэл', desc: 'Шинэ ачаа ирэхэд' },
]
const FOR_USER = [
  { icon: <Globe size={18} />, title: 'Таны нэртэй вэб', desc: 'Утсанд апп шиг' },
  { icon: <Package size={18} />, title: 'Ачаа хянах', desc: 'Эрээн → УБ → Авсан' },
  AI_SUPPORT_ENABLED
    ? { icon: <Sparkles size={18} />, title: 'AI туслах', desc: '24/7 хариулна' }
    : { icon: <Bell size={18} />, title: 'Утсанд мэдэгдэл', desc: 'Ачаа ирэхэд шууд' },
  { icon: <Smartphone size={18} />, title: 'Утсаар шалгах', desc: 'Бүртгэлгүйгээр' },
]

const JOURNEY: { title: string; photo: LandingPhoto }[] = [
  { title: 'Хятадаас Эрээнд ирнэ', photo: LANDING_IMAGES.steps.china },
  { title: 'Эрээнд ангилж, баглана', photo: LANDING_IMAGES.steps.pack },
  { title: 'Машинаар Монгол руу', photo: LANDING_IMAGES.steps.truck },
  { title: 'УБ-д буулгаж, системд бүртгэнэ', photo: LANDING_IMAGES.steps.register },
  { title: 'Хэрэглэгч вэбээс хараад авна', photo: LANDING_IMAGES.steps.pickup },
]

const STEPS = [
  { title: 'Бүртгүүл', desc: 'Нэр, вэб хаягаа сонго', time: '2 минут' },
  { title: 'Тохируул', desc: 'Лого, тариф, данс', time: '3 минут' },
  { title: 'Хэрэглэгчээ урь', desc: 'Линкээ хуваалц', time: 'Бэлэн' },
]

const PLAN_FEATURES = [
  'Өөрийн нэртэй вэб, лого',
  'Хязгааргүй ачаа, хэрэглэгч',
  'Excel оруулалт, утсаар олголт',
  'Тайлан, мэдэгдэл, ажилтны эрх',
]

interface PartnerCargo { id: number; name: string; logoUrl: string | null }
interface Warehouse { id: number; slug: string | null; name: string; imageUrl: string | null }

function SectionHead({ eyebrow, title, sub }: { eyebrow?: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <Reveal y={18} className="lp-head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {sub && <p className="lp-head-sub">{sub}</p>}
    </Reveal>
  )
}

function CopyChip({ label, value }: { label: string; value: string }) {
  return (
    <button type="button" className="lp-copychip" onClick={() => { navigator.clipboard.writeText(value); toast.success('Хуулагдлаа') }}>
      <span>{label}</span>{value}
    </button>
  )
}

function Cover({ photo, sizes, priority = false, className }: { photo: LandingPhoto; sizes: string; priority?: boolean; className?: string }) {
  return (
    <Image
      src={photo.src}
      alt={photo.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      style={{ objectPosition: photo.objectPosition ?? 'center' }}
    />
  )
}

function FeatureList({ items }: { items: { icon: ReactNode; title: string; desc: string }[] }) {
  return (
    <ul className="lx-m-list">
      {items.map(it => (
        <li key={it.title}>
          <span className="lx-m-ic">{it.icon}</span>
          <b>{it.title}</b>
          <small>{it.desc}</small>
        </li>
      ))}
    </ul>
  )
}

export default function MarketingLanding({ stats, partnerCargos = [], warehouses = [], superPreview = false, fontClass = '' }: {
  stats: { cargos: number; users: number; shipments: number }
  partnerCargos?: PartnerCargo[]
  warehouses?: Warehouse[]
  superPreview?: boolean
  fontClass?: string
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [navSolid, setNavSolid] = useState(false)
  const heroCta = useRef<HTMLDivElement>(null)
  const featuredWh = warehouses.find(w => w.imageUrl) ?? warehouses[0]
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    const el = heroCta.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!demoOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDemoOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [demoOpen])

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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'AiCargo', url: 'https://www.aicargo.mn', logo: 'https://www.aicargo.mn/icon-512.png', sameAs: [FB_URL] },
      {
        '@type': 'SoftwareApplication',
        name: 'AiCargo',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: 'https://www.aicargo.mn',
        description: `Карго компанид зориулсан ачаа бүртгэл, хяналтын систем — Эрээн агуулахаас олголт хүртэл, ${AI_SUPPORT_ENABLED ? 'AI туслахтай' : 'утасны мэдэгдэлтэй'}.`,
        inLanguage: 'mn',
        offers: { '@type': 'Offer', price: '50000', priceCurrency: 'MNT', description: 'Эхний 30 хоног үнэгүй · цаашид сарын ₮50,000' },
      },
    ],
  }

  const statItems = [
    { v: stats.cargos, label: 'карго компани' },
    { v: stats.users, label: 'хэрэглэгч' },
    { v: stats.shipments, label: 'бүртгэгдсэн ачаа' },
  ].filter(s => s.v >= 10)

  const statsRow = statItems.length > 0 && (
    <div className="lp-stats">
      {statItems.map(s => (
        <div key={s.label}>
          <b><CountUpStat value={s.v} suffix="+" /></b>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )

  const faqs = [
    { q: 'Үнэхээр 30 хоног үнэгүй юу?', a: `Тийм, бүх боломж нээлттэй, карт шаардахгүй. Дараа нь сарын ${PRICE}-ыг QPay, SocialPay, картаар онлайнаар төлнө — 12 сараар төлбөл 3 сар бэлэг.` },
    { q: 'Одоогийн Excel-ээ оруулж болох уу?', a: 'Болно. Олон зуун трак кодыг файлаас нэг дор оруулна.' },
    { q: 'Хэрэглэгчид яаж ашиглах вэ?', a: 'Таны вэб хаягаар (tanaikargo.aicargo.mn) бүртгүүлээд ачаагаа хянана. Апп татах, заавар шаардлагагүй.' },
    { q: 'Өгөгдөл минь аюулгүй юу?', a: 'Карго бүрийн өгөгдөл тусгаарлагдсан, тогтмол нөөцлөгддөг. Хүссэн үедээ Excel-ээр татаж авна.' },
    ...(warehouses.length ? [
      { q: 'Эрээний хаяг гэж юу вэ?', a: 'Агуулах танд өөрийн тэмдэгтэй (жш: B88) хятад хаяг өгнө. Хэрэглэгчид тань Taobao, Pinduoduo-д энэ хаягийг бичихэд агуулах хүлээн авч, баглаад Гаалийн хашаа хүртэл хүргэнэ. Хувь хүн ч байгуулж болно.' },
      { q: 'Гэрээний төлбөр буцаагдах уу?', a: 'Үгүй. Нэг удаагийн төлбөр, гэрээ хугацаагүй. Цуцлахдаа 30 хоногийн өмнө мэдэгдэнэ.' },
    ] : []),
  ]

  return (
    <div className={`lx${fontClass ? ` ${fontClass}` : ''}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="lx-hero">
        <div className="lx-hero-media" aria-hidden>
          <Cover photo={LANDING_IMAGES.hero} sizes="100vw" priority className="lx-hero-photo" />
          <div className="lx-hero-shade" />
        </div>
        <div className="lx-tiles" aria-hidden>
          {HERO_TILES.map((delay, i) => (
            <span key={i} className="lx-tile" style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>

        <nav className={`nav${navSolid ? ' lx-nav-solid' : ''}`}>
          <NavLogo />
          <div className="nav-links">
            {superPreview ? (
              <Link href="/super" className="btn btn-sm">← Super admin</Link>
            ) : (
              <>
                <a href="#features" className="lp-nav-hide-sm">Боломжууд</a>
                <a href="#pricing" className="lp-nav-hide-sm">Үнэ</a>
                <a href="#track" className="lp-nav-hide-sm">Ачаа шалгах</a>
                <ThemeToggle storageKey="landing-theme" />
                <Link href="/login" className="link-tap">Нэвтрэх</Link>
                <Link href="/signup-cargo" className="btn btn-sm" style={{ whiteSpace: 'nowrap' }}>Карго нээх</Link>
              </>
            )}
          </div>
        </nav>

        <div className="lx-hero-grid">
          <div className="lx-hero-copy">
            {AI_SUPPORT_ENABLED && (
              <span className="lx-kicker"><Sparkles size={13} strokeWidth={2.5} />Монголын анхны AI-суурьтай карго платформ</span>
            )}
            <h1 className="lx-h1">
              Карго бизнесээ<br />
              <span>5 минутад онлайн</span> болго
            </h1>
            <p className="lx-lead">
              Өөрийн нэртэй вэбсайт, ачаа бүртгэл, олголт — бүгд нэг дор.
              Эрээнд ачаа хүлээн авах агуулах ч эндээс.
            </p>
            <div className="lx-offers" ref={heroCta}>
              <Link href="/signup-cargo" className="lx-offer lx-offer-main">
                <span className="lx-offer-ic"><Globe size={20} /></span>
                <span className="lx-offer-txt"><b>Каргогоо үнэгүй нээх</b><small>Вэбсайт + систем · 30 хоног үнэгүй</small></span>
                <ArrowRight size={18} className="lx-offer-go" />
              </Link>
              <button type="button" onClick={() => setContactOpen(true)} className="lx-offer">
                <span className="lx-offer-ic"><WarehouseIcon size={20} /></span>
                <span className="lx-offer-txt"><b>Эрээнд агуулахтай болох</b><small>Хувь хүн ч болно · шууд холбогдоно</small></span>
                <ArrowRight size={18} className="lx-offer-go" />
              </button>
              <a href="/surgalt" target="_blank" rel="noopener noreferrer" className="lx-offer">
                <span className="lx-offer-ic"><GraduationCap size={20} /></span>
                <span className="lx-offer-txt"><b>Карго бизнес сурах</b><small>48 хичээл · ₮120,000 · <span style={{ whiteSpace: 'nowrap' }}>4 нь үнэгүй</span></small></span>
                <ArrowUpRight size={18} className="lx-offer-go" />
              </a>
            </div>
            <ul className="lx-assure">
              <li><Check size={14} strokeWidth={3} />Карт шаардлагагүй</li>
              <li><Check size={14} strokeWidth={3} />Суулгах шаардлагагүй</li>
              <li><button type="button" onClick={() => setDemoOpen(true)} className="lp-demo-link link-tap"><Monitor size={14} />Демо үзэх</button></li>
            </ul>
          </div>
          <div className="lx-hero-map">
            <RouteMap />
          </div>
        </div>
      </header>

      <section className="lx-statement" aria-label="Уриа">
        <h2>Эрээнээс олголт хүртэл — нэг системд</h2>
      </section>

      <main>
        {partnerCargos.length > 0
          ? <PartnerMarquee cargos={partnerCargos} total={stats.cargos}>{statsRow}</PartnerMarquee>
          : statsRow && <section className="lp-sec lp-sec-line">{statsRow}</section>}

        <section className="lx-journey" aria-label="Ачааны аялал">
          <div className="lx-steps">
            {JOURNEY.map((step, i) => (
              <article key={step.title} className="lx-step">
                <Cover photo={step.photo} sizes="(max-width: 980px) 78vw, 20vw" className="lx-step-img" />
                <div className="lx-step-shade" aria-hidden />
                <span className="lx-step-n">{i + 1}</span>
                <h3 className="lx-step-title">{step.title}</h3>
                <Link href="/signup-cargo" className="lx-step-cta" aria-label={`${step.title} — Каргогоо үнэгүй нээх`}>
                  Каргогоо үнэгүй нээх
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="lx-product" aria-label="Админ болон Миний ачаа">
          <HeroMockup showJourney={false} />
        </section>

        <section id="features" className="lp-sec lx-features">
          <div className="lp-wrap">
            <SectionHead eyebrow="Боломжууд" title="Карго болон хэрэглэгч — хоёуланд нь" />
            <div className="lx-masonry">
              <article className="lx-m lx-m-tall">
                <Cover photo={LANDING_IMAGES.masonry.admin} sizes="(max-width: 800px) 100vw, 55vw" className="lx-m-img" />
                <div className="lx-m-shade" aria-hidden />
                <div className="lx-m-body">
                  <h3>Каргогийн админд</h3>
                  <p className="lx-m-note">Компьютер, утас хоёуланд</p>
                  <FeatureList items={FOR_ADMIN} />
                </div>
              </article>
              <article className="lx-m">
                <Cover photo={LANDING_IMAGES.masonry.user} sizes="(max-width: 800px) 100vw, 42vw" className="lx-m-img" />
                <div className="lx-m-shade" aria-hidden />
                <div className="lx-m-body">
                  <h3>Таны хэрэглэгчдэд</h3>
                  <p className="lx-m-note">Апп татах шаардлагагүй</p>
                  <FeatureList items={FOR_USER} />
                </div>
              </article>
              <article className="lx-m">
                <Cover photo={LANDING_IMAGES.masonry.wide} sizes="(max-width: 800px) 100vw, 42vw" className="lx-m-img" />
                <div className="lx-m-shade" aria-hidden />
                <div className="lx-m-body">
                  <p className="lx-m-quote">Өөрийн нэртэй вэбсайт, ачаа бүртгэл, олголт — бүгд нэг дор.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec-alt">
          <div className="lp-wrap">
            <SectionHead
              eyebrow="Яагаад AiCargo"
              title={<>Дуудлага, Excel, чатын<br className="lp-br" /> орооцолдоонд цэг тавь</>}
            />
            <div className="lp-vs">
              <Reveal y={16} className="lp-vs-col lp-vs-old">
                <h3>Өмнө</h3>
                <ul>{PAINS.map(p => <li key={p.before}><span className="lp-vs-ic"><X size={13} strokeWidth={3} /></span>{p.before}</li>)}</ul>
              </Reveal>
              <Reveal y={16} delay={0.1} className="lp-vs-col lp-vs-new">
                <h3>AiCargo-той</h3>
                <ul>{PAINS.map(p => <li key={p.after}><span className="lp-vs-ic">{p.icon}</span>{p.after}</li>)}</ul>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <SectionHead eyebrow="Эхлэхэд" title="3 алхам, 5 минут" />
            <Stagger className="lp-steps" gap={0.12}>
              {STEPS.map((s, i) => (
                <StaggerItem key={s.title} className="lp-step">
                  <span className="lp-step-n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <span className="lp-step-time"><Clock size={12} />{s.time}</span>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        <section id="pricing" className="lp-sec lp-sec-alt">
          <div className="lp-wrap">
            <SectionHead eyebrow="Үнэ" title="Энгийн, ил тод үнэ" sub="Нуусан төлбөргүй · хүссэн үедээ зогсооно" />
            <div className={`lp-plans${featuredWh ? '' : ' lp-plans-one'}`}>
              <Reveal y={20} className="lp-plan lp-plan-main">
                <span className="lp-plan-tag">Үндсэн</span>
                <h3>Каргогийн систем</h3>
                <div className="lp-plan-price"><b>{PRICE}</b><span>/ сар</span></div>
                <div className="lp-plan-free"><Gift size={14} />Эхний 30 хоног үнэгүй</div>
                <ul>{PLAN_FEATURES.map(f => <li key={f}><Check size={15} strokeWidth={3} />{f}</li>)}</ul>
                <Link href="/signup-cargo" className="btn btn-lg">Каргогоо үнэгүй нээх <ArrowRight size={17} /></Link>
              </Reveal>

              {featuredWh && (
                <Reveal y={20} delay={0.08} className="lp-plan">
                  <span className="lp-plan-tag lp-plan-tag-alt">Нэмэлт</span>
                  <h3>Эрээнд ачаа хүлээн авах хаяг</h3>
                  <div className="lp-plan-price"><b>Түнш агуулах</b></div>
                  <ul>
                    <li><Check size={15} strokeWidth={3} />Өөрийн тэмдэгтэй хаяг (жш: B88)</li>
                    <li><Check size={15} strokeWidth={3} />Хүлээн авч, баглаад Гааль хүртэл</li>
                    <li><Check size={15} strokeWidth={3} />Хувь хүн ч болно</li>
                  </ul>
                  <button type="button" onClick={() => setContactOpen(true)} className="btn-ghost btn-lg">Холбогдох <ArrowRight size={17} /></button>
                </Reveal>
              )}
            </div>
            <p className="lp-plans-note"><ShieldCheck size={14} />Өгөгдөл тань таны өмч — хүссэн үедээ Excel-ээр татаж авна</p>
          </div>
        </section>

        {featuredWh && (
          <section id="warehouse" className="lp-wh">
            <div className="lp-wh-inner lp-wh-grid">
              <Reveal y={20}>
                <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><WarehouseIcon size={15} strokeWidth={2.2} /> Нэмэлт үйлчилгээ · Эрээн</div>
                <h2 className="lp-wh-title">Эрээн дэх түнш агуулахууд</h2>
                <p className="lp-wh-lead">Ачаа хүлээн авч, баглаад Гааль хүртэл хүргэнэ. Хувь хүн ч болно, карго нээх шаардлагагүй.</p>
                <button type="button" onClick={() => setContactOpen(true)} className="btn lp-wh-cta">Холбогдох <ArrowRight size={16} /></button>
              </Reveal>
              <div className="lp-wh-cards">
                {warehouses.map(w => (
                  <Link key={w.id} href={warehousePath(w)} className="lp-wh-card">
                    <span className="lp-wh-card-img">
                      {w.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={cloudinaryThumb(w.imageUrl, 400)} alt={w.name} loading="lazy" />
                        : <Factory size={28} strokeWidth={1.6} />}
                    </span>
                    <span className="lp-wh-card-body">
                      <span className="lp-wh-card-name">{w.name}</span>
                      <span className="lp-wh-card-fee">Зураг, үйлчилгээтэй танилцах</span>
                    </span>
                    <ArrowRight size={17} className="lp-wh-card-go" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="lp-sec">
          <div className="lp-wrap lp-faq-wrap">
            <SectionHead eyebrow="Асуулт хариулт" title="Түгээмэл асуултууд" />
            <div>
              {faqs.map(f => (
                <details key={f.q} className="lp-faq">
                  <summary>{f.q}</summary>
                  <div className="lp-faq-body">{f.a}</div>
                </details>
              ))}
              <p className="lp-faq-more">
                <MessageCircleQuestion size={15} />Өөр асуулт байна уу? <a href={`tel:${PHONE}`} className="link-tap" style={{ padding: '0 4px' }}>{PHONE}</a> дугаарт залгаарай
              </p>
            </div>
          </div>
        </section>

        <section className="lp-final-wrap">
          <Reveal y={20} className="lp-final">
            <h2>Каргогоо өнөөдөр онлайн болго</h2>
            <p>30 хоног үнэгүй · Карт шаардлагагүй · 5 минутад бэлэн</p>
            <div className="lp-cta-row">
              <Link href="/signup-cargo" className="btn btn-lg lp-final-btn">Каргогоо үнэгүй нээх <ArrowRight size={18} /></Link>
              <button type="button" onClick={() => setDemoOpen(true)} className="btn-ghost btn-lg lp-final-ghost"><Monitor size={17} />Демо үзэх</button>
            </div>
          </Reveal>
        </section>

        <section id="track" className="lp-track">
          <div className="lp-track-inner">
            <div className="lp-track-text">
              <h2><Search size={20} strokeWidth={2.4} />Хэрэглэгч үү? Ачаагаа шалгаарай</h2>
              <p>
                Аль ч каргогийн ачааг трак кодоор шалгана ·{' '}
                <Link href="/register" className="link-tap">Хэрэглэгчээр бүртгүүлэх</Link>
              </p>
            </div>
            <div className="lp-track-form">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="input"
                  placeholder="Трак код, жш: JT5364974054841"
                  aria-label="Трак код"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && search()}
                  style={{ minWidth: 0 }}
                />
                <button type="button" className="btn" onClick={search} disabled={loading} style={{ flexShrink: 0 }}>
                  {loading ? '...' : 'Шалгах'}
                </button>
              </div>
              {error && <p className="msg-error">{error}</p>}
              {result && (
                <div className="card" style={{ marginTop: '0.75rem' }}>
                  {result.cargo?.name && (
                    <div className="card-row"><span className="label">Карго</span><strong style={{ color: 'var(--accent)' }}>{result.cargo.name}</strong></div>
                  )}
                  <div className="card-row"><span className="label">Трак код</span><strong style={{ fontFamily: 'monospace', fontSize: 'var(--fs-sm)' }}>{result.trackCode}</strong></div>
                  <div className="card-row"><span className="label">Статус</span><span className={`badge badge-${result.status}`}>{STATUS_LABEL[result.status] ?? result.status}</span></div>
                  {result.adminPrice && (
                    <div className="card-row"><span className="label">Төлбөр</span><strong style={{ color: 'var(--accent)' }}>₮{Number(result.adminPrice).toLocaleString()}</strong></div>
                  )}
                  {result.updatedAt && (
                    <div className="card-row">
                      <span className="label">Огноо</span>
                      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
                        {new Date(result.updatedAt).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      {contactOpen && <PartnerContactModal onClose={() => setContactOpen(false)} />}

      <footer className="lx-footer">
        <div className="lx-footer-grid">
          <div className="lx-footer-brand">
            <NavLogo />
            <p>Карго компанид зориулсан ачаа бүртгэл, хяналтын систем — Эрээнээс олголт хүртэл.</p>
          </div>
          <div>
            <h4>Бүтээгдэхүүн</h4>
            <a href="#features">Боломжууд</a>
            <a href="#pricing">Үнэ</a>
            {featuredWh && <Link href="/warehouses">Эрээний агуулахууд</Link>}
            <a href="/surgalt" target="_blank" rel="noopener noreferrer">Карго сургалт</a>
            <button type="button" onClick={() => setDemoOpen(true)}>Демо</button>
          </div>
          <div>
            <h4>Хэрэглэгчдэд</h4>
            <a href="#track">Ачаа шалгах</a>
            <Link href="/login">Нэвтрэх</Link>
            <Link href="/register">Бүртгүүлэх</Link>
          </div>
          <div>
            <h4>Холбоо барих</h4>
            <a href={`tel:${PHONE}`}><Phone size={13} />{PHONE}</a>
            {FB_URL && (
              <a href={FB_URL} target="_blank" rel="noopener noreferrer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
                Facebook
              </a>
            )}
          </div>
        </div>
        <div className="lx-footer-bottom">
          <span>© 2026 &quot;Бизнес интеллижэнс&quot; ХХК · Бүх эрх хуулиар хамгаалагдсан</span>
          <span>
            <Link href="/terms">Үйлчилгээний нөхцөл</Link>
            <Link href="/privacy">Нууцлалын бодлого</Link>
          </span>
        </div>
      </footer>

      {!superPreview && (
        <div className={`lp-sticky${showSticky ? ' on' : ''}`} aria-hidden={!showSticky}>
          <Link href="/signup-cargo" className="btn" tabIndex={showSticky ? 0 : -1}>Каргогоо үнэгүй нээх <ArrowRight size={16} /></Link>
          <button type="button" className="btn-ghost" onClick={() => setDemoOpen(true)} tabIndex={showSticky ? 0 : -1} aria-label="Демо үзэх"><Monitor size={17} /></button>
        </div>
      )}

      {demoOpen && (
        <div className="lp-modal-bg" onClick={() => setDemoOpen(false)}>
          <div className="lp-modal" role="dialog" aria-modal="true" aria-label="Демо орчин" onClick={e => e.stopPropagation()}>
            <button type="button" className="icon-btn lp-modal-x" onClick={() => setDemoOpen(false)} aria-label="Хаах"><X size={17} /></button>
            <h3><Monitor size={18} strokeWidth={2.2} />Демо орчин</h3>
            <p>
              Бодит систем — админ болон хэрэглэгчийн аль алины нүдээр туршаарай.
              Өгөгдөл өдөр бүр шөнө анхны байдалдаа ордог тул чөлөөтэй өөрчилж болно.
            </p>
            {[
              { icon: <Wrench size={14} strokeWidth={2.2} />, title: 'Каргогийн админаар', phone: '99999901' },
              { icon: <User size={14} strokeWidth={2.2} />, title: 'Хэрэглэгчээр', phone: '99999902' },
            ].map(acc => (
              <div key={acc.phone} className="lp-demo-acc">
                <div className="lp-demo-acc-title">{acc.icon}{acc.title}</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <CopyChip label="Утас:" value={acc.phone} />
                  <CopyChip label="Нууц үг:" value="demo123" />
                </div>
              </div>
            ))}
            <a href="https://demo.aicargo.mn/login" target="_blank" rel="noopener noreferrer" className="btn" style={{ width: '100%', marginTop: '0.6rem' }}>
              demo.aicargo.mn нээх <ArrowRight size={16} />
            </a>
            <p className="lp-modal-foot"><CreditCard size={13} />Бүртгүүлэхэд карт шаардлагагүй</p>
          </div>
        </div>
      )}
    </div>
  )
}
