'use client'
import { useEffect, useState } from 'react'
import { Bell, BellRing, Download, Share, SquarePlus, X, ExternalLink, MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import { usePush, useInstall, shouldAskPush, askPushLater } from '@/lib/pwa-client'
import type { UserDict } from '@/lib/user-i18n'

// Хэрэглэгчийн push мэдэгдэл ба апп суулгах:
//  - PushPrompt: "Миний ачаа" дээр нэг удаа гарах асуулт (зөвшөөрөл хөтөч заавал асуудаг тул)
//  - AppSettingsRows: ⚙ Тохиргоо цэсэн дэх "Мэдэгдэл" toggle + "Апп суулгах" товч

type T = Pick<UserDict,
  'pushTitle' | 'pushAskTitle' | 'pushAskBody' | 'pushTurnOn' | 'pushLater' | 'pushOnToast' | 'pushOffToast' | 'pushDenied'
  | 'pushNeedsInstall' | 'installApp' | 'installTitle' | 'installIos1' | 'installIos2' | 'installIos3' | 'installInapp' | 'installManual' | 'installDone'
  | 'pushTest' | 'pushTestSent' | 'pushTestFail'>

export function PushPrompt({ t }: { t: T }) {
  const { state, enable } = usePush()
  const { mode } = useInstall()
  const [show, setShow] = useState(false)
  const [sheet, setSheet] = useState(false)
  useEffect(() => { setShow(shouldAskPush()) }, [])

  if (!show) return null
  // iPhone-ий Safari табд push ажиллахгүй — эхлээд апп болгож суулгахыг санал болгоно
  const needsInstall = state === 'needs-install' && mode !== 'installed'
  if (state !== 'off' && !needsInstall) return null

  const later = () => { askPushLater(); setShow(false) }
  return (
    <>
      <div className="pp" role="region" aria-label={t.pushTitle}>
        <span className="pp-ic"><BellRing size={18} strokeWidth={2.2} /></span>
        <div className="pp-txt">
          <b>{t.pushAskTitle}</b>
          <span>{needsInstall ? t.pushNeedsInstall : t.pushAskBody}</span>
        </div>
        <div className="pp-act">
          <button type="button" className="btn btn-sm" onClick={async () => {
            if (needsInstall) { setSheet(true); return }
            if (await enable()) { toast.success(t.pushOnToast); setShow(false) }
          }}>{needsInstall ? t.installApp : t.pushTurnOn}</button>
          <button type="button" className="pp-later" onClick={later}>{t.pushLater}</button>
        </div>
      </div>
      {sheet && <InstallSheet t={t} mode={mode} onClose={() => setSheet(false)} />}
    </>
  )
}

export function AppSettingsRows({ t }: { t: T }) {
  const { state, enable, disable } = usePush()
  const { mode, install } = useInstall()
  const [sheet, setSheet] = useState(false)
  const on = state === 'on'
  const canToggle = state === 'on' || state === 'off'

  return (
    <>
      <div className="aps-row">
        <span className="aps-lbl"><Bell size={14} />{t.pushTitle}</span>
        {canToggle || state === 'loading' ? (
          <button type="button" role="switch" aria-checked={on} aria-label={t.pushTitle} disabled={state === 'loading'}
            className={`switch${on ? ' on' : ''}`}
            onClick={async () => {
              if (on) { await disable(); toast.success(t.pushOffToast) }
              else if (await enable()) toast.success(t.pushOnToast)
              else if (Notification.permission === 'denied') toast.error(t.pushDenied)
            }}><span /></button>
        ) : null}
      </div>
      {on && (
        <button type="button" className="aps-test" onClick={async () => {
          const res = await fetch('/api/push/test', { method: 'POST' }).catch(() => null)
          const d = await res?.json().catch(() => ({}))
          if (res?.ok) toast.success(t.pushTestSent); else toast.error(d?.error || t.pushTestFail)
        }}><BellRing size={13} />{t.pushTest}</button>
      )}
      {state === 'denied' && <p className="aps-note">{t.pushDenied}</p>}
      {state === 'needs-install' && mode !== 'installed' && <p className="aps-note">{t.pushNeedsInstall}</p>}
      {mode !== 'installed' && (
        <button type="button" className="aps-install" onClick={async () => {
          if (mode === 'prompt') { if (await install()) toast.success(t.installDone) }
          else setSheet(true)
        }}><Download size={15} />{t.installApp}</button>
      )}
      {sheet && <InstallSheet t={t} mode={mode} onClose={() => setSheet(false)} />}
    </>
  )
}

function InstallSheet({ t, mode, onClose }: { t: T; mode: string; onClose: () => void }) {
  return (
    <div className="ins-bg" onClick={onClose}>
      <div className="ins" role="dialog" aria-modal="true" aria-label={t.installTitle} onClick={e => e.stopPropagation()}>
        <div className="ins-head">
          <b>{t.installTitle}</b>
          <button type="button" className="ins-x" aria-label="Хаах" onClick={onClose}><X size={18} /></button>
        </div>
        {mode === 'inapp' ? (
          <p className="ins-p"><ExternalLink size={16} />{t.installInapp}</p>
        ) : mode === 'ios' ? (
          <ol className="ins-steps">
            <li><span><Share size={18} /></span>{t.installIos1}</li>
            <li><span><SquarePlus size={18} /></span>{t.installIos2}</li>
            <li><span><BellRing size={18} /></span>{t.installIos3}</li>
          </ol>
        ) : (
          <p className="ins-p"><MoreVertical size={16} />{t.installManual}</p>
        )}
      </div>
    </div>
  )
}
