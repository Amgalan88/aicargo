'use client'
import { useEffect, useState } from 'react'
import { PlayCircle, X, ChevronLeft } from 'lucide-react'
import { withVideo, type Tutorial } from '@/lib/tutorials'

// Заавар видео: жагсаалт → дарахад тоглуулагч. YouTube-ийн cookie-гүй хувилбараар (youtube-nocookie)

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

export function TutorialList({ list, onPick }: { list: Tutorial[]; onPick: (t: Tutorial) => void }) {
  return (
    <div className="tu-list">
      {withVideo(list).map(t => (
        <button key={t.id} type="button" className="tu-item" onClick={() => onPick(t)}>
          <span className="tu-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(t.youtube!)} alt="" loading="lazy" />
            <PlayCircle size={26} strokeWidth={1.8} />
          </span>
          <span className="tu-txt"><b>{t.title}</b><small>{t.desc}</small></span>
        </button>
      ))}
    </div>
  )
}

export function TutorialPlayer({ t, onClose, onBack }: { t: Tutorial; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="tu-player">
      <div className="tu-head">
        {onBack && <button type="button" className="tu-x" aria-label="Буцах" onClick={onBack}><ChevronLeft size={18} /></button>}
        <b>{t.title}</b>
        <button type="button" className="tu-x" aria-label="Хаах" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="tu-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${t.youtube}?autoplay=1&rel=0&playsinline=1`}
          title={t.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <p className="tu-desc">{t.desc}</p>
    </div>
  )
}

// Хэрэглэгчийн ⚙ цэснээс нээгдэх цонх (жагсаалт → тоглуулагч)
export function TutorialSheet({ list, title, onClose }: { list: Tutorial[]; title: string; onClose: () => void }) {
  const [cur, setCur] = useState<Tutorial | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="tu-bg" onClick={onClose}>
      <div className="tu-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        {cur ? (
          <TutorialPlayer t={cur} onClose={onClose} onBack={() => setCur(null)} />
        ) : (
          <>
            <div className="tu-head">
              <b>{title}</b>
              <button type="button" className="tu-x" aria-label="Хаах" onClick={onClose}><X size={18} /></button>
            </div>
            <TutorialList list={list} onPick={setCur} />
          </>
        )}
      </div>
    </div>
  )
}
