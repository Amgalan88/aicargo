'use client'
import { useState } from 'react'
import { ADMIN_TUTORIALS, withVideo, type Tutorial } from '@/lib/tutorials'
import { TutorialList, TutorialPlayer } from '@/app/components/Tutorials'

// Админд зориулсан заавар видео
export default function AdminHelpPage() {
  const [cur, setCur] = useState<Tutorial | null>(null)
  const list = withVideo(ADMIN_TUTORIALS)
  return (
    <div className="page tu-page">
      <h1 className="section-title" style={{ marginBottom: '0.3rem' }}>Заавар видео</h1>
      <p className="tu-sub">Системийг хэрхэн ашиглах богино видеонууд. Шинэ ажилтандаа үзүүлээрэй.</p>
      {list.length ? <TutorialList list={list} onPick={setCur} /> : <div className="empty"><p>Видео удахгүй нэмэгдэнэ.</p></div>}
      {cur && (
        <div className="tu-bg" onClick={() => setCur(null)}>
          <div className="tu-sheet tu-wide" role="dialog" aria-modal="true" aria-label={cur.title} onClick={e => e.stopPropagation()}>
            <TutorialPlayer t={cur} onClose={() => setCur(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
