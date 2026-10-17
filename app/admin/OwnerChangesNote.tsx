// Excel импортын дараа: сайт дээр өөр хүн бүртгүүлсэн байсан ч Excel-ийн утсаар эзэн нь солигдсон ачаа
// (lib/import-owner). Excel-д утас буруу бичигдсэн бол админ эндээс шууд харж засна.
export interface OwnerChange { trackCode: string; from: string; to: string }

export default function OwnerChangesNote({ changes, count }: { changes: OwnerChange[]; count: number }) {
  if (!count) return null
  return (
    <div style={{ marginTop: '0.6rem', padding: '0.7rem 0.85rem', borderRadius: 'var(--radius)', border: '1px solid color-mix(in srgb, var(--yellow) 40%, transparent)', background: 'color-mix(in srgb, var(--yellow) 8%, var(--surface))' }}>
      <p style={{ fontSize: '0.8rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
        ℹ {count} ачааны эзэн Excel-ийн утсаар солигдлоо
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 0.45rem', lineHeight: 1.5 }}>
        Эдгээр кодыг сайт дээр өөр хүн бүртгүүлсэн байсан. Excel-д утас буруу бичигдсэн бол тухайн ачааны утсыг засна уу.
      </p>
      <div style={{ maxHeight: 180, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.74rem', lineHeight: 1.7 }}>
        {changes.map(c => (
          <div key={c.trackCode}>{c.trackCode}: <span style={{ color: 'var(--muted)' }}>{c.from}</span> → <b>{c.to}</b></div>
        ))}
        {count > changes.length && <div style={{ color: 'var(--muted)' }}>… дахиад {count - changes.length}</div>}
      </div>
    </div>
  )
}
