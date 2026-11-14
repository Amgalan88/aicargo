// Read-only suggestion loaders for staff comboboxes. Callers already sit behind admin auth.

export interface ComboOption {
  id: string
  label: string
  value: string
  hint?: string
}

interface UserRow { id: number; name: string; phone: string }
interface BranchRow { id: number; name: string; current?: boolean }

export async function suggestCustomers(q: string, signal: AbortSignal): Promise<ComboOption[]> {
  const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=1`, { signal })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  const users: UserRow[] = Array.isArray(data.users) ? data.users : []
  return users.slice(0, 8).map(u => ({
    id: String(u.id),
    label: u.name || u.phone,
    hint: u.phone,
    value: u.phone || u.name,
  }))
}

export async function suggestBranches(q: string, signal: AbortSignal): Promise<ComboOption[]> {
  const res = await fetch(`/api/admin/branches?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  const branches: BranchRow[] = Array.isArray(data.branches) ? data.branches : []
  return branches.slice(0, 8).map(b => ({
    id: String(b.id),
    label: b.name,
    hint: b.current ? 'Энэ салбар' : undefined,
    value: b.name,
  }))
}
