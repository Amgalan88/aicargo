import type { ContractBody, ContractStatus } from '@/lib/contract'
import { STATUS_INFO, BLANK, EVENT_LABELS, formatDateTime } from '@/lib/contract'

// Мөр бүрийн монгол текст, доор нь хятад орчуулга — PDF-тэй ижил бүтэц
export function ContractDocument({ body, contractNo, maxHeight }: { body: ContractBody; contractNo: string; maxHeight?: number | string }) {
  return (
    <div className="cdoc" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <style>{CSS}</style>
      <div className="cdoc-no">Гэрээ № / 协议编号: {contractNo}</div>
      <h2 className="cdoc-title">{body.titleMn}</h2>
      <div className="cdoc-title-cn">{body.titleCn}</div>
      {body.clauses.map((c, i) => {
        if (c.kind === 'heading') {
          return (
            <div key={i} className="cdoc-h">
              <div>{highlight(c.mn)}</div>
              <div className="cn">{highlight(c.cn)}</div>
            </div>
          )
        }
        return (
          <div key={i} className={c.kind === 'clause' ? 'cdoc-c' : 'cdoc-t'}>
            {c.kind === 'clause' && <span className="no">{c.no}</span>}
            <div>
              <div>{highlight(c.mn)}</div>
              <div className="cn">{highlight(c.cn)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Бөглөгдөөгүй талбарыг тодруулна
function highlight(text: string) {
  if (!text.includes(BLANK)) return text
  return text.split(BLANK).flatMap((part, i) => i === 0 ? [part] : [<mark key={i} className="cdoc-blank">{BLANK}</mark>, part])
}

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_INFO[status as ContractStatus] ?? { label: status, color: '#78716c' }
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      color: info.color, background: `color-mix(in srgb, ${info.color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${info.color} 35%, transparent)`,
      borderRadius: 100, padding: '0.15rem 0.6rem',
    }}>{info.label}</span>
  )
}

export interface ContractEventRow {
  id: number
  actorName: string
  action: string
  detail: string | null
  createdAt: string
}

export function ContractTimeline({ events }: { events: ContractEventRow[] }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {events.map((e, i) => (
        <li key={e.id} style={{ display: 'flex', gap: '0.7rem', paddingBottom: i === events.length - 1 ? 0 : '0.8rem', position: 'relative' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0, zIndex: 1 }} />
          {i < events.length - 1 && (
            <span style={{ position: 'absolute', left: 4, top: 14, bottom: 0, width: 2, background: 'var(--border)' }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{EVENT_LABELS[e.action] ?? e.action}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{e.actorName} · {formatDateTime(e.createdAt)}</div>
            {e.detail && <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{e.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

const CSS = `
.cdoc { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem 1.6rem;
  font-size: 0.86rem; line-height: 1.65; color: var(--text); }
.cdoc-no { font-size: 0.72rem; color: var(--muted); margin-bottom: 0.9rem; }
.cdoc-title { text-align: center; font-size: 1.05rem; font-weight: 800; margin: 0; letter-spacing: 0.2px; }
.cdoc-title-cn { text-align: center; color: var(--muted); font-weight: 700; margin: 0.1rem 0 1.2rem; }
.cdoc .cn { color: var(--muted); font-size: 0.82rem; }
.cdoc-c .cn, .cdoc-t .cn { text-align: left; }
.cdoc-h { text-align: center; font-weight: 700; margin: 1.1rem 0 0.4rem; }
.cdoc-c { display: grid; grid-template-columns: 2.4rem minmax(0, 1fr); gap: 0.2rem; margin-bottom: 0.55rem; text-align: justify; }
.cdoc-c .no { font-weight: 700; }
.cdoc-t { margin-bottom: 0.7rem; text-align: justify; }
.cdoc-blank { background: color-mix(in srgb, #f59e0b 30%, transparent); color: inherit; border-radius: 3px; padding: 0 2px; }
@media (max-width: 600px) { .cdoc { padding: 1rem; font-size: 0.82rem; } }
`
