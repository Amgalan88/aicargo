'use client'
// Админы туслах: дэлгэцийн буланд зогсдог дүр. Дарахад бэлэн асуулт, команд, хуудасны тайлбар өгнө.
// Эхний хувилбар AI-гүй: тоог /api/admin/assistant DB-ээс гаргана. Анхааруулгыг хуудсууд assistantSay()-аар илгээнэ.
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowRight, X } from 'lucide-react'
import AssistantCharacter, { type AssistantPose } from './AssistantCharacter'
import { pageHelp } from '@/lib/assistant-pages'
import { ASSISTANT_EVENT, type AssistantSignal } from '@/lib/assistant-bus'
import type { AssistantItem } from '@/lib/assistant'

type Prefs = { intro?: boolean; sleep?: boolean; hidden?: boolean; quiet?: boolean }
type Action = { label: string; run: () => void }
type Msg = { q?: string; text: string; items?: AssistantItem[]; note?: string; loading?: boolean; warn?: boolean; actions?: Action[] }
type QuickKey = 'today' | 'waiting' | 'top' | 'page'

const QUICK: { key: QuickKey; label: string }[] = [
  { key: 'today', label: 'Өнөөдрийн тойм' },
  { key: 'waiting', label: '7 хоногоос дээш аваагүй' },
  { key: 'top', label: 'Шилдэг 10 хэрэглэгч' },
  { key: 'page', label: 'Энэ хуудсыг тайлбарла' },
]
const UNKNOWN = 'Одоохондоо доорх асуултуудад хариулна. Чөлөөт асуултад хариулах боломж удахгүй нэмэгдэнэ.'

function readPrefs(key: string): Prefs {
  try { return JSON.parse(localStorage.getItem(key) || '{}') ?? {} } catch { return {} }
}

export default function AdminAssistant({ userId, isOwner, cargoName }: { userId: number; isOwner: boolean; cargoName: string }) {
  const pathname = usePathname()
  const storeKey = `aicargo-asst-${userId}`
  const [ready, setReady] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>({})
  const prefsRef = useRef<Prefs>({})
  const [open, setOpen] = useState(false)
  const [forceShow, setForceShow] = useState(false)
  const [pose, setPose] = useState<AssistantPose>('idle')
  const [msg, setMsg] = useState<Msg | null>(null)
  const [step, setStep] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const run = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const intro = [
    { title: 'Сайн байна уу! Би танай каргоны AI туслах.', lines: [isOwner ? `${cargoName ? cargoName + ' — ' : ''}таны болон ажилтнуудын админы ажлыг хөнгөвчлөхөөр ирлээ.` : 'Таны өдөр тутмын ажлыг хөнгөвчлөхөөр ирлээ.'] },
    { title: 'Би юу чадах вэ', lines: ['Өнөөдөр хэдэн ачаа ирж, олгосныг хэлнэ', 'Удаан аваагүй ачаа, хамгийн их төлсөн хэрэглэгчдийг гаргана', 'Хуудас бүрийг яаж ашиглахыг тайлбарлана', 'Бүртгэлийн алдааг анхааруулна'] },
    { title: 'Миний дүрэм', lines: ['Зөвхөн танай каргоны мэдээллийг харна', 'Юуг ч өөрөө өөрчлөхгүй', 'Мэдэхгүй зүйлээ мэдэхгүй гэнэ'] },
    { title: 'Надтай ингэж харилцана', lines: ['Над дээр дарж асуултаа сонгоно', '«Унт» гэвэл унтана, дарвал сэрнэ', '«Нуугд» гэвэл буланд жижиг товч үлдэнэ', ...(isOwner ? ['Тохиргоо → «AI туслах»-аас бүх админд унтрааж болно'] : [])] },
  ]

  const savePrefs = useCallback((patch: Prefs) => {
    const next = { ...prefsRef.current, ...patch }
    prefsRef.current = next
    setPrefs(next)
    try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch {}
  }, [storeKey])

  const restPose = (): AssistantPose => (prefsRef.current.sleep ? 'sleep' : 'idle')
  const later = (ms: number, fn: () => void) => { clearTimeout(timer.current); const my = run.current; timer.current = setTimeout(() => { if (my === run.current) fn() }, ms) }

  function speak(m: Msg, first: AssistantPose = m.warn ? 'warn' : 'talk') {
    run.current++
    setMsg(m); setStep(null); setOpen(true)
    setPose(first)
    const ms = Math.min(3200, Math.max(900, m.text.length * 35))
    later(ms, () => setPose(m.warn ? 'warn' : restPose()))
  }

  function close() {
    run.current++; clearTimeout(timer.current)
    setOpen(false); setStep(null); setForceShow(false)
    setPose(restPose())
  }

  function greet(text: string) {
    savePrefs({ sleep: false, hidden: false })
    speak({ text }, 'hello')
  }

  function startIntro(i = 0) {
    savePrefs({ sleep: false, hidden: false })
    run.current++
    setOpen(true); setMsg(null); setStep(i)
    setPose(i === 0 ? 'hello' : 'talk')
    later(i === 0 ? 2400 : 1600, () => setPose(restPose()))
  }

  function finishIntro() {
    savePrefs({ intro: true })
    speak({ text: 'Бэлэн боллоо! Асуух зүйл гарвал над дээр дараарай.' }, 'happy')
  }

  async function ask(key: QuickKey) {
    const label = QUICK.find(x => x.key === key)!.label
    savePrefs({ sleep: false })
    if (key === 'page') { speak({ q: label, text: pageHelp(pathname) }); return }
    const my = ++run.current
    setOpen(true); setStep(null)
    setMsg({ q: label, text: '', loading: true }); setPose('think')
    const started = Date.now()
    let next: Msg
    try {
      const res = await fetch(`/api/admin/assistant?q=${key}`)
      const data = await res.json().catch(() => ({}))
      next = res.ok ? { q: label, text: data.text, items: data.items, note: data.note } : { q: label, text: data.error || 'Алдаа гарлаа. Дахин оролдоно уу.' }
    } catch {
      next = { q: label, text: 'Интернэт холболтоо шалгаад дахин оролдоно уу.' }
    }
    await new Promise(r => setTimeout(r, Math.max(0, 600 - (Date.now() - started))))
    if (my === run.current) speak(next)
  }

  function sleep() { savePrefs({ sleep: true }); close(); setPose('sleep') }
  function hide() { savePrefs({ hidden: true }); close() }
  function setQuiet(on: boolean) {
    savePrefs({ quiet: on })
    speak({ text: on ? 'Чимээгүй горимд орлоо. Асуувал л хариулна, анхааруулга өгсөөр байна.' : 'Ердийн горимд буцлаа.' })
  }

  function command(raw: string) {
    const t = raw.trim().toLowerCase()
    if (!t) return
    if (/^унт/.test(t)) return sleep()
    if (/^(сэр|бос)/.test(t)) return greet('Сэрчихсэн байна! Юугаар туслах вэ?')
    if (/^нуу/.test(t)) return hide()
    if (/^чимээгүй/.test(t)) return setQuiet(true)
    if (/^(ердийн|чимээтэй)/.test(t)) return setQuiet(false)
    if (/танилцуул/.test(t)) return startIntro(0)
    if (/тойм|өнөөдөр/.test(t)) return void ask('today')
    if (/аваагүй|удсан|хүлээгд/.test(t)) return void ask('waiting')
    if (/шилдэг|их төлсөн|топ|top/.test(t)) return void ask('top')
    if (/тайлбарла|хуудас/.test(t)) return void ask('page')
    speak({ q: raw.trim(), text: UNKNOWN })
  }

  function onCharacter() {
    if (prefsRef.current.sleep) return greet('Сэрлээ! Юугаар туслах вэ?')
    if (open) return close()
    greet('Сайн байна уу! Юугаар туслах вэ?')
  }

  // Эхлэл: хадгалсан тохиргоо (админ бүрт тусдаа), анх удаа бол танилцуулга
  useEffect(() => {
    const p = readPrefs(storeKey)
    prefsRef.current = p
    setPrefs(p)
    setReady(true)
    if (!p.intro) { setOpen(true); setStep(0); setPose('hello'); later(2400, () => setPose('idle')) }
    else setPose(p.sleep ? 'sleep' : 'idle')
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey])

  // Хуудсуудын анхааруулга: унтсан, нуугдсан, чимээгүй байсан ч гарна (нуусныг түр гаргана)
  useEffect(() => {
    function onSignal(e: Event) {
      const s = (e as CustomEvent<AssistantSignal>).detail
      if (!s?.text) return
      const p = prefsRef.current
      if (s.kind === 'info' && (p.quiet || p.sleep || p.hidden)) return
      if (p.hidden) setForceShow(true)
      speak({ text: s.text, warn: s.kind === 'warn', actions: [{ label: 'Ойлголоо', run: close }] })
    }
    window.addEventListener(ASSISTANT_EVENT, onSignal)
    return () => window.removeEventListener(ASSISTANT_EVENT, onSignal)
  })

  // Хаалттай, сул үед хааяа гараа даллана
  useEffect(() => {
    if (open || prefs.quiet || prefs.sleep || prefs.hidden) return
    const id = setInterval(() => {
      setPose(p => (p === 'idle' ? 'hello' : p))
      setTimeout(() => setPose(p => (p === 'hello' ? 'idle' : p)), 1600)
    }, 15000)
    return () => clearInterval(id)
  }, [open, prefs.quiet, prefs.sleep, prefs.hidden])

  if (!ready) return null
  const visible = !prefs.hidden || forceShow

  if (!visible) {
    return (
      <button type="button" className="asst-tab" onClick={() => greet('Буцаад ирлээ! Юугаар туслах вэ?')}>
        <i aria-hidden="true" />Туслах
      </button>
    )
  }

  const introStep = step != null ? intro[step] : null
  return (
    <>
      {open && (
        <div className="asst-bubble" data-warn={msg?.warn ? 'true' : undefined} role="dialog" aria-label="Туслах">
          <div className="asst-head">
            <b>Туслах</b>
            {step != null && <span className="asst-steps" aria-label={`${step + 1}/${intro.length}`}>{intro.map((_, k) => <i key={k} className={k === step ? 'on' : ''} />)}</span>}
            <button type="button" className="asst-x" onClick={close} aria-label="Хаах"><X size={16} /></button>
          </div>

          <div className="asst-body" aria-live="polite">
            {introStep ? (
              <div className="asst-intro">
                <b>{introStep.title}</b>
                {introStep.lines.length === 1 ? <p className="asst-text">{introStep.lines[0]}</p> : <ul>{introStep.lines.map(l => <li key={l}>{l}</li>)}</ul>}
              </div>
            ) : msg ? (
              <>
                {msg.q && <p className="asst-q">Та: {msg.q}</p>}
                {msg.loading ? <span className="asst-typing" aria-label="Бодож байна"><i /><i /><i /></span> : <p className="asst-text">{msg.text}</p>}
                {msg.items && msg.items.length > 0 && (
                  <ul className="asst-list">
                    {msg.items.map((it, i) => <li key={i}><b>{it.title}</b>{it.value && <span>{it.value}</span>}<small>{it.sub}</small></li>)}
                  </ul>
                )}
                {msg.note && <p className="asst-note">{msg.note}</p>}
              </>
            ) : null}
          </div>

          {introStep ? (
            <div className="asst-acts">
              {step! < intro.length - 1
                ? <><button type="button" className="btn btn-sm" onClick={() => startIntro(step! + 1)}>Дараах</button><button type="button" className="btn-ghost btn-sm" onClick={finishIntro}>Алгасах</button></>
                : <button type="button" className="btn btn-sm" onClick={finishIntro}>Эхлэх</button>}
            </div>
          ) : msg?.actions ? (
            <div className="asst-acts">{msg.actions.map(a => <button key={a.label} type="button" className="btn btn-sm" onClick={a.run}>{a.label}</button>)}</div>
          ) : (
            <>
              {!prefs.quiet && (
                <div className="asst-chips">
                  {QUICK.map(x => <button key={x.key} type="button" className="asst-chip" onClick={() => void ask(x.key)}>{x.label}</button>)}
                </div>
              )}
              <form className="asst-ask" onSubmit={e => { e.preventDefault(); command(input); setInput('') }}>
                <input id="asst-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Асуулт эсвэл команд…" autoComplete="off" aria-label="Асуулт эсвэл команд" />
                <button type="submit" className="asst-send" aria-label="Илгээх"><ArrowRight size={16} /></button>
              </form>
              <div className="asst-cmds">
                <button type="button" className="asst-chip" onClick={sleep}>Унт</button>
                <button type="button" className="asst-chip" onClick={hide}>Нуугд</button>
                <button type="button" className="asst-chip" onClick={() => setQuiet(!prefs.quiet)}>{prefs.quiet ? 'Ердийн горим' : 'Чимээгүй'}</button>
                <button type="button" className="asst-chip" onClick={() => startIntro(0)}>Танилцуулга</button>
              </div>
            </>
          )}
        </div>
      )}
      <button type="button" className="asst-btn" onClick={onCharacter} aria-label={open ? 'Туслахыг хаах' : 'Туслахыг нээх'} title={prefs.sleep ? 'Унтаж байна, дарвал сэрнэ' : 'Туслах'}>
        <AssistantCharacter pose={pose} />
      </button>
    </>
  )
}
