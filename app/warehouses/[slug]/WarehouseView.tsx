'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, Copy, Images, MapPin, Phone, MessageCircle, ChevronLeft, ChevronRight, X, FileSignature } from 'lucide-react'
import { WAREHOUSE_IMAGE_CATEGORIES, categoryLabel, cloudinaryThumb, formatMnt } from '@/lib/warehouse'

export interface PublicImage {
  id: number
  url: string
  caption: string | null
  category: string
}

export interface PublicWarehouse {
  id: number
  name: string
  description: string | null
  phone: string | null
  wechat: string | null
  address: string | null
  imageUrl: string | null
  legalNameMn: string | null
  legalNameCn: string | null
  services: string | null
  pricePerTonCny: string | null
  pricePerM3Cny: string | null
  pricePerKgMnt: string | null
  contractFee: string
  acceptingContracts: boolean
  images: PublicImage[]
}

const CONTRACT_POINTS = [
  'Нэг удаагийн төлбөр — жил бүр төлөхгүй',
  'Байнгын гэрээ, хугацаагүй',
  'Агуулахад танай каргод тусгай зай талбай',
  'Ачаа хүлээн авах, ангилах, баглаж савлах',
  'Монгол, хятад хэлээр цахим гэрээ',
]

// Нүүр зургийг эхэнд нь; хуучин (галерейд ороогүй) нүүр зураг байвал нэмнэ
function buildPhotos(wh: PublicWarehouse): PublicImage[] {
  const list = [...wh.images]
  if (!wh.imageUrl) return list
  const idx = list.findIndex(i => i.url === wh.imageUrl)
  if (idx === -1) return [{ id: -1, url: wh.imageUrl, caption: null, category: 'GENERAL' }, ...list]
  const [cover] = list.splice(idx, 1)
  return [cover, ...list]
}

export default function WarehouseView({ wh }: { wh: PublicWarehouse }) {
  const photos = useMemo(() => buildPhotos(wh), [wh])
  const [filter, setFilter] = useState('ALL')
  // Lightbox нь тухайн үед нээсэн жагсаалтаараа (мозайк = бүх зураг, галерей = шүүсэн) гүйнэ
  const [lightbox, setLightbox] = useState<{ list: PublicImage[]; index: number } | null>(null)

  const tabs = WAREHOUSE_IMAGE_CATEGORIES.filter(c => photos.some(p => p.category === c.value))
  const shown = filter === 'ALL' ? photos : photos.filter(p => p.category === filter)
  const services = (wh.services ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const hasTariff = wh.pricePerTonCny != null || wh.pricePerM3Cny != null || wh.pricePerKgMnt != null

  return (
    <>
      <style>{CSS}</style>
      <div className="whv">
        <Link href="/warehouses" className="whv-back"><ChevronLeft size={15} /> Бүх агуулах</Link>

        <header className="whv-head">
          <h1>{wh.name}</h1>
          {(wh.legalNameMn || wh.legalNameCn) && (
            <p className="whv-legal">{[wh.legalNameMn, wh.legalNameCn].filter(Boolean).join(' · ')}</p>
          )}
          <div className="whv-facts">
            {wh.address && <span><MapPin size={14} /> Эрээн хот</span>}
            {photos.length > 0 && <span><Images size={14} /> {photos.length} зураг</span>}
            <span className={wh.acceptingContracts ? 'whv-ok' : ''}>
              <FileSignature size={14} /> {wh.acceptingContracts ? 'Гэрээ хүлээн авч байна' : 'Шинэ гэрээ түр хаалттай'}
            </span>
          </div>
        </header>

        <PhotoHero photos={photos} name={wh.name} onOpen={index => setLightbox({ list: photos, index })} />

        <div className="whv-layout">
          <main>
            {wh.description && (
              <section className="whv-sec">
                <h2>Танилцуулга</h2>
                <p className="whv-desc">{wh.description}</p>
              </section>
            )}

            {services.length > 0 && (
              <section className="whv-sec">
                <h2>Үйлчилгээ</h2>
                <ul className="whv-services">
                  {services.map(s => (
                    <li key={s}><span className="whv-check"><Check size={13} strokeWidth={3} /></span>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="whv-sec">
              <h2>Агуулахын зургууд</h2>
              {photos.length === 0 ? (
                <div className="whv-empty">Зураг удахгүй нэмэгдэнэ</div>
              ) : (
                <>
                  {tabs.length > 1 && (
                    <div className="whv-tabs">
                      <button className={filter === 'ALL' ? 'on' : ''} onClick={() => setFilter('ALL')}>
                        Бүгд <em>{photos.length}</em>
                      </button>
                      {tabs.map(t => (
                        <button key={t.value} className={filter === t.value ? 'on' : ''} onClick={() => setFilter(t.value)}>
                          {t.label} <em>{photos.filter(p => p.category === t.value).length}</em>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="whv-grid">
                    {shown.map((img, i) => (
                      <button key={img.id} className="whv-thumb" onClick={() => setLightbox({ list: shown, index: i })}
                        aria-label={img.caption ?? `${wh.name} — зураг ${i + 1}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cloudinaryThumb(img.url, 480)} alt={img.caption ?? wh.name} loading="lazy" />
                        {img.caption && <span className="whv-cap">{img.caption}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          </main>

          <aside className="whv-side">
            <div className="whv-card whv-contract">
              <div className="whv-label">Хамтран ажиллах гэрээ</div>
              <div className="whv-price">{formatMnt(wh.contractFee)}</div>
              <div className="whv-sub">нэг удаа төлнө</div>
              <ul className="whv-points">
                {CONTRACT_POINTS.map(p => (
                  <li key={p}><Check size={14} strokeWidth={2.6} />{p}</li>
                ))}
              </ul>
              {wh.acceptingContracts ? (
                <Link className="whv-cta" href={`/admin/warehouse?new=${wh.id}`}>Цахим гэрээ байгуулах</Link>
              ) : (
                <button className="whv-cta" disabled>Шинэ гэрээ түр хаалттай</button>
              )}
              <p className="whv-note">Карго компанийн админ эрхээр нэвтэрч байгуулна.</p>
              <p className="whv-note">Төлбөр гэрээ цуцлагдсан ч буцаагдахгүй.</p>
            </div>

            {hasTariff && (
              <div className="whv-card">
                <div className="whv-card-title">Тээврийн тариф</div>
                <div className="whv-tariff">
                  {wh.pricePerTonCny != null && (
                    <div><span>1 тонн</span><b>¥{Number(wh.pricePerTonCny).toLocaleString('en-US')}</b></div>
                  )}
                  {wh.pricePerM3Cny != null && (
                    <div><span>1 м³</span><b>¥{Number(wh.pricePerM3Cny).toLocaleString('en-US')}</b></div>
                  )}
                  {wh.pricePerKgMnt != null && (
                    <div><span>1 кг</span><b>{formatMnt(wh.pricePerKgMnt)}</b></div>
                  )}
                </div>
                <p className="whv-note">Тухайн өдрийн ханшаар төгрөгт хөрвүүлнэ.</p>
              </div>
            )}

            {(wh.address || wh.phone || wh.wechat) && (
              <div className="whv-card">
                <div className="whv-card-title">Холбоо барих</div>
                {wh.address && (
                  <ContactRow icon={<MapPin size={16} />} label="Хаяг" value={wh.address} copy />
                )}
                {wh.phone && (
                  <ContactRow icon={<Phone size={16} />} label="Утас" value={wh.phone}
                    href={`tel:${wh.phone.replace(/\s/g, '')}`} copy />
                )}
                {wh.wechat && (
                  <ContactRow icon={<MessageCircle size={16} />} label="WeChat" value={wh.wechat} copy />
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      {lightbox && (
        <Lightbox
          list={lightbox.list}
          index={lightbox.index}
          name={wh.name}
          onIndex={index => setLightbox(l => l && { ...l, index })}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}

// Зургийг тайрахгүй (contain), хоосон зайг тухайн зургийн бүдгэрүүлсэн хувилбараар дүүргэнэ
function FitImage({ url, alt, eager }: { url: string; alt: string; eager?: boolean }) {
  return (
    <>
      <span className="whv-fit-bg" style={{ backgroundImage: `url("${cloudinaryThumb(url, 120)}")` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="whv-fit" src={url} alt={alt} loading={eager ? 'eager' : 'lazy'} />
    </>
  )
}

function PhotoHero({ photos, name, onOpen }: { photos: PublicImage[]; name: string; onOpen: (i: number) => void }) {
  const [slide, setSlide] = useState(0)
  const track = useRef<HTMLDivElement>(null)

  if (photos.length === 0) {
    return <div className="whv-hero-empty">🏭</div>
  }

  const tiles = photos.slice(0, 5)
  const rest = photos.length - tiles.length

  return (
    <>
      {/* Desktop — мозайк */}
      <div className={`whv-mosaic n${tiles.length}`}>
        {tiles.map((p, i) => (
          <button key={p.id} className={`whv-tile${i === 0 ? ' big' : ''}`} onClick={() => onOpen(i)}
            aria-label={`${name} — зураг ${i + 1}`}>
            {i === 0
              ? <FitImage url={p.url} alt={p.caption ?? name} eager />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={cloudinaryThumb(p.url, 520)} alt={p.caption ?? name} loading="lazy" />}
            {i === tiles.length - 1 && rest > 0 && <span className="whv-more">+{rest} зураг</span>}
          </button>
        ))}
        {photos.length > 1 && (
          <button className="whv-all" onClick={() => onOpen(0)}><Images size={15} /> Бүх зургийг үзэх</button>
        )}
      </div>

      {/* Mobile — шударч гүйлгэх */}
      <div className="whv-carousel">
        <div ref={track} className="whv-track"
          onScroll={e => {
            const el = e.currentTarget
            setSlide(Math.round(el.scrollLeft / el.clientWidth))
          }}>
          {photos.map((p, i) => (
            <button key={p.id} className="whv-slide" onClick={() => onOpen(i)} aria-label={`${name} — зураг ${i + 1}`}>
              <FitImage url={i < 2 ? p.url : cloudinaryThumb(p.url, 900)} alt={p.caption ?? name} eager={i === 0} />
            </button>
          ))}
        </div>
        {photos.length > 1 && <span className="whv-count">{slide + 1} / {photos.length}</span>}
      </div>
    </>
  )
}

function ContactRow({ icon, label, value, href, copy }: {
  icon: React.ReactNode; label: string; value: string; href?: string; copy?: boolean
}) {
  return (
    <div className="whv-contact">
      <span className="whv-contact-ic">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="whv-contact-label">{label}</div>
        {href ? <a href={href} className="whv-contact-val link">{value}</a> : <div className="whv-contact-val">{value}</div>}
      </div>
      {copy && (
        <button className="whv-copy" aria-label={`${label} хуулах`} onClick={() => {
          navigator.clipboard.writeText(value).then(() => toast.success('Хуулагдлаа'), () => toast.error('Хуулж чадсангүй'))
        }}>
          <Copy size={14} />
        </button>
      )}
    </div>
  )
}

function Lightbox({ list, index, name, onIndex, onClose }: {
  list: PublicImage[]; index: number; name: string
  onIndex: (i: number) => void; onClose: () => void
}) {
  const touchX = useRef<number | null>(null)
  const current = list[index]
  const go = (dir: -1 | 1) => onIndex((index + dir + list.length) % list.length)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndex((index + 1) % list.length)
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + list.length) % list.length)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [index, list.length, onClose, onIndex])

  if (!current) return null

  return (
    <div className="whv-lb" role="dialog" aria-modal="true" onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (dx < -40) go(1)
        else if (dx > 40) go(-1)
      }}>
      <div className="whv-lb-top" onClick={e => e.stopPropagation()}>
        <span>{index + 1} / {list.length}</span>
        <button onClick={onClose} aria-label="Хаах"><X size={20} /></button>
      </div>
      <div className="whv-lb-stage">
        {list.length > 1 && (
          <button className="whv-lb-nav left" onClick={e => { e.stopPropagation(); go(-1) }} aria-label="Өмнөх">
            <ChevronLeft size={26} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.caption ?? name} onClick={e => e.stopPropagation()} />
        {list.length > 1 && (
          <button className="whv-lb-nav right" onClick={e => { e.stopPropagation(); go(1) }} aria-label="Дараах">
            <ChevronRight size={26} />
          </button>
        )}
      </div>
      <div className="whv-lb-cap" onClick={e => e.stopPropagation()}>
        {current.caption && <div className="t">{current.caption}</div>}
        <div className="c">{categoryLabel(current.category)}</div>
      </div>
      {list.length > 1 && (
        <div className="whv-lb-strip" onClick={e => e.stopPropagation()}>
          {list.map((p, i) => (
            <button key={p.id} className={i === index ? 'on' : ''} onClick={() => onIndex(i)} aria-label={`Зураг ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cloudinaryThumb(p.url, 120)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const CSS = `
.whv { max-width: 1120px; margin: 0 auto; padding: 1.25rem 5% 3.5rem; }
.whv-back { display: inline-flex; align-items: center; gap: 2px; font-size: 0.8rem; color: var(--muted); }
.whv-back:hover { color: var(--text); }
.whv-head { margin: 0.6rem 0 1.1rem; }
.whv-head h1 { font-size: clamp(1.45rem, 3.2vw, 2rem); font-weight: 800; letter-spacing: -0.5px; margin: 0; line-height: 1.2; }
.whv-legal { color: var(--muted); font-size: 0.82rem; margin: 0.3rem 0 0; }
.whv-facts { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.75rem; }
.whv-facts span { display: inline-flex; align-items: center; gap: 5px; font-size: 0.76rem; font-weight: 600;
  padding: 0.28rem 0.65rem; border-radius: 100px; background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
.whv-facts span.whv-ok { color: var(--green); border-color: color-mix(in srgb, var(--green) 35%, var(--border)); }

.whv-fit-bg { position: absolute; inset: -20px; background-size: cover; background-position: center; filter: blur(22px) brightness(0.85); transform: scale(1.1); }
.whv-fit { position: relative; width: 100%; height: 100%; object-fit: contain; display: block; }

.whv-hero-empty { height: 180px; border-radius: 16px; background: var(--surface2); display: flex; align-items: center; justify-content: center; font-size: 3rem; }

.whv-mosaic { position: relative; display: grid; gap: 8px; height: min(460px, 52vw); border-radius: 16px; overflow: hidden; }
.whv-mosaic.n1 { grid-template-columns: 1fr; }
.whv-mosaic.n2 { grid-template-columns: 2fr 1fr; }
.whv-mosaic.n3 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
.whv-mosaic.n4 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
.whv-mosaic.n5 { grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr; }
.whv-mosaic .big { grid-row: 1 / -1; }
.whv-tile { position: relative; overflow: hidden; padding: 0; border: none; background: var(--surface2); cursor: zoom-in; min-height: 0; }
.whv-tile > img:not(.whv-fit) { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.35s, filter 0.2s; }
.whv-tile:hover > img:not(.whv-fit) { transform: scale(1.05); }
.whv-tile:hover { filter: brightness(0.94); }
.whv-more { position: absolute; inset: 0; background: rgba(0,0,0,0.45); color: #fff; font-weight: 700; font-size: 1.05rem;
  display: flex; align-items: center; justify-content: center; }
.whv-all { position: absolute; right: 14px; bottom: 14px; display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px;
  padding: 0.45rem 0.8rem; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.12); }
.whv-all:hover { background: var(--surface2); }

.whv-carousel { display: none; position: relative; margin: 0 -5.56%; }
.whv-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.whv-track::-webkit-scrollbar { display: none; }
.whv-slide { position: relative; flex: 0 0 100%; aspect-ratio: 4 / 3; overflow: hidden; scroll-snap-align: start;
  padding: 0; border: none; background: var(--surface2); }
.whv-count { position: absolute; right: 12px; bottom: 12px; background: rgba(0,0,0,0.6); color: #fff;
  font-size: 0.72rem; font-weight: 600; border-radius: 100px; padding: 0.2rem 0.6rem; pointer-events: none; }

.whv-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 2.5rem; margin-top: 2rem; align-items: start; }
.whv-sec { padding-bottom: 1.75rem; margin-bottom: 1.75rem; border-bottom: 1px solid var(--border); }
.whv-sec:last-child { border-bottom: none; margin-bottom: 0; }
.whv-sec h2 { font-size: 1.1rem; font-weight: 800; margin: 0 0 0.9rem; letter-spacing: -0.2px; }
.whv-desc { font-size: 0.92rem; line-height: 1.75; margin: 0; white-space: pre-wrap; }
.whv-services { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.55rem 1.2rem; }
.whv-services li { display: flex; align-items: flex-start; gap: 0.55rem; font-size: 0.88rem; line-height: 1.45; }
.whv-check { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: var(--accent-light); color: var(--accent);
  display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }

.whv-tabs { display: flex; gap: 0.4rem; overflow-x: auto; scrollbar-width: none; margin-bottom: 0.9rem; padding-bottom: 2px; }
.whv-tabs button { flex-shrink: 0; border: 1px solid var(--border); background: var(--surface); color: var(--text);
  border-radius: 100px; padding: 0.35rem 0.85rem; font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.whv-tabs button em { font-style: normal; color: var(--muted); font-weight: 500; margin-left: 2px; }
.whv-tabs button.on { background: var(--text); border-color: var(--text); color: var(--bg); }
.whv-tabs button.on em { color: inherit; opacity: 0.7; }
.whv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.55rem; }
.whv-thumb { position: relative; padding: 0; border: none; background: var(--surface2); border-radius: 10px; overflow: hidden; cursor: zoom-in; }
.whv-thumb img { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; display: block; transition: transform 0.3s; }
.whv-thumb:hover img { transform: scale(1.05); }
.whv-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 1.1rem 0.55rem 0.4rem; font-size: 0.72rem; color: #fff; text-align: left;
  background: linear-gradient(transparent, rgba(0,0,0,0.7)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.whv-empty { padding: 2.25rem 1rem; text-align: center; color: var(--muted); background: var(--surface);
  border: 1px dashed var(--border); border-radius: 12px; font-size: 0.85rem; }

.whv-side { position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.whv-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.15rem 1.2rem; }
.whv-contract { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); box-shadow: 0 8px 28px rgba(0,0,0,0.07); }
.whv-label { font-size: 0.74rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
.whv-price { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.8px; margin-top: 0.25rem; line-height: 1.1; }
.whv-sub { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
.whv-points { list-style: none; padding: 0; margin: 1rem 0; display: flex; flex-direction: column; gap: 0.5rem; }
.whv-points li { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.82rem; line-height: 1.4; }
.whv-points svg { flex-shrink: 0; color: var(--green); margin-top: 1px; }
.whv-cta { display: block; text-align: center; box-sizing: border-box; text-decoration: none; width: 100%; border: none; border-radius: 10px; padding: 0.75rem; font: inherit; font-size: 0.86rem; font-weight: 700;
  background: var(--accent); color: #fff; cursor: pointer; }
.whv-cta:disabled { background: var(--surface2); color: var(--muted); cursor: default; }
.whv-note { font-size: 0.72rem; color: var(--muted); margin: 0.6rem 0 0; text-align: center; }
.whv-card-title { font-size: 0.88rem; font-weight: 700; margin-bottom: 0.6rem; }
.whv-tariff { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.whv-tariff div { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.6rem 0.7rem; }
.whv-tariff span { display: block; font-size: 0.72rem; color: var(--muted); }
.whv-tariff b { font-size: 1.05rem; }
.whv-card .whv-note { text-align: left; }
.whv-contact { display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.6rem 0; border-top: 1px solid var(--border); }
.whv-card-title + .whv-contact { border-top: none; padding-top: 0.1rem; }
.whv-contact-ic { flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; background: var(--surface2); color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center; }
.whv-contact-label { font-size: 0.7rem; color: var(--muted); }
.whv-contact-val { font-size: 0.84rem; line-height: 1.45; overflow-wrap: anywhere; }
.whv-contact-val.link { color: var(--accent); font-weight: 600; }
.whv-copy { flex-shrink: 0; background: none; border: 1px solid var(--border); border-radius: 7px; color: var(--muted);
  width: 30px; height: 30px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.whv-copy:hover { color: var(--text); background: var(--surface2); }

.whv-lb { position: fixed; inset: 0; z-index: 1000; background: rgba(10,10,10,0.95); display: flex; flex-direction: column; touch-action: pan-y; }
.whv-lb-top { display: flex; justify-content: space-between; align-items: center; color: #fff; font-size: 0.82rem;
  padding: calc(0.7rem + env(safe-area-inset-top)) 1rem 0.7rem; }
.whv-lb-top button { background: rgba(255,255,255,0.12); border: none; color: #fff; width: 38px; height: 38px; border-radius: 50%;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.whv-lb-stage { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0 3.5rem; }
.whv-lb-stage img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; user-select: none; }
.whv-lb-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.12); border: none; color: #fff;
  width: 46px; height: 46px; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.whv-lb-nav:hover { background: rgba(255,255,255,0.22); }
.whv-lb-nav.left { left: 0.75rem; } .whv-lb-nav.right { right: 0.75rem; }
.whv-lb-cap { color: #fff; text-align: center; padding: 0.6rem 1rem 0.2rem; font-size: 0.82rem; }
.whv-lb-cap .t { font-weight: 600; } .whv-lb-cap .c { opacity: 0.6; font-size: 0.74rem; margin-top: 2px; }
.whv-lb-strip { display: flex; gap: 6px; overflow-x: auto; padding: 0.6rem 1rem calc(0.8rem + env(safe-area-inset-bottom)); justify-content: safe center; scrollbar-width: none; }
.whv-lb-strip button { flex-shrink: 0; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; cursor: pointer; opacity: 0.5; background: none; }
.whv-lb-strip button.on { border-color: #fff; opacity: 1; }
.whv-lb-strip img { width: 64px; height: 44px; object-fit: cover; display: block; }

@media (max-width: 860px) {
  .whv-layout { grid-template-columns: minmax(0, 1fr); gap: 1.75rem; margin-top: 1.5rem; }
  .whv-side { position: static; order: -1; }
}
@media (max-width: 640px) {
  .whv-mosaic { display: none; }
  .whv-carousel { display: block; }
  .whv-head { margin-bottom: 0.9rem; }
  .whv-lb-stage { padding: 0; }
  .whv-lb-nav { display: none; }
  .whv-grid { grid-template-columns: 1fr 1fr; gap: 0.4rem; }
}
`
