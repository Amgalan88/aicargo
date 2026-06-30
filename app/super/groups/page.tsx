'use client'
import { useState, useEffect } from 'react'

interface Cargo { id: number; name: string; slug: string; logoUrl: string | null; notificationsEnabled: boolean }
interface Group { id: number; name: string; cargos: Cargo[] }

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [allCargos, setAllCargos] = useState<Cargo[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCargoIds, setEditCargoIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/super/groups').then(r => r.json()),
      fetch('/api/super/cargos').then(r => r.json()),
    ]).then(([g, c]) => {
      setGroups(g)
      setAllCargos(c)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  async function createGroup() {
    if (!newName.trim()) return
    setCreating(true)
    await fetch('/api/super/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    setNewName('')
    setCreating(false)
    load()
  }

  function startEdit(g: Group) {
    setEditId(g.id)
    setEditName(g.name)
    setEditCargoIds(g.cargos.map(c => c.id))
  }

  async function saveEdit(id: number) {
    setSaving(true)
    await fetch(`/api/super/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, cargoIds: editCargoIds }),
    })
    setSaving(false)
    setEditId(null)
    load()
  }

  async function deleteGroup(id: number) {
    if (!confirm('Группийг устгах уу? Карго-нууд групп-аас гарна.')) return
    await fetch(`/api/super/groups/${id}`, { method: 'DELETE' })
    load()
  }

  function toggleCargo(id: number) {
    setEditCargoIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const groupedCargoIds = groups.flatMap(g => g.cargos.map(c => c.id))

  const td: React.CSSProperties = { padding: '0.4rem 0.6rem', fontSize: '0.82rem' }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Карго группүүд</h1>
      </div>

      {/* Create new group */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Шинэ групп нэр... (жишээ: Эрээн агуулах 1)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createGroup()}
          style={{ flex: 1 }}
        />
        <button className="btn" onClick={createGroup} disabled={creating || !newName.trim()} style={{ flexShrink: 0 }}>
          {creating ? '...' : '+ Нэмэх'}
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : groups.length === 0 ? (
        <p className="empty">Групп байхгүй байна.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {groups.map(g => (
            <div key={g.id} className="card" style={{ padding: '1.1rem 1.25rem' }}>
              {editId === g.id ? (
                /* Edit mode */
                <>
                  <input
                    className="input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{ marginBottom: '0.9rem' }}
                  />
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Карго сонгох:</p>
                  <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.9rem' }}>
                    {allCargos.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={editCargoIds.includes(c.id)}
                          onChange={() => toggleCargo(c.id)}
                        />
                        {c.logoUrl && <img src={c.logoUrl} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 3 }} />}
                        <span>{c.name}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{c.slug}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" onClick={() => saveEdit(g.id)} disabled={saving} style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }}>
                      {saving ? 'Хадгалж...' : 'Хадгалах'}
                    </button>
                    <button onClick={() => setEditId(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 'var(--radius)', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                      Болих
                    </button>
                  </div>
                </>
              ) : (
                /* View mode */
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>{g.name}</div>
                    {g.cargos.length === 0 ? (
                      <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Карго байхгүй</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {g.cargos.map(c => (
                          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}>
                            {c.logoUrl && <img src={c.logoUrl} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    {g.cargos.length > 0 && (() => {
                      const allOn = g.cargos.every(c => c.notificationsEnabled)
                      return (
                        <button
                          onClick={async () => {
                            await fetch(`/api/super/groups/${g.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ notificationsEnabled: !allOn }),
                            })
                            load()
                          }}
                          style={{
                            background: allOn ? 'rgba(34,197,94,0.12)' : 'none',
                            border: `1px solid ${allOn ? '#22c55e' : 'var(--border)'}`,
                            color: allOn ? '#22c55e' : 'var(--muted)',
                            borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem',
                            cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'inherit',
                          }}
                        >
                          {allOn ? '🔔 Мэдэгдэл: Тийм' : '🔕 Мэдэгдэл: Үгүй'}
                        </button>
                      )
                    })()}
                    <button onClick={() => startEdit(g)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                      Засах
                    </button>
                    <button onClick={() => deleteGroup(g.id)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--danger)', borderRadius: 'var(--radius)', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                      Устгах
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ungrouped cargos */}
      {!loading && (
        <div style={{ marginTop: '2rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>Группгүй карго ({allCargos.filter(c => !groupedCargoIds.includes(c.id)).length})</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {allCargos.filter(c => !groupedCargoIds.includes(c.id)).map(c => (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                {c.logoUrl && <img src={c.logoUrl} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
