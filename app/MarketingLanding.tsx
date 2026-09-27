'use client'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import NavLogo from './components/NavLogo'
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from './components/motion'
import {
  Globe, Package, FileSpreadsheet, Sparkles, Bell, BarChart3, Monitor, Search, Check, Gift,
  Warehouse as WarehouseIcon, ArrowRight, Factory, Wrench, User, X, Smartphone, HandCoins,
  MessageCircleQuestion, Clock, ShieldCheck, CreditCard, Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import { warehousePath, cloudinaryThumb, formatMnt } from '@/lib/warehouse'
import HeroMockup from './components/HeroMockup'
import PartnerMarquee from './components/PartnerMarquee'

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: 'Бүртгүүлсэн',
  EREEN_ARRIVED: 'Эрээнд ирсэн',
  ARRIVED: 'Ирсэн',
  PICKED_UP: 'Авсан',
}

const FB_URL = 'https://www.facebook.com/share/1BSw6dQ22F/'
const PHONE = '85205258'
const PRICE = '₮50,000'

// Асуудал → шийдэл: карго эзний өдөр тутмын өвдөлт ба AiCargo-гийн хариу
const PAINS: { icon: ReactNode; before: string; after: string }[] = [
  { icon: <FileSpreadsheet size={18} />, before: 'Трак кодыг Excel, дэвтэрт гараар шивнэ', after: 'Олон зуун трак кодыг Excel-ээс нэг товчоор оруулна' },
  { icon: <Sparkles size={18} />, before: '"Ачаа маань ирсэн үү?" гэсэн дуудлага өдөрт хэдэн арваар', after: 'Хэрэглэгч ачаагаа өөрөө хянаж, AI асуултад нь хариулна' },
  { icon: <BarChart3 size={18} />, before: 'Хэн төлсөн, хэн аваагүй нь бүрхэг', after: 'Олголт, төлбөр, орлогын тайлан нэг дэлгэцэнд' },
  { icon: <Bell size={18} />, before: 'Зарлалаа чат болгонд давтан илгээнэ', after: 'Бүх хэрэглэгчдэд мэдэгдэл нэг дор очно' },
]

const FOR_ADMIN = [
  { icon: <FileSpreadsheet size={18} />, title: 'Excel-ээр бөөнөөр', desc: 'Эрээнд ирсэн, УБ-д ирсэн ачааг файлаас нэг дор оруулна.' },
  { icon: <HandCoins size={18} />, title: 'Утсаар хайж олгоно', desc: 'Хэрэглэгчийн утсыг бичээд бүх ачааг нь нэг товчоор олгоно.' },
  { icon: <BarChart3 size={18} />, title: 'Тайлан, орлого', desc: 'Өдөр, сарын олголт, орлого, хэрэглэгч бүрийн түүх.' },
  { icon: <Bell size={18} />, title: 'Мэдэгдэл', desc: 'Шинэ ачаа бүртгэгдэхэд танд, ачаа ирэхэд хэрэглэгчид.' },
]
const FOR_USER = [
  { icon: <Globe size={18} />, title: 'Таны нэртэй вэб', desc: 'tanaikargo.aicargo.mn — таны лого, нэртэй, утсанд апп шиг суулгана.' },
  { icon: <Package size={18} />, title: 'Ачаагаа өөрөө хянана', desc: 'Бүртгүүлсэн → Эрээнд → Ирсэн → Авсан. Төлбөрөө ч харна.' },
  { icon: <Sparkles size={18} />, title: 'AI туслах', desc: '"Ачаа хаана?", "Хэд төлөх?" — 24/7 шууд хариулна.' },
  { icon: <Smartphone size={18} />, title: 'Утсаар шалгах', desc: 'Бүртгэлгүйгээр утасны дугаараараа ирсэн ачаагаа шалгана.' },
]

const STEPS = [
  { title: 'Бүртгүүл', desc: 'Каргоныхоо нэр, вэб хаягаа сонгоод и-мэйлээ баталгаажуул.', time: '2 минут' },
  { title: 'Тохируул', desc: 'Лого, Эрээний хаяг, тариф, банкны мэдээллээ оруул.', time: '3 минут' },
  { title: 'Хэрэглэгчдээ урь', desc: 'Линкээ хуваалц — хэрэглэгчид өөрсдөө бүртгүүлж, ачаагаа хянана.', time: 'Бэлэн' },
]

const PLAN_FEATURES = [
  'Өөрийн нэртэй вэб хаяг, лого',
  'Хязгааргүй ачаа, хэрэглэгч',
  'Excel оруулалт, утсаар олголт',
  'Мэдэгдэл, тайлан, аудит лог',
  'Ажилтны нэмэлт нэвтрэлт',
]

const WAREHOUSE_BENEFITS = [
  'Агуулахад танай каргод зориулсан тусгай зай талбай',
  'Ачааг хүлээн авч, ангилж, баглаж шуудайлна',
  'Гаалийн хашаа хүртэл үнэгүй зөөвөрлөнө',
  'Монгол, хятад хэлээр цахим гэрээ — PDF хувь',
]

interface PartnerCargo { id: number; name: string; logoUrl: string | null }
interface Warehouse {
  id: number; slug: string | null; name: string; imageUrl: string | null
  contractFee: string; acceptsContracts: boolean
}

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
    <button className="lp-copychip" onClick={() => { navigator.clipboard.writeText(value); toast.success('Хуулагдлаа') }}>
      <span>{label}</span>{value}
    </button>
  )
}

export default function MarketingLanding({ stats, partnerCargos = [], warehouses = [], superPreview = false }: {
  stats: { cargos: number; users: number; shipments: number }
  partnerCargos?: PartnerCargo[]
  warehouses?: Warehouse[]
  superPreview?: boolean
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const heroCta = useRef<HTMLDivElement>(null)
  const featuredWh = warehouses.find(w => w.acceptsContracts && w.imageUrl) ?? warehouses.find(w => w.acceptsContracts) ?? warehouses[0]

  // Утсанд: hero-гийн CTA дэлгэцээс гарахад доод талд CTA зурвас гарна
  useEffect(() => {
    const el = heroCta.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
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

  // Google-д зориулсан бүтэцлэгдсэн өгөгдөл: байгууллага + SaaS бүтээгдэхүүн, үнэ
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
        description: 'Карго компанид зориулсан ачаа бүртгэл, хяналтын систем — Эрээн агуулахаас олголт хүртэл, AI туслахтай.',
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
          <b><AnimatedNumber value={s.v} suffix="+" /></b>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )

  const faqs = [
    { q: 'Үнэхээр 30 хоног үнэгүй юу? Карт шаардлагатай юу?', a: `Тийм. Эхний 30 хоног бүх боломж нь бүрэн нээлттэй, картын мэдээлэл шаардахгүй. Үргэлжлүүлэн ашиглах бол сарын ${PRICE}-ыг дансаар шилжүүлнэ.` },
    { q: 'Одоо ашиглаж байгаа Excel өгөгдлөө оруулж болох уу?', a: 'Болно. Олон зуун трак кодыг Excel файлаас нэг дор оруулах тул одоогийн бүртгэлээ хэдхэн минутад шилжүүлнэ.' },
    { q: 'Хэрэглэгчид минь хэрхэн ашиглах вэ?', a: 'Та өөрийн вэб хаягаа (tanaikargo.aicargo.mn) хэрэглэгчиддээ өгнө. Тэд бүртгүүлээд трак кодоо оруулж ачаагаа хянана, утсандаа апп шиг суулгаж болно. Заавар сургалт шаардлагагүй.' },
    { q: 'Өгөгдөл минь хаана хадгалагдах вэ, аюулгүй юу?', a: 'Бүх өгөгдөл үүлэн серверт шифрлэгдэн хадгалагдаж, тогтмол нөөцлөгддөг. Карго тус бүрийн өгөгдөл бүрэн тусгаарлагдсан — танай өгөгдөлд зөвхөн та болон таны хэрэглэгчид хандана.' },
    { q: 'Болиулбал өгөгдлөө буцааж авч чадах уу?', a: 'Тийм. Таны ачаа, хэрэглэгчийн бүртгэл таны өмч — хүссэн үедээ Excel хэлбэрээр татаж авах боломжийг бид олгоно.' },
    ...(warehouses.length ? [
      { q: 'Эрээнд ачаа хүлээн авах хаяг гэж юу вэ?', a: 'Түншлэгч агуулахтай цахим гэрээ байгуулахад танай каргод өөрийн тэмдэгтэй (жш: B88) хятад хаяг олгоно. Хэрэглэгчид тань Taobao, Pinduoduo зэрэгт энэ хаягийг бичиж захиалахад агуулах ачааг хүлээн авч, ангилж, баглаад Гаалийн хашаа хүртэл үнэгүй зөөвөрлөнө. Хаягийг вэбсайтдаа нэг товчоор тохируулна.' },
      { q: 'Агуулахын гэрээний төлбөр буцаагдах уу?', a: 'Үгүй. Гэрээний төлбөр нэг удаагийн бөгөөд жил бүр төлөхгүй, гэрээ хугацаагүй. Гэрээ аль ч талын санаачилгаар цуцлагдсан тохиолдолд төлбөр буцаагдахгүй (цуцлахдаа 30 хоногийн өмнө мэдэгдэнэ).' },
      { q: 'Карго нээгээгүй бол агуулахтай гэрээ байгуулж болох уу?', a: 'Эхлээд aicargo-д каргогоо нээнэ — 2 минут, эхний 30 хоног үнэгүй. Дараа нь админ хэсгийн "Агуулах" цэснээс гэрээгээ байгуулж, төлбөрийн явцаа тэндээс хянана.' },
    ] : []),
  ]

  return (
    <div className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── NAV ── */}
      <nav className="nav">
        <NavLogo />
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', marginLeft: 'auto', flexShrink: 0 }}>
          {superPreview ? (
            <Link href="/super" className="btn btn-sm">← Super admin</Link>
          ) : (
            <>
              <a href="#features" className="lp-nav-hide-sm">Боломжууд</a>
              <a href="#pricing" className="lp-nav-hide-sm">Үнэ</a>
              <a href="#track" className="lp-nav-hide-sm">Ачаа шалгах</a>
              <Link href="/login">Нэвтрэх</Link>
              <Link href="/signup-cargo" className="btn btn-sm" style={{ whiteSpace: 'nowrap' }}>Карго нээх</Link>
            </>
          )}
        </div>
      </nav>

      <main>
        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero-glow" aria-hidden />
          <Reveal y={14}>
            <span className="lp-pill"><Sparkles size={13} strokeWidth={2.5} />Монголын анхны AI-суурьтай карго платформ</span>
          </Reveal>
          <Reveal y={22} delay={0.08}>
            <h1 className="lp-h1">
              Карго бизнесээ<br />
              <span>5 минутад онлайн</span> болго
            </h1>
          </Reveal>
          <Reveal y={22} delay={0.16}>
            <p className="lp-lead">
              Өөрийн нэртэй вэбсайт, ачаа бүртгэл, олголт, төлбөр — бүгд нэг дор.
              Хэрэглэгч тань ачаагаа өөрөө хянаж, та утасны дуудлагаас чөлөөлөгдөнө.
            </p>
          </Reveal>
          <Reveal y={22} delay={0.24}>
            <div className="lp-cta-row" ref={heroCta}>
              <Link href="/signup-cargo" className="btn btn-lg lp-cta-main">Каргогоо үнэгүй нээх <ArrowRight size={18} /></Link>
              <button onClick={() => setDemoOpen(true)} className="btn-ghost btn-lg"><Monitor size={17} />Демо үзэх</button>
            </div>
            <ul className="lp-assure">
              <li><Check size={14} strokeWidth={3} />30 хоног үнэгүй</li>
              <li><Check size={14} strokeWidth={3} />Карт шаардлагагүй</li>
              <li><Check size={14} strokeWidth={3} />Суулгах шаардлагагүй</li>
            </ul>
          </Reveal>
        </section>

        <section className="lp-mock">
          <Reveal y={28} delay={0.2}><HeroMockup /></Reveal>
        </section>

        {/* ── ИТГЭЛ: түншүүд + тоо ── */}
        {partnerCargos.length > 0
          ? <PartnerMarquee cargos={partnerCargos} total={stats.cargos}>{statsRow}</PartnerMarquee>
          : statsRow && <section className="lp-sec lp-sec-line">{statsRow}</section>}

        {/* ── АСУУДАЛ → ШИЙДЭЛ ── */}
        <section className="lp-sec lp-sec-alt">
          <div className="lp-wrap">
            <SectionHead
              eyebrow="Яагаад AiCargo"
              title={<>Дуудлага, Excel, чатын<br className="lp-br" /> орооцолдоонд цэг тавь</>}
              sub="Карго эрхлэгчдийн өдөр бүр тулгардаг асуудлыг нэг системээр шийднэ"
            />
            <Stagger className="lp-pains" gap={0.08}>
              {PAINS.map(p => (
                <StaggerItem key={p.before} className="lp-pain">
                  <div className="lp-pain-before"><span className="lp-pain-x"><X size={13} strokeWidth={3} /></span>{p.before}</div>
                  <div className="lp-pain-arrow" aria-hidden><ArrowRight size={16} /></div>
                  <div className="lp-pain-after"><span className="lp-pain-icon">{p.icon}</span>{p.after}</div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ── БОЛОМЖУУД: хоёр талд ── */}
        <section id="features" className="lp-sec">
          <div className="lp-wrap">
            <SectionHead
              eyebrow="Боломжууд"
              title="Карго болон хэрэглэгч — хоёуланд нь"
              sub="Админ тал ажлаа хурдасгаж, хэрэглэгч тал асуултгүй болно"
            />
            <div className="lp-roles">
              {[
                { key: 'admin', icon: <Wrench size={18} />, title: 'Каргогийн админд', note: 'Компьютер, утас хоёуланд', items: FOR_ADMIN },
                { key: 'user', icon: <User size={18} />, title: 'Таны хэрэглэгчдэд', note: 'Апп татах шаардлагагүй', items: FOR_USER },
              ].map(r => (
                <Reveal key={r.key} y={20} className={`lp-role lp-role-${r.key}`}>
                  <div className="lp-role-head">
                    <span className="lp-role-icon">{r.icon}</span>
                    <div><h3>{r.title}</h3><small>{r.note}</small></div>
                  </div>
                  <ul>
                    {r.items.map(it => (
                      <li key={it.title}>
                        <span className="lp-feat-ic">{it.icon}</span>
                        <div><b>{it.title}</b><p>{it.desc}</p></div>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── ХЭРХЭН ЭХЛЭХ ── */}
        <section className="lp-sec lp-sec-alt">
          <div className="lp-wrap">
            <SectionHead eyebrow="Эхлэхэд" title="3 алхам, 5 минут" sub="Техникийн мэдлэг, суулгалт хэрэггүй" />
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

        {/* ── ҮНЭ ── */}
        <section id="pricing" className="lp-sec">
          <div className="lp-wrap">
            <SectionHead eyebrow="Үнэ" title="Энгийн, ил тод үнэ" sub="Нуусан төлбөргүй. Хүссэн үедээ зогсооно." />
            <div className={`lp-plans${featuredWh ? '' : ' lp-plans-one'}`}>
              <Reveal y={20} className="lp-plan lp-plan-main">
                <span className="lp-plan-tag">Үндсэн</span>
                <h3>Каргогийн систем</h3>
                <p className="lp-plan-desc">Вэбсайт, ачаа бүртгэл, олголт — бүх боломж</p>
                <div className="lp-plan-price"><b>{PRICE}</b><span>/ сар</span></div>
                <div className="lp-plan-free"><Gift size={14} />Эхний 30 хоног үнэгүй</div>
                <ul>{PLAN_FEATURES.map(f => <li key={f}><Check size={15} strokeWidth={3} />{f}</li>)}</ul>
                <Link href="/signup-cargo" className="btn btn-lg">Каргогоо үнэгүй нээх <ArrowRight size={17} /></Link>
              </Reveal>

              {featuredWh && (
                <Reveal y={20} delay={0.08} className="lp-plan">
                  <span className="lp-plan-tag lp-plan-tag-alt">Нэмэлт</span>
                  <h3>Эрээнд ачаа хүлээн авах хаяг</h3>
                  <p className="lp-plan-desc">Түншлэгч агуулахтай цахим гэрээ</p>
                  <div className="lp-plan-price"><b>{formatMnt(featuredWh.contractFee)}</b><span>нэг удаа</span></div>
                  <div className="lp-plan-free"><Gift size={14} />Бэлэг: вэбсайт +60 хоног үнэгүй</div>
                  <ul>
                    <li><Check size={15} strokeWidth={3} />Өөрийн тэмдэгтэй хаяг (жш: B88)</li>
                    <li><Check size={15} strokeWidth={3} />Хүлээн авах, ангилах, баглах</li>
                    <li><Check size={15} strokeWidth={3} />Гаалийн хашаа хүртэл үнэгүй</li>
                    <li><Check size={15} strokeWidth={3} />Хаяг вэбсайтад нэг товчоор</li>
                  </ul>
                  <a href="#warehouse" className="btn-ghost btn-lg">Дэлгэрэнгүй <ArrowRight size={17} /></a>
                </Reveal>
              )}
            </div>
            <p className="lp-plans-note"><ShieldCheck size={14} />Өгөгдөл тань таны өмч — хүссэн үедээ Excel-ээр татаж авна</p>
          </div>
        </section>

        {/* ── ЭРЭЭНИЙ АГУУЛАХ ── */}
        {featuredWh && (() => {
          const featured = featuredWh
          const ctaHref = featured.acceptsContracts ? `${warehousePath(featured)}/contract` : '/warehouses'
          return (
            <section id="warehouse" className="lp-wh">
              <div className="lp-wh-inner">
                <div className="lp-wh-grid">
                  <Reveal y={20}>
                    <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><WarehouseIcon size={15} strokeWidth={2.2} /> Нэмэлт үйлчилгээ · Эрээн</div>
                    <h2 className="lp-wh-title">Эрээнд ачаа хүлээн авах өөрийн хаягтай бол</h2>
                    <p className="lp-wh-lead">
                      Түншлэгч агуулахтай цахим гэрээ байгуулснаар ачаа тань Эрээнд найдвартай гарт очно —
                      агуулах хүлээн авч, баглаад Гаалийн хашаа хүртэл хүргэнэ.
                    </p>
                    <ul className="lp-wh-list">
                      {WAREHOUSE_BENEFITS.map(b => <li key={b}><span><Check size={13} strokeWidth={3} /></span>{b}</li>)}
                    </ul>
                    <div className="lp-wh-actions">
                      <Link href={ctaHref} className="btn">Эрээнд хаяг авах <ArrowRight size={16} /></Link>
                      <Link href="/warehouses" className="btn-ghost">Агуулахуудыг үзэх</Link>
                    </div>
                    <p className="lp-wh-note">Каргогоо нээсэн байх шаардлагатай (эхний 30 хоног үнэгүй).</p>
                  </Reveal>
                  <Link href={warehousePath(featured)} className="lp-wh-photo">
                    {featured.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cloudinaryThumb(featured.imageUrl, 900)} alt={featured.name} loading="lazy" />
                    ) : <span className="lp-wh-photo-empty"><Factory size={40} strokeWidth={1.5} /></span>}
                    <span className="lp-wh-photo-cap">{featured.name} · зураг, үйлчилгээ →</span>
                  </Link>
                </div>

                <ol className="lp-wh-flow">
                  {['Каргогоо нээ', 'Агуулахтай гэрээ байгуул', 'Ачаагаа Эрээнд баглуул'].map((t, i) => (
                    <li key={t}><b>{i + 1}</b>{t}</li>
                  ))}
                </ol>

                {warehouses.length > 1 && (
                  <div className="lp-wh-cards">
                    {warehouses.map(w => (
                      <div key={w.id} className="lp-wh-card">
                        <Link href={warehousePath(w)} className="lp-wh-card-img">
                          {w.imageUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={cloudinaryThumb(w.imageUrl, 400)} alt={w.name} loading="lazy" />
                            : <span><Factory size={28} strokeWidth={1.6} /></span>}
                        </Link>
                        <div className="lp-wh-card-body">
                          <div className="lp-wh-card-name">{w.name}</div>
                          <div className="lp-wh-card-fee">Гэрээ: <b>{formatMnt(w.contractFee)}</b></div>
                          <div className="lp-wh-card-actions">
                            {w.acceptsContracts
                              ? <Link href={`${warehousePath(w)}/contract`} className="lp-wh-card-cta">Хаяг авах</Link>
                              : <span className="lp-wh-card-soon">Удахгүй</span>}
                            <Link href={warehousePath(w)} className="lp-wh-card-more">Дэлгэрэнгүй</Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )
        })()}

        {/* ── FAQ ── */}
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
                <MessageCircleQuestion size={15} />Өөр асуулт байна уу? <a href={`tel:${PHONE}`}>{PHONE}</a> дугаарт залгаарай
              </p>
            </div>
          </div>
        </section>

        {/* ── ЭЦСИЙН CTA ── */}
        <section className="lp-final-wrap">
          <Reveal y={20} className="lp-final">
            <h2>Каргогоо өнөөдөр онлайн болго</h2>
            <p>30 хоног үнэгүй · Карт шаардлагагүй · 5 минутад бэлэн</p>
            <div className="lp-cta-row">
              <Link href="/signup-cargo" className="btn btn-lg lp-final-btn">Каргогоо үнэгүй нээх <ArrowRight size={18} /></Link>
              <button onClick={() => setDemoOpen(true)} className="btn-ghost btn-lg lp-final-ghost"><Monitor size={17} />Демо үзэх</button>
            </div>
          </Reveal>
        </section>

        {/* ── АЧАА ШАЛГАХ (эцсийн хэрэглэгчдэд) ── */}
        <section id="track" className="lp-track">
          <div className="lp-track-inner">
            <div className="lp-track-text">
              <h2><Search size={20} strokeWidth={2.4} />Хэрэглэгч үү? Ачаагаа шалгаарай</h2>
              <p>
                Аль ч каргогийн ачааг трак кодоор шалгана ·{' '}
                <Link href="/register">Хэрэглэгчээр бүртгүүлэх</Link>
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
                <button className="btn" onClick={search} disabled={loading} style={{ flexShrink: 0 }}>
                  {loading ? '...' : 'Шалгах'}
                </button>
              </div>
              {error && <p className="msg-error">{error}</p>}
              {result && (
                <div className="card" style={{ marginTop: '0.75rem' }}>
                  {result.cargo?.name && (
                    <div className="card-row"><span className="label">Карго</span><strong style={{ color: 'var(--accent)' }}>{result.cargo.name}</strong></div>
                  )}
                  <div className="card-row"><span className="label">Трак код</span><strong style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{result.trackCode}</strong></div>
                  <div className="card-row"><span className="label">Статус</span><span className={`badge badge-${result.status}`}>{STATUS_LABEL[result.status] ?? result.status}</span></div>
                  {result.adminPrice && (
                    <div className="card-row"><span className="label">Төлбөр</span><strong style={{ color: 'var(--accent)' }}>₮{Number(result.adminPrice).toLocaleString()}</strong></div>
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
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <NavLogo />
            <p>Карго компанид зориулсан ачаа бүртгэл, хяналтын систем — Эрээнээс олголт хүртэл.</p>
          </div>
          <div>
            <h4>Бүтээгдэхүүн</h4>
            <a href="#features">Боломжууд</a>
            <a href="#pricing">Үнэ</a>
            {featuredWh && <Link href="/warehouses">Эрээний агуулахууд</Link>}
            <button onClick={() => setDemoOpen(true)}>Демо</button>
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
        <div className="lp-footer-bottom">
          <span>© 2026 &quot;Бизнес интеллижэнс&quot; ХХК · Бүх эрх хуулиар хамгаалагдсан</span>
          <span>
            <Link href="/terms">Үйлчилгээний нөхцөл</Link>
            <Link href="/privacy">Нууцлалын бодлого</Link>
          </span>
        </div>
      </footer>

      {/* ── Утасны доод CTA ── */}
      {!superPreview && (
        <div className={`lp-sticky${showSticky ? ' on' : ''}`} aria-hidden={!showSticky}>
          <Link href="/signup-cargo" className="btn" tabIndex={showSticky ? 0 : -1}>Каргогоо үнэгүй нээх <ArrowRight size={16} /></Link>
          <button className="btn-ghost" onClick={() => setDemoOpen(true)} tabIndex={showSticky ? 0 : -1} aria-label="Демо үзэх"><Monitor size={17} /></button>
        </div>
      )}

      {/* ── Демо орчны модал ── */}
      {demoOpen && (
        <div className="lp-modal-bg" onClick={() => setDemoOpen(false)}>
          <div className="lp-modal" role="dialog" aria-modal="true" aria-label="Демо орчин" onClick={e => e.stopPropagation()}>
            <button className="icon-btn lp-modal-x" onClick={() => setDemoOpen(false)} aria-label="Хаах"><X size={17} /></button>
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
