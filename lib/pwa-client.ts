'use client'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

// Хэрэглэгчийн төхөөрөмж дээрх апп суулгалт ба push мэдэгдэл (зөвхөн хөтөч дээр ажиллана)

// ── Апп суулгах ──
// Android/Chrome "beforeinstallprompt"-ийг хуудас ачаалагдмагц илгээдэг тул PwaRegister эрт барьж энд хадгална
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function captureInstallPrompt() {
  const early = (window as Window & { __bip?: InstallPromptEvent }).__bip
  if (early) { deferred = early; emit() }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPromptEvent; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; emit() })
}

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'inapp' | 'manual'

function detectMode(): InstallMode {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone) return 'installed'
  const ua = navigator.userAgent
  // Messenger, Facebook, Instagram зэрэг аппын дотор хөтөч апп суулгаж чаддаггүй
  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|KAKAOTALK|TikTok/i.test(ua)) return 'inapp'
  if (deferred) return 'prompt'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return 'manual'
}

export function useInstall() {
  const mode = useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    detectMode,
    () => 'installed' as InstallMode, // серверт товч харуулахгүй
  )
  const install = useCallback(async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    emit()
    return outcome === 'accepted'
  }, [])
  return { mode, install }
}

// ── Push мэдэгдэл ──
// Хэрэглэгч өөрөө унтраасныг төхөөрөмж дээр тэмдэглэнэ — тэгээгүй бол зөвшөөрөл байгаа үед автоматаар дахин бүртгэнэ
const OFF_KEY = 'push-off'
const ASK_KEY = 'push-ask-later'

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on' | 'loading'

function vapidKey(): Uint8Array<ArrayBuffer> | null {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!k) return null
  const pad = '='.repeat((4 - (k.length % 4)) % 4)
  const raw = atob((k + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!vapidKey()
}

async function save(sub: PushSubscription) {
  const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
  if (!res.ok) throw new Error('save failed')
}

// Нэг хуудсан дээрх баннер ба тохиргооны toggle НЭГ төлөвийг хуваалцана —
// нэгээс нь асаахад нөгөө нь шууд мэднэ (өмнө нь баннер "Асаах" гэж үлддэг байсан)
let pushState: PushState = 'loading'
let started = false
const pushListeners = new Set<() => void>()
function setPush(s: PushState) { pushState = s; pushListeners.forEach(l => l()) }

async function refreshPush() {
  if (!supported()) {
    // iPhone дээр зөвхөн апп болгож суулгасны дараа push ажиллана
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    setPush(ios && 'serviceWorker' in navigator ? 'needs-install' : 'unsupported')
    return
  }
  if (Notification.permission === 'denied') { setPush('denied'); return }
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    let off = false
    try { off = localStorage.getItem(OFF_KEY) === '1' } catch {}
    // Зөвшөөрөлтэй, өөрөө унтраагаагүй бол чимээгүй дахин бүртгэнэ (апп шинэчлэгдсэн, бүртгэл устсан үед)
    if (!sub && Notification.permission === 'granted' && !off) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey()! }).catch(() => null)
    }
    if (sub && !off) { save(sub).catch(() => {}); setPush('on') } else setPush('off')
  } catch {
    setPush('off')
  }
}

async function enablePush(): Promise<boolean> {
  if (!supported()) return false
  setPush('loading')
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') { setPush(perm === 'denied' ? 'denied' : 'off'); return false }
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey()! })
    await save(sub)
    try { localStorage.removeItem(OFF_KEY) } catch {}
    setPush('on')
    return true
  } catch {
    setPush('off')
    return false
  }
}

async function disablePush() {
  setPush('loading')
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
      await sub.unsubscribe().catch(() => {})
    }
  } catch {}
  try { localStorage.setItem(OFF_KEY, '1') } catch {}
  setPush('off')
}

export function usePush() {
  const state = useSyncExternalStore(
    cb => { pushListeners.add(cb); return () => { pushListeners.delete(cb) } },
    () => pushState,
    () => 'loading' as PushState,
  )
  useEffect(() => { if (!started) { started = true; refreshPush() } }, [])
  return { state, enable: enablePush, disable: disablePush }
}

// "Дараа" дарсан бол 7 хоног асуухгүй; өөрөө унтраасан бол огт асуухгүй
export function shouldAskPush(): boolean {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'default') return false
    if (localStorage.getItem(OFF_KEY) === '1') return false
    const later = Number(localStorage.getItem(ASK_KEY) || 0)
    return Date.now() - later > 7 * 86_400_000
  } catch {
    return true
  }
}
export function askPushLater() {
  try { localStorage.setItem(ASK_KEY, String(Date.now())) } catch {}
}
