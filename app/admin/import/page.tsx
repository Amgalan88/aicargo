'use client'
import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'

interface Row { trackCode: string; phone?: string }
interface SearchResult {
  id: number; trackCode: string; status: string; phone: string | null
  createdAt: string; user?: { name: string; phone: string } | null
}

const PAGE_SIZE = 20
const COLS = 2
const ROWS = PAGE_SIZE / COLS  // 10 rows

function getStatusLabel(arrivedLabel?: string | null, ereemLabel?: string | null): Record<string, string> {
  return {
    EREEN_ARRIVED: ereemLabel || 'Эрээнд ирсэн',
    ARRIVED: arrivedLabel || 'Ирсэн',
    PICKED_UP: 'Авсан',
    REGISTERED: 'Бүртгүүлсэн',
  }
}

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [mode, setMode] = useState<'track' | 'track+phone'>('track')
  const [xlsxMsg, setXlsxMsg] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [duplicates, setDuplicates] = useState<string[]>([])
  const [error, setError] = useState('')
  const [lastAdded, setLastAdded] = useState('')

  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchPage, setSearchPage] = useState(1)
  const [searching, setSearching] = useState(false)
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null)
  const [ereemLabel, setEreemLabel] = useState<string | null>(null)
  const STATUS_LABEL = getStatusLabel(arrivedLabel, ereemLabel)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    loadList('', 1)
    fetch('/api/admin/settings').then(r => r.json()).then(d => { setArrivedLabel(d.arrivedLabel ?? null); setEreemLabel(d.ereemLabel ?? null) }).catch(() => {})
  }, [])

  async function loadList(q: string, pg: number) {
    setSearching(true)
    const res = await fetch(`/api/admin/ereen/recent?q=${encodeURIComponent(q)}&page=${pg}`)
    setSearching(false)
    if (res.ok) {
      const data = await res.json()
      setSearchResults(data.items)
      setSearchTotal(data.total)
      setSearchPage(data.page)
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    loadList(searchQ, 1)
  }

  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
        const rawParsed = data
          .map(row => {
            const col1 = String(row[1] ?? '').trim()
            const isPhone = /^\d{8}$/.test(col1)
            return {
              trackCode: String(row[0] ?? '').trim().toUpperCase(),
              phone: isPhone ? col1 : undefined,
            }
          })
          .filter(r => r.trackCode.length >= 4)
        if (rawParsed.length === 0) { setXlsxMsg('Трак код олдсонгүй'); return }

        // Detect within-file duplicates
        const seenInFile = new Set<string>()
        const inFileDupes: string[] = []
        const parsed = rawParsed.filter(r => {
          if (seenInFile.has(r.trackCode)) { inFileDupes.push(r.trackCode); return false }
          seenInFile.add(r.trackCode)
          return true
        })
        if (inFileDupes.length > 0) {
          setXlsxMsg(`⛔ Файл дотор давхардсан трак код байна: ${inFileDupes.join(', ')}`)
          return
        }

        // Check DB for already-EREEN_ARRIVED codes
        const codes = parsed.map(r => r.trackCode)
        let dbDupes: string[] = []
        try {
          const res = await fetch(`/api/admin/bulk-import?codes=${encodeURIComponent(codes.join(','))}`)
          if (res.ok) dbDupes = (await res.json()).duplicates ?? []
        } catch {}

        if (dbDupes.length > 0) {
          setXlsxMsg(`⛔ Аль хэдийн Эрээнд байна: ${dbDupes.join(', ')}`)
          return
        }

        setRows(prev => {
          const existing = new Set(prev.map(r => r.trackCode))
          const newRows = parsed.filter(r => !existing.has(r.trackCode))
          const skipped = parsed.length - newRows.length
          const next = [...prev, ...newRows]
          setPage(Math.ceil(next.length / PAGE_SIZE))
          setXlsxMsg(`✓ ${newRows.length} трак код нэмэгдлээ${skipped > 0 ? ` — ${skipped} давхардсан тул алгасав` : ''}`)
          return next
        })
      } catch { setXlsxMsg('Файл уншихад алдаа гарлаа') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const MIN_LEN = 4

  async function lookupPhone(trackCode: string) {
    if (!trackCode || trackCode.length < MIN_LEN) return
    try {
      const res = await fetch(`/api/admin/ereen/recent?q=${encodeURIComponent(trackCode)}`)
      if (!res.ok) return
      const data = await res.json()
      const match = data.items?.find((s: any) =>
        s.trackCode === trackCode.toUpperCase()
      )
      if (match) {
        const phone = match.user?.phone || match.phone || ''
        if (phone) setPhoneInput(phone)
      }
    } catch {}
  }

  async function addRow() {
    const code = input.trim().toUpperCase()
    if (!code) return
    if (code.length < MIN_LEN) {
      setLastAdded(`⚠ Трак код хэт богино байна (хамгийн багадаа ${MIN_LEN} тэмдэгт)`)
      return
    }
    if (rows.some(r => r.trackCode === code)) {
      setInput('')
      setPhoneInput('')
      setLastAdded(`⚠ ${code} аль хэдийн нэмэгдсэн`)
      return
    }
    // DB check
    try {
      const res = await fetch(`/api/admin/bulk-import?codes=${encodeURIComponent(code)}`)
      if (res.ok) {
        const { duplicates } = await res.json()
        if (duplicates?.includes(code)) {
          setLastAdded(`⛔ ${code} аль хэдийн Эрээнд байна`)
          return
        }
      }
    } catch {}
    const ph = mode === 'track+phone' ? phoneInput.trim() : undefined
    setRows(prev => {
      const next = [...prev, { trackCode: code, phone: ph || undefined }]
      setPage(Math.ceil(next.length / PAGE_SIZE))
      return next
    })
    setLastAdded(ph ? `${code} — ${ph}` : code)
    setInput('')
    setPhoneInput('')
    setDone(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function removeRow(idx: number) {
    setRows(prev => {
      const next = prev.filter((_, i) => i !== idx)
      const maxPage = Math.max(1, Math.ceil(next.length / PAGE_SIZE))
      setPage(p => Math.min(p, maxPage))
      return next
    })
  }

  async function save() {
    if (rows.length === 0) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows.map(r => ({ trackCode: r.trackCode, status: 'EREEN_ARRIVED', phone: r.phone })) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
      setDone(data.count)
      setDuplicates(data.duplicates ?? [])
      setRows([])
      setLastAdded('')
      setPage(1)
    } catch {
      setError('Холболтын алдаа гарлаа')
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function deleteAll() {
    setDeleteLoading(true)
    const res = await fetch('/api/admin/ereen', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: deleteInput }),
    })
    setDeleteLoading(false)
    if (res.ok) {
      const d = await res.json()
      setDeleteMsg(`✓ ${d.count} бараа устгагдлаа`)
      setDeleteModal(false)
      setDeleteInput('')
      loadList('', 1)
    } else {
      setDeleteMsg('Алдаа гарлаа')
    }
  }

  return (
    <>
    <div className="page-wide" style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Эрээнд ирсэн — бараа оруулах</h1>
        <button onClick={() => { setDeleteModal(true); setDeleteInput(''); setDeleteMsg('') }} style={{
          background: 'none', border: '1px solid var(--danger)', borderRadius: 'var(--radius)',
          color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem', padding: '0.3rem 0.75rem', fontFamily: 'inherit',
        }}>
          Бүгдийг устгах
        </button>
      </div>
      {deleteMsg && <p style={{ fontSize: '0.82rem', color: deleteMsg.startsWith('✓') ? 'var(--green)' : 'var(--danger)', marginBottom: '0.75rem' }}>{deleteMsg}</p>}

      {/* Excel upload */}
      <div style={{ marginBottom: '1rem' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcel} style={{ display: 'none' }} />
        <button onClick={() => {
          alert('Excel форматын дагуу оруулна уу:\n\nA багана — Трак код\nB багана — Утасны дугаар (заавал биш, 8 оронтой)\n\nЖишээ:\nYT8853194305559  99001122\nJT5467125484093')
          fileRef.current?.click()
        }} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--surface)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)', padding: '0.55rem 1rem',
          cursor: 'pointer', fontSize: '0.83rem', color: 'var(--muted)', fontFamily: 'inherit',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Excel файл оруулах (.xlsx, .xls, .csv)
        </button>
        {xlsxMsg && <p style={{ fontSize: '0.78rem', marginTop: '0.4rem', color: xlsxMsg.startsWith('✓') ? 'var(--accent)' : 'var(--danger)' }}>{xlsxMsg}</p>}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
        {(['track', 'track+phone'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '0.3rem 0.85rem', borderRadius: '100px', fontSize: '0.78rem', fontFamily: 'inherit',
            border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
            background: mode === m ? 'var(--accent-light)' : 'var(--surface)',
            color: mode === m ? 'var(--accent)' : 'var(--muted)',
            cursor: 'pointer', fontWeight: mode === m ? 700 : 400,
          }}>
            {m === 'track' ? 'Трак код' : 'Трак + Утас'}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: mode === 'track+phone' ? 'wrap' : 'nowrap' }}>
        <input
          ref={inputRef}
          className="input"
          placeholder="Трак код уншуулах эсвэл бичих..."
          value={input}
          onChange={e => { setInput(e.target.value); setLastAdded('') }}
          onPaste={e => {
            const text = e.clipboardData.getData('text')
            if (!text.includes('\n')) return // single line — let default paste handle
            e.preventDefault()
            const lines = text.split(/\r?\n/)
            const codes = lines
              .map(l => l.replace(/^\s*\d+[.、)]\s*/, '').trim().toUpperCase()) // strip "1." "2、" etc
              .filter(l => l.length >= MIN_LEN && /^[A-Z0-9\-]{4,}$/.test(l)) // valid track codes (letters+digits or pure numeric 4+)
            if (codes.length === 0) return
            setRows(prev => {
              const existing = new Set(prev.map(r => r.trackCode))
              const newRows = codes
                .filter(c => !existing.has(c))
                .map(c => ({ trackCode: c }))
              const next = [...prev, ...newRows]
              setPage(Math.ceil(next.length / PAGE_SIZE))
              setLastAdded(`✓ ${newRows.length} трак код нэмэгдлээ`)
              return next
            })
            setInput('')
            setDone(null)
          }}
          onKeyDown={async e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (mode === 'track+phone' && input.trim().length >= MIN_LEN) {
                await lookupPhone(input.trim())
                phoneRef.current?.focus()
              } else {
                addRow()
              }
            }
          }}
          autoComplete="off"
          style={{
            minWidth: 0, flex: 1,
            borderColor: input.trim().length > 0 && input.trim().length < MIN_LEN ? 'var(--danger)' : undefined,
          }}
        />
        {mode === 'track+phone' && (
          <input
            ref={phoneRef}
            className="input"
            placeholder="Утасны дугаар"
            value={phoneInput}
            maxLength={8}
            onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
            autoComplete="off"
            style={{ minWidth: 0, flex: '0 0 140px' }}
          />
        )}
        <button
          className="btn"
          onClick={addRow}
          disabled={input.trim().length > 0 && input.trim().length < MIN_LEN}
          style={{ flexShrink: 0 }}
        >
          Нэмэх
        </button>
      </div>

      <p style={{ fontSize: '0.78rem', minHeight: '1.2em', marginBottom: '1rem', color: lastAdded.startsWith('⚠') ? 'var(--danger)' : 'var(--muted)' }}>
        {lastAdded && !lastAdded.startsWith('⚠') ? `✓ Нэмэгдлээ: ${lastAdded}` : lastAdded}
      </p>

      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {done !== null && (
        <div className="card" style={{ marginBottom: '1.2rem' }}>
          <div className="card-row">
            <span className="msg-success" style={{ margin: 0 }}>Амжилттай хадгалагдлаа — {done} бараа</span>
          </div>
          {duplicates.length > 0 && (
            <div className="card-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 600 }}>
                ⚠ {duplicates.length} бараа аль хэдийн Эрээнд статустай байсан:
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                {duplicates.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Нийт {rows.length} бараа</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => { setRows([]); setPage(1); inputRef.current?.focus() }} style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
                padding: '0.4rem 0.85rem', fontSize: '0.78rem', color: 'var(--muted)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Цэвэрлэх
              </button>
              <button className="btn" onClick={save} disabled={saving} style={{ fontSize: '0.83rem', padding: '0.45rem 1.1rem' }}>
                {saving ? '...' : `Хадгалах (${rows.length})`}
              </button>
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden', marginBottom: '0.75rem' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              minHeight: `${ROWS * 45}px`,
            }}>
              {Array.from({ length: ROWS }, (_, row) =>
                Array.from({ length: COLS }, (_, col) => {
                  const i = col * ROWS + row          // column-first
                  const globalIdx = (page - 1) * PAGE_SIZE + i
                  const r = paged[i]
                  const isLastRow = row === ROWS - 1
                  const isLastCol = col === COLS - 1
                  return (
                    <div key={`${row}-${col}`} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.55rem 0.85rem',
                      borderBottom: !isLastRow ? '1px solid var(--border)' : 'none',
                      borderRight: !isLastCol ? '1px solid var(--border)' : 'none',
                      minHeight: 45,
                    }}>
                      {r ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--muted)', flexShrink: 0 }}>{globalIdx + 1}</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.trackCode}</span>
                            {r.phone && <span style={{ fontSize: '0.72rem', color: 'var(--accent)', flexShrink: 0 }}>{r.phone}</span>}
                          </div>
                          <button onClick={() => removeRow(globalIdx)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--muted)', fontSize: '0.8rem', padding: '0.1rem 0.25rem',
                            borderRadius: '4px', lineHeight: 1, flexShrink: 0,
                          }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                          >✕</button>
                        </>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'space-between' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
                height: 32, padding: '0 0.75rem', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--surface)',
                cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1,
                fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
              }}>‹ Өмнөх</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {(() => {
                  const pages: (number | '...')[] = []
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i)
                  } else {
                    pages.push(1)
                    if (page > 3) pages.push('...')
                    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
                    if (page < totalPages - 2) pages.push('...')
                    pages.push(totalPages)
                  }
                  return pages.map((p, i) =>
                    p === '...' ? (
                      <span key={`e${i}`} style={{ fontSize: '0.78rem', color: 'var(--muted)', padding: '0 0.2rem' }}>…</span>
                    ) : (
                      <button key={p} onClick={() => setPage(p)} style={{
                        width: 32, height: 32, borderRadius: '8px',
                        border: '1px solid',
                        borderColor: p === page ? 'var(--accent)' : 'var(--border)',
                        background: p === page ? 'var(--accent)' : 'var(--surface)',
                        color: p === page ? '#fff' : 'var(--text)',
                        cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                      }}>{p}</button>
                    )
                  )
                })()}
              </div>

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
                height: 32, padding: '0 0.75rem', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--surface)',
                cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1,
                fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
              }}>Дараах ›</button>
            </div>
          )}
        </>
      )}

      {/* Search existing */}
      <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Бүртгэгдсэн бараа хайх</h2>
          {searchResults !== null && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Нийт {searchTotal}</span>
          )}
        </div>
        <form onSubmit={search} style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
          <input className="input" placeholder="Утасны дугаар эсвэл трак код"
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            style={{ minWidth: 0 }} />
          <button className="btn" type="submit" disabled={searching} style={{ flexShrink: 0 }}>
            {searching ? '...' : 'Хайх'}
          </button>
        </form>

        {searchResults !== null && (
          searchResults.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Олдсонгүй.</p>
            : <>
                <div className="card" style={{ overflow: 'hidden', marginBottom: '0.75rem' }}>
                  {searchResults.map((s, i) => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.55rem 1rem', gap: '0.5rem',
                      borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: '0.83rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.trackCode}</span>
                        <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.user ? s.user.phone : (s.phone || '—')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {(() => { const d = new Date(s.createdAt); return `${d.getMonth()+1}.${String(d.getDate()).padStart(2,'0')}` })()}
                        </span>
                        <span style={{
                          fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '100px',
                          background: s.status === 'EREEN_ARRIVED' ? 'var(--surface2)' : s.status === 'ARRIVED' ? '#fff3e6' : 'var(--surface2)',
                          color: s.status === 'ARRIVED' ? 'var(--accent)' : 'var(--muted)',
                          border: '1px solid var(--border)',
                        }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                        {s.status === 'EREEN_ARRIVED' && (
                          <button
                            onClick={async () => {
                              if (!confirm(`"${s.trackCode}" устгах уу?`)) return
                              const res = await fetch('/api/admin/ereen/recent', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: s.id }),
                              })
                              if (res.ok) loadList(searchQ, searchPage)
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', padding: '0.1rem 0.25rem', lineHeight: 1 }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
                            title="Устгах"
                          >✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {searchTotal > 20 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <button onClick={() => loadList(searchQ, searchPage - 1)} disabled={searchPage <= 1} style={{
                      height: 30, padding: '0 0.65rem', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--surface)', cursor: searchPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: searchPage <= 1 ? 0.4 : 1, fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
                    }}>‹</button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{searchPage} / {Math.ceil(searchTotal / 20)}</span>
                    <button onClick={() => loadList(searchQ, searchPage + 1)} disabled={searchPage >= Math.ceil(searchTotal / 20)} style={{
                      height: 30, padding: '0 0.65rem', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--surface)', cursor: searchPage >= Math.ceil(searchTotal / 20) ? 'not-allowed' : 'pointer',
                      opacity: searchPage >= Math.ceil(searchTotal / 20) ? 0.4 : 1, fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'inherit',
                    }}>›</button>
                  </div>
                )}
              </>
        )}
      </div>
    </div>

    {deleteModal && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
        <div className="card" style={{ width: '100%', maxWidth: 400, padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: 'var(--danger)' }}>⚠ Бүх өгөгдөл устгагдана</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
            Эрээнд ирсэн төлөвтэй <strong style={{ color: 'var(--text)' }}>бүх бараа</strong> бүрмөсөн устгагдана. Энэ үйлдлийг буцааж болохгүй.
          </p>
          <p style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>
            Үргэлжлүүлэхийн тулд <strong>УСТГАХ</strong> гэж бичнэ үү:
          </p>
          <input
            className="input"
            placeholder="УСТГАХ"
            value={deleteInput}
            onChange={e => setDeleteInput(e.target.value)}
            style={{ marginBottom: '1rem', borderColor: deleteInput === 'УСТГАХ' ? 'var(--danger)' : undefined }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              className="btn"
              onClick={deleteAll}
              disabled={deleteInput !== 'УСТГАХ' || deleteLoading}
              style={{ flex: 1, background: 'var(--danger)', borderColor: 'var(--danger)', opacity: deleteInput === 'УСТГАХ' ? 1 : 0.4 }}
            >
              {deleteLoading ? 'Устгаж байна...' : 'Устгах'}
            </button>
            <button onClick={() => setDeleteModal(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}>
              Болих
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
