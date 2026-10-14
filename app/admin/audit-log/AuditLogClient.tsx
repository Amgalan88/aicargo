'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { AUDIT_ACTIONS, auditLabel } from '@/lib/audit-actions'

type Role = 'owner' | 'staff' | 'ereen' | 'customer' | 'system' | 'removed'

interface LogItem {
  id: number
  userId: number
  userName: string
  role: Role
  me: boolean
  action: string
  detail: string | null
  createdAt: string
}
interface Person { userId: number; name: string; role: Role; me: boolean }
type Scope = 'important' | 'routine' | 'all'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'important', label: 'Чухал' },
  { key: 'routine', label: 'Өдөр тутмын' },
  { key: 'all', label: 'Бүгд' },
]
const ROLE_LABEL: Record<Role, string> = { owner: 'Эзэмшигч', staff: 'Ажилтан', ereen: 'Эрээний ажилтан', customer: 'Хэрэглэгч', system: 'Систем', removed: 'Устгагдсан' }

const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
const WEEKDAY = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба']
function dayTitle(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - x.getTime()) / 86_400_000)
  if (diff === 0) return 'Өнөөдөр'
  if (diff === 1) return 'Өчигдөр'
  return `${d.getMonth() + 1}/${d.getDate()} · ${WEEKDAY[d.getDay()]}${d.getFullYear() !== today.getFullYear() ? ` · ${d.getFullYear()}` : ''}`
}

export default function AuditLogClient() {
  const [scope, setScope] = useState<Scope>('important')
  const [user, setUser] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LogItem[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const reqId = useRef(0)

  const load = useCallback(async (pg: number) => {
    const id = ++reqId.current
    setLoading(true)
    const sp = new URLSearchParams({ scope, page: String(pg) })
    if (user) sp.set('user', String(user))
    if (query) sp.set('q', query)
    const d = await fetch(`/api/admin/audit-log?${sp}`).then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (id !== reqId.current) return // хуучин хүсэлтийн хариу
    setLoading(false)
    if (!d) return
    setItems(prev => (pg === 1 ? d.items : [...prev, ...d.items]))
    setTotal(d.total)
    setPage(pg)
    if (d.people) setPeople(d.people)
  }, [scope, user, query])

  useEffect(() => { load(1) }, [load])

  // Хайлт — бичиж дуусахыг 350мс хүлээнэ
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  // Өдрөөр бүлэглэнэ
  const groups: { title: string; rows: LogItem[] }[] = []
  for (const it of items) {
    const title = dayTitle(new Date(it.createdAt))
    const g = groups[groups.length - 1]
    if (g && g.title === title) g.rows.push(it)
    else groups.push({ title, rows: [it] })
  }
  const filtered = !!user || !!query || scope !== 'important'

  return (
    <div className="page-wide al-page">
      <div className="al-head">
        <h1 className="section-title" style={{ margin: 0 }}>Аудит лог</h1>
        <p>Хэн, юу, хэзээ хийснийг — эзэмшигч болон ажилтнуудын үйлдлийг ялгаж харна. Зөвхөн танд харагдана.</p>
      </div>

      <div className="al-bar">
        <div className="seg" role="tablist" aria-label="Үйлдлийн төрөл">
          {SCOPES.map(s => (
            <button key={s.key} type="button" role="tab" aria-selected={scope === s.key} className={scope === s.key ? 'on' : ''} onClick={() => setScope(s.key)}>{s.label}</button>
          ))}
        </div>
        <label className="al-search">
          <Search size={15} />
          <input className="input" placeholder="Трак код, утас, нэрээр хайх" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button type="button" aria-label="Цэвэрлэх" onClick={() => setQ('')}><X size={14} /></button>}
        </label>
      </div>

      {people.length > 1 && (
        <div className="al-people" role="group" aria-label="Хүнээр шүүх">
          <button type="button" className={`al-person${user === null ? ' on' : ''}`} onClick={() => setUser(null)}>Бүгд</button>
          {people.filter(p => p.role !== 'customer').map(p => (
            <button key={p.userId} type="button" className={`al-person${user === p.userId ? ' on' : ''}`} onClick={() => setUser(u => (u === p.userId ? null : p.userId))}>
              {p.me ? 'Би' : p.name}
              <small className={`al-role al-${p.role}`}>{ROLE_LABEL[p.role]}</small>
            </button>
          ))}
        </div>
      )}

      <p className="al-count">
        {loading && page === 1 ? 'Ачааллаж байна…' : `${total.toLocaleString('en-US')} бичлэг`}
        {scope === 'important' && !user && !query && <span> · бүртгэх, олгох зэрэг өдөр тутмын үйлдлийг "Өдөр тутмын"-оос харна</span>}
      </p>

      {!loading && items.length === 0 ? (
        <div className="empty"><p>{filtered ? 'Энэ шүүлтэд бичлэг алга.' : 'Түүх хоосон байна.'}</p></div>
      ) : (
        groups.map(g => (
          <section key={g.title} className="al-day">
            <h2>{g.title}</h2>
            <div className="card al-list">
              {g.rows.map(l => {
                const tone = AUDIT_ACTIONS[l.action]?.tone ?? 'muted'
                return (
                  <div key={l.id} className="al-row">
                    <span className={`al-dot al-t-${tone}`} aria-hidden />
                    <div className="al-main">
                      <div className="al-line">
                        <b className="al-act">{auditLabel(l.action)}</b>
                        <time>{hm(new Date(l.createdAt))}</time>
                      </div>
                      {l.detail && <p className="al-detail">{l.detail}</p>}
                      <div className="al-who">
                        {l.me ? 'Та' : l.userName}
                        {l.role !== 'owner' && <small className={`al-role al-${l.role}`}>{ROLE_LABEL[l.role]}</small>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      {items.length < total && (
        <button type="button" className="btn btn-ghost al-more" disabled={loading} onClick={() => load(page + 1)}>
          {loading ? 'Ачааллаж байна…' : `Цааш үзэх (${(total - items.length).toLocaleString('en-US')})`}
        </button>
      )}
    </div>
  )
}
